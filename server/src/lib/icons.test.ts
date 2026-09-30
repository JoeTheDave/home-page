import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ICON_SETS,
  alphabeticalSections,
  listSets,
  loadSet,
  renderIcons,
  searchIcons,
} from "./icons.js";

test("every configured icon set loads with sections covering all its icons", () => {
  for (const { prefix } of ICON_SETS) {
    const set = loadSet(prefix)!;
    assert.ok(set.names.length > 100, `${prefix} has icons`);
    const inSections = set.sections.reduce((n, s) => n + s.icons.length, 0);
    assert.equal(inSections, set.names.length, `${prefix} sections cover every icon once`);
  }
  assert.equal(loadSet("not-a-set"), null);
});

test("listSets reports Ionicons as monochrome and the colour sets as palette", () => {
  const sets = listSets();
  assert.equal(sets.find((s) => s.prefix === "ion")?.palette, false);
  assert.equal(sets.find((s) => s.prefix === "selfhst")?.palette, true);
});

test("alphabeticalSections groups by first letter with digits under #", () => {
  assert.deepEqual(alphabeticalSections(["beta", "1password", "apple", "bravo"]), [
    { title: "#", icons: ["1password"] },
    { title: "A", icons: ["apple"] },
    { title: "B", icons: ["beta", "bravo"] },
  ]);
});

test("searchIcons ranks exact matches first and requires every word", () => {
  const { icons, total } = searchIcons("school");
  assert.ok(total > 0);
  assert.equal(icons[0].split(":")[1], "school");
  const multi = searchIcons("school bus");
  assert.ok(multi.icons.length > 0);
  assert.ok(multi.icons.every((id) => id.includes("school") && id.includes("bus")));
  assert.deepEqual(searchIcons("   "), { icons: [], total: 0 });
});

test("renderIcons returns standalone SVG and skips unknown ids", () => {
  const out = renderIcons(["selfhst:plex", "ion:home-outline", "selfhst:nope-nope", "bogus"]);
  assert.deepEqual(Object.keys(out).sort(), ["ion:home-outline", "selfhst:plex"]);
  assert.match(out["selfhst:plex"], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox=/);
  assert.match(out["ion:home-outline"], /currentColor/);
});
