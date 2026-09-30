import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { canvasToPngFile, loadImage } from "./lib/rasterize";

// Icons come from Iconify's public API, limited to its full-colour collections (every set
// flagged `palette`: selfh.st, SVG Logos, Fluent Emoji, Noto, Twemoji, Devicon, …).
const ICONIFY = "https://api.iconify.design";
const OUTPUT_SIZE = 256;
const SEARCH_LIMIT = 300;
const TRANSPARENT = "transparent";

const BACKGROUND_COLORS = [
  TRANSPARENT,
  "#ffffff", "#f1f5f9", "#1e293b", "#000000",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
];

const CHECKERBOARD =
  "repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";

const iconUrl = (icon: string, size?: number) => {
  const [prefix, name] = icon.split(":");
  const params = size ? `?width=${size}&height=${size}` : "";
  return `${ICONIFY}/${prefix}/${name}.svg${params}`;
};

interface Collection {
  name: string;
  total: number;
  palette?: boolean;
}

export default function IconMaker({
  surfaceClass,
  onDone,
  onCancel,
}: {
  surfaceClass: string;
  onDone: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}) {
  const [collections, setCollections] = useState<Record<string, Collection> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ icons: string[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [background, setBackground] = useState(TRANSPARENT);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${ICONIFY}/collections`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((all: Record<string, Collection>) =>
        setCollections(
          Object.fromEntries(Object.entries(all).filter(([, c]) => c.palette)),
        ),
      )
      .catch(() => setError("Couldn't reach the icon library. Try again later."));
  }, []);

  const iconCount = collections
    ? Object.values(collections).reduce((sum, c) => sum + c.total, 0)
    : 0;

  // Debounced search across every colour collection.
  useEffect(() => {
    const term = query.trim();
    if (!collections || term.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({
        query: term,
        limit: String(SEARCH_LIMIT),
        prefixes: Object.keys(collections).join(","),
      });
      fetch(`${ICONIFY}/search?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json();
        })
        .then((data: { icons: string[]; total: number }) => {
          setResults({ icons: data.icons, total: data.total });
          setSearching(false);
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          setError("Search failed. Try again.");
          setSearching(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, collections]);

  const handleUse = async () => {
    if (!selected) return;
    setError("");
    setSaving(true);
    try {
      // Fetch the SVG at the output size (so Safari rasterises it sharply) and inline it as a
      // data URL, which keeps the canvas untainted.
      const response = await fetch(iconUrl(selected, OUTPUT_SIZE));
      if (!response.ok) throw new Error("Couldn't download that icon");
      const svgText = await response.text();
      const img = await loadImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`,
      );

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;
      const scale = background === TRANSPARENT ? 0.9 : 0.7;
      if (background !== TRANSPARENT) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      }
      const iconSize = OUTPUT_SIZE * scale;
      const offset = (OUTPUT_SIZE - iconSize) / 2;
      ctx.drawImage(img, offset, offset, iconSize, iconSize);

      const file = await canvasToPngFile(
        canvas,
        `${selected.replace(":", "-")}.png`,
      );
      onDone(file, canvas.toDataURL("image/png"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the image");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        className={`${surfaceClass} rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]`}
      >
        <h2 className="text-2xl font-bold mb-4">Create Icon</h2>

        <div className="flex gap-6 mb-4">
          <div
            className="w-32 h-32 shrink-0 rounded-xl flex items-center justify-center shadow-inner overflow-hidden"
            style={{
              background: background === TRANSPARENT ? CHECKERBOARD : background,
            }}
          >
            {selected ? (
              <img
                src={iconUrl(selected)}
                alt={selected}
                style={{
                  width: background === TRANSPARENT ? "90%" : "70%",
                  height: background === TRANSPARENT ? "90%" : "70%",
                }}
              />
            ) : (
              <span className="text-xs text-gray-500 px-2 text-center">
                Pick an icon
              </span>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-sm font-medium">Background</p>
            <div className="flex flex-wrap gap-1.5">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackground(color)}
                  title={color === TRANSPARENT ? "None (transparent)" : color}
                  className={`w-7 h-7 rounded-md border cursor-pointer hover:scale-110 transition-transform ${
                    background === color
                      ? "ring-2 ring-purple-500 ring-offset-1"
                      : "border-gray-300"
                  }`}
                  style={{
                    background: color === TRANSPARENT ? CHECKERBOARD : color,
                  }}
                  aria-label={`Background ${color}`}
                />
              ))}
              <input
                type="color"
                value={background === TRANSPARENT ? "#ffffff" : background}
                onChange={(e) => setBackground(e.target.value)}
                title="Custom colour"
                className="w-7 h-7 cursor-pointer bg-transparent"
              />
            </div>
            {selected && (
              <p className="text-xs opacity-60 break-all">
                {collections?.[selected.split(":")[0]]?.name ?? ""} · {selected}
              </p>
            )}
          </div>
        </div>

        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            collections
              ? `Search ${iconCount.toLocaleString()} colored icons…`
              : "Loading icon library…"
          }
          disabled={!collections}
          className="w-full px-4 py-2 mb-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <div className="flex-1 min-h-[200px] overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1 content-start">
          {results?.icons.map((icon) => (
            <button
              key={icon}
              type="button"
              title={icon}
              onClick={() => setSelected(icon)}
              className={`h-14 p-2 flex items-center justify-center rounded-lg cursor-pointer hover:bg-purple-500/20 ${
                selected === icon ? "bg-purple-500/30 ring-2 ring-purple-500" : ""
              }`}
            >
              <img
                src={iconUrl(icon)}
                alt={icon}
                loading="lazy"
                className="w-9 h-9"
              />
            </button>
          ))}
        </div>
        <p className="text-xs opacity-60 mt-2 flex items-center gap-2">
          {searching && <LoaderCircle className="w-3 h-3 animate-spin" />}
          {!results
            ? "Type at least 2 letters — try a site name (github, plex) or a thing (music, calendar)."
            : results.total > results.icons.length
              ? `Showing ${results.icons.length} of ${results.total} — refine your search`
              : `${results.total} icon${results.total === 1 ? "" : "s"}`}
        </p>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-500/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUse}
            disabled={!selected || saving}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 disabled:hover:bg-purple-600 flex items-center justify-center gap-2"
          >
            {saving && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Use Icon
          </button>
        </div>
      </div>
    </div>
  );
}
