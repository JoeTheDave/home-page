// Runs against a scratch database (DATABASE_URL) — never point this at prod.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import prisma from "./prisma.js";
import { ORPHAN_GRACE_MS, sweepOrphanImages } from "./images.js";

const old = new Date(Date.now() - ORPHAN_GRACE_MS - 60_000);
const created: string[] = [];

async function makeImage(key: string, lastTouchedAt: Date) {
  const image = await prisma.image.create({
    data: { url: `https://bucket.test/${key}`, key, lastTouchedAt },
  });
  created.push(image.id);
  return image;
}

after(async () => {
  await prisma.bookmark.deleteMany({ where: { url: "https://sweep.test" } });
  await prisma.image.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

test("sweep removes only stale, unreferenced images under this env's prefix", async () => {
  const group = await prisma.bookmarkGroup.findFirstOrThrow();
  const user = { id: group.userId };
  const tag = randomUUID();

  const orphan = await makeImage(`dev/t/${tag}-orphan.png`, old);
  const fresh = await makeImage(`dev/t/${tag}-fresh.png`, new Date());
  const shared = await makeImage(`dev/t/${tag}-shared.png`, old);
  const deletedOnly = await makeImage(`dev/t/${tag}-deleted-only.png`, old);
  const otherEnv = await makeImage(`prod/t/${tag}-prod.png`, old);

  // `shared` is used by one live and one soft-deleted bookmark; `deletedOnly` only by a deleted one.
  await prisma.bookmark.createMany({
    data: [
      { url: "https://sweep.test", name: "a", image: shared.url, userId: user.id, groupId: group.id },
      { url: "https://sweep.test", name: "b", image: shared.url, userId: user.id, groupId: group.id, deleted: true },
      { url: "https://sweep.test", name: "c", image: deletedOnly.url, userId: user.id, groupId: group.id, deleted: true },
    ],
  });

  await sweepOrphanImages();

  const remaining = new Set(
    (await prisma.image.findMany({ where: { id: { in: created } } })).map((i) => i.id),
  );
  assert.equal(remaining.has(orphan.id), false, "stale orphan is swept");
  assert.equal(remaining.has(deletedOnly.id), false, "soft-deleted refs don't keep an image");
  assert.equal(remaining.has(fresh.id), true, "grace period protects a fresh orphan");
  assert.equal(remaining.has(shared.id), true, "a live reference keeps the image");
  assert.equal(remaining.has(otherEnv.id), true, "other environment's keys are never swept");
});
