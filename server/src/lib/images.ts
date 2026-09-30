import { createHash } from "crypto";
import prisma from "./prisma.js";
import { uploadToS3, deleteFromS3 } from "./s3.js";

// How long an unreferenced image survives before the sweep deletes it. Covers the client's
// 5-second Undo on bookmark delete with a wide margin.
export const ORPHAN_GRACE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const envPrefix = () =>
  process.env.NODE_ENV === "production" ? "prod/" : "dev/";

/**
 * Store an uploaded image, reusing an existing S3 object when the exact same bytes were
 * uploaded before (by anyone). Returns the image URL to put on the bookmark.
 */
export async function storeImage(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
  user: { id: string; email: string },
  label: string,
): Promise<string> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const existing = await prisma.image.findUnique({ where: { sha256 } });
  if (existing) {
    await touchImage(existing.url);
    return existing.url;
  }

  const { url, key } = await uploadToS3(
    buffer,
    mimetype,
    originalName,
    user.email,
  );
  await prisma.image.create({
    data: { url, key, sha256, label, uploadedById: user.id },
  });
  return url;
}

/**
 * Restart the grace period for an image. Called whenever a bookmark lets go of it (delete or
 * image change) so the sweep waits long enough for an Undo.
 */
export async function touchImage(url: string | null | undefined) {
  if (!url) return;
  await prisma.image.updateMany({
    where: { url },
    data: { lastTouchedAt: new Date() },
  });
}

/**
 * Delete images that no live bookmark (any user) references and that have been untouched for
 * the grace period. Only keys under this environment's prefix are ever deleted, so a dev
 * database holding prod URLs can't remove prod objects.
 */
export async function sweepOrphanImages(now = new Date()) {
  const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS);
  const orphans = await prisma.$queryRaw<{ id: string; key: string }[]>`
    SELECT i."id", i."key" FROM "Image" i
    WHERE i."lastTouchedAt" < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "Bookmark" b WHERE b."image" = i."url" AND b."deleted" = false
      )`;

  let deleted = 0;
  for (const orphan of orphans) {
    if (!orphan.key.startsWith(envPrefix())) continue;
    // Re-check inside the delete so a bookmark that picked this image a moment ago wins.
    const removed = await prisma.$executeRaw`
      DELETE FROM "Image" i
      WHERE i."id" = ${orphan.id}
        AND i."lastTouchedAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "Bookmark" b WHERE b."image" = i."url" AND b."deleted" = false
        )`;
    if (removed === 0) continue;
    try {
      await deleteFromS3(orphan.key);
      deleted++;
    } catch (error) {
      console.error(`[Image Sweep] Failed to delete S3 object ${orphan.key}:`, error);
    }
  }
  if (deleted > 0) {
    console.log(`[Image Sweep] Deleted ${deleted} orphaned image(s)`);
  }
  return deleted;
}

export function startImageSweep() {
  const run = () =>
    sweepOrphanImages().catch((error) =>
      console.error("[Image Sweep] Sweep failed:", error),
    );
  setInterval(run, SWEEP_INTERVAL_MS).unref();
  setTimeout(run, 30 * 1000).unref();
}
