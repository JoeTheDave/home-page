import { createRequire } from "module";
import { readFileSync } from "fs";
import {
  getIconData,
  iconToHTML,
  iconToSVG,
  replaceIDs,
} from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";

// Self-hosted icon sets (from @iconify-json/* packages) for the Create Icon picker. Served from
// our own server because Iconify's public API rate-limits per IP and broke the picker on iPad.
export const ICON_SETS: { prefix: string; label: string }[] = [
  { prefix: "selfhst", label: "App Icons" },
  { prefix: "logos", label: "Logos" },
  { prefix: "fluent-emoji-flat", label: "Emoji" },
  { prefix: "fluent-color", label: "Fluent Color" },
  { prefix: "streamline-color", label: "Streamline" },
  { prefix: "flat-color-icons", label: "Flat Color" },
  { prefix: "skill-icons", label: "Skill Icons" },
  { prefix: "devicon", label: "Devicon" },
  { prefix: "ion", label: "Ionicons" },
];

const require = createRequire(import.meta.url);

interface LoadedSet {
  prefix: string;
  label: string;
  total: number;
  palette: boolean;
  data: IconifyJSON;
  names: string[]; // visible, non-alias icons
  sections: { title: string; icons: string[] }[];
}

const cache = new Map<string, LoadedSet>();

const readJson = (prefix: string, file: string) =>
  JSON.parse(
    readFileSync(require.resolve(`@iconify-json/${prefix}/${file}`), "utf8"),
  );

/** Group names A–Z (digits under "#") for sets without their own categories. */
export function alphabeticalSections(names: string[]) {
  const groups = new Map<string, string[]>();
  for (const name of [...names].sort()) {
    const first = name[0].toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(name);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)))
    .map(([title, icons]) => ({ title, icons }));
}

export function loadSet(prefix: string): LoadedSet | null {
  const cached = cache.get(prefix);
  if (cached) return cached;
  const meta = ICON_SETS.find((s) => s.prefix === prefix);
  if (!meta) return null;

  const data = readJson(prefix, "icons.json") as IconifyJSON;
  const info = readJson(prefix, "info.json");
  let categories: Record<string, string[]> = {};
  try {
    categories = readJson(prefix, "metadata.json").categories ?? {};
  } catch {
    // Not every package ships metadata.json.
  }

  const names = Object.entries(data.icons)
    .filter(([, icon]) => !icon.hidden)
    .map(([name]) => name);
  const visible = new Set(names);

  let sections: LoadedSet["sections"];
  if (Object.keys(categories).length > 0) {
    const seen = new Set<string>();
    sections = Object.entries(categories)
      .map(([title, icons]) => ({
        title,
        icons: icons.filter((n) => visible.has(n) && !seen.has(n) && seen.add(n)),
      }))
      .filter((s) => s.icons.length > 0);
    const rest = names.filter((n) => !seen.has(n));
    if (rest.length) sections.push({ title: "Other", icons: rest });
  } else {
    sections = alphabeticalSections(names);
  }

  const loaded: LoadedSet = {
    prefix,
    label: meta.label,
    total: names.length,
    palette: info.palette !== false,
    data,
    names,
    sections,
  };
  cache.set(prefix, loaded);
  return loaded;
}

// Only info.json here, so opening the picker doesn't load every set into memory.
export function listSets() {
  return ICON_SETS.map(({ prefix, label }) => {
    const info = readJson(prefix, "info.json");
    return { prefix, label, total: info.total as number, palette: info.palette !== false };
  });
}

/**
 * Search every set by icon name. All query words must appear; exact and prefix matches rank
 * first. Returns "prefix:name" ids.
 */
export function searchIcons(query: string, limit = 300) {
  const terms = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!terms.length) return { icons: [] as string[], total: 0 };
  const whole = terms.join("-");

  const scored: { id: string; score: number }[] = [];
  for (const { prefix } of ICON_SETS) {
    const set = loadSet(prefix)!;
    for (const name of set.names) {
      if (!terms.every((t) => name.includes(t))) continue;
      const score =
        name === whole ? 0 : name.startsWith(whole) ? 1 : name.includes(whole) ? 2 : 3;
      scored.push({ id: `${prefix}:${name}`, score: score * 100000 + name.length });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return { icons: scored.slice(0, limit).map((s) => s.id), total: scored.length };
}

/** Render icons ("prefix:name") to standalone SVG strings. Unknown ids are skipped. */
export function renderIcons(ids: string[]) {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const [prefix, name] = id.split(":");
    const set = prefix && name ? loadSet(prefix) : null;
    const icon = set ? getIconData(set.data, name) : null;
    if (!icon) continue;
    const svg = iconToSVG(icon, { height: "auto" });
    out[id] = iconToHTML(replaceIDs(svg.body), svg.attributes);
  }
  return out;
}
