import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { canvasToPngFile, loadImage } from "./lib/rasterize";

// Icons are served by our own API (self-hosted Iconify sets): browse a set by category, or
// search every set by name. SVG markup is fetched lazily, a chunk at a time, as it scrolls in.
const OUTPUT_SIZE = 256;
const CHUNK_SIZE = 60;
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

interface IconSet {
  prefix: string;
  label: string;
  total: number;
  palette: boolean;
}

interface Section {
  title: string;
  icons: string[]; // full ids: "prefix:name"
}

// Module-level so icons stay loaded between opens of the picker. Chunks subscribe to hear when
// any batch lands, and in-flight ids aren't requested twice.
const svgCache = new Map<string, string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function loadSvgs(baseUrl: string, ids: string[]) {
  const missing = ids.filter((id) => !svgCache.has(id) && !inFlight.has(id));
  if (!missing.length) return;
  missing.forEach((id) => inFlight.add(id));
  fetch(`${baseUrl}/api/icons/svg?icons=${encodeURIComponent(missing.join(","))}`, {
    credentials: "include",
  })
    .then((response) => (response.ok ? response.json() : {}))
    .then((svgs: Record<string, string>) => {
      for (const [id, svg] of Object.entries(svgs)) svgCache.set(id, svg);
    })
    .catch(() => {})
    .finally(() => {
      missing.forEach((id) => inFlight.delete(id));
      listeners.forEach((notify) => notify());
    });
}

const contrastColor = (hex: string) => {
  if (hex === TRANSPARENT) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111827" : "#ffffff";
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

function IconChunk({
  baseUrl,
  ids,
  selected,
  onSelect,
  scrollRoot,
}: {
  baseUrl: string;
  ids: string[];
  selected: string | null;
  onSelect: (id: string) => void;
  scrollRoot: React.RefObject<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const notify = () => setVersion((v) => v + 1);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        loadSvgs(baseUrl, ids);
      },
      { root: scrollRoot.current, rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ids, baseUrl, scrollRoot]);

  return (
    <div
      ref={ref}
      className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1"
    >
      {ids.map((id) => {
        const svg = svgCache.get(id);
        return (
          <button
            key={id}
            type="button"
            title={id.split(":")[1]}
            onClick={() => onSelect(id)}
            className={`h-14 p-2 flex items-center justify-center rounded-lg cursor-pointer hover:bg-purple-500/20 ${
              selected === id ? "bg-purple-500/30 ring-2 ring-purple-500" : ""
            }`}
          >
            {svg ? (
              <span
                className="w-9 h-9 [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <span className="w-9 h-9 rounded-md bg-gray-400/20" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function IconMaker({
  baseUrl,
  surfaceClass,
  onDone,
  onCancel,
}: {
  baseUrl: string;
  surfaceClass: string;
  onDone: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}) {
  const [sets, setSets] = useState<IconSet[] | null>(null);
  const [activePrefix, setActivePrefix] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ icons: string[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [background, setBackground] = useState(TRANSPARENT);
  const [iconColor, setIconColor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const api = (path: string) =>
    fetch(`${baseUrl}${path}`, { credentials: "include" }).then((response) => {
      if (!response.ok) throw new Error("Icon library request failed");
      return response.json();
    });

  useEffect(() => {
    api("/api/icons/sets")
      .then((data: IconSet[]) => {
        setSets(data);
        setActivePrefix(data[0]?.prefix ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!activePrefix) return;
    setSections(null);
    api(`/api/icons/sets/${activePrefix}`)
      .then((data: { sections: { title: string; icons: string[] }[] }) => {
        setSections(
          data.sections.map((s) => ({
            title: s.title,
            icons: s.icons.map((name) => `${activePrefix}:${name}`),
          })),
        );
        scrollRef.current?.scrollTo({ top: 0 });
      })
      .catch((e) => setError(e.message));
  }, [activePrefix]);

  // Debounced search across every set.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api(`/api/icons/search?q=${encodeURIComponent(term)}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
          scrollRef.current?.scrollTo({ top: 0 });
        })
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const totalIcons = sets?.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const selectedSet = sets?.find((s) => s.prefix === selected?.split(":")[0]);
  const isMonochrome = selectedSet ? !selectedSet.palette : false;
  const foreground = iconColor ?? contrastColor(background);
  const selectedSvg = selected ? svgCache.get(selected) : undefined;

  const handleUse = async () => {
    if (!selectedSvg) return;
    setError("");
    setSaving(true);
    try {
      // Size the SVG to the output so Safari rasterises it sharply, and tint monochrome icons.
      let svgText = selectedSvg.replace(
        /^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/,
        `<svg$1 width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}"`,
      );
      if (isMonochrome) svgText = svgText.replace(/currentColor/g, foreground);
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

      const file = await canvasToPngFile(canvas, `${selected!.replace(":", "-")}.png`);
      onDone(file, canvas.toDataURL("image/png"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the image");
    } finally {
      setSaving(false);
    }
  };

  // Stable chunk arrays, so IconChunk effects don't re-run on every selection.
  const sectionChunks = useMemo(
    () => sections?.map((section) => chunk(section.icons, CHUNK_SIZE)) ?? [],
    [sections],
  );
  const resultChunks = useMemo(
    () => (results ? chunk(results.icons, CHUNK_SIZE) : []),
    [results],
  );

  const renderChunks = (chunks: string[][]) =>
    chunks.map((ids) => (
      <IconChunk
        key={ids[0]}
        baseUrl={baseUrl}
        ids={ids}
        selected={selected}
        onSelect={setSelected}
        scrollRoot={scrollRef}
      />
    ));

  const isSearching = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        className={`${surfaceClass} rounded-2xl p-6 max-w-3xl w-full shadow-2xl flex flex-col h-[90vh]`}
      >
        <h2 className="text-2xl font-bold mb-4">Create Icon</h2>

        <div className="flex gap-6 mb-4">
          <div
            className="w-28 h-28 shrink-0 rounded-xl flex items-center justify-center shadow-inner overflow-hidden"
            style={{
              background: background === TRANSPARENT ? CHECKERBOARD : background,
              color: foreground,
            }}
          >
            {selectedSvg ? (
              <span
                className="[&>svg]:w-full [&>svg]:h-full"
                style={{
                  width: background === TRANSPARENT ? "90%" : "70%",
                  height: background === TRANSPARENT ? "90%" : "70%",
                }}
                dangerouslySetInnerHTML={{ __html: selectedSvg }}
              />
            ) : (
              <span className="text-xs text-gray-500 px-2 text-center">
                Pick an icon
              </span>
            )}
          </div>
          <div className="flex-1 space-y-2">
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
                title="Custom background"
                className="w-7 h-7 cursor-pointer bg-transparent"
              />
            </div>
            {isMonochrome && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                Icon colour
                <input
                  type="color"
                  value={foreground}
                  onChange={(e) => setIconColor(e.target.value)}
                  className="w-7 h-7 cursor-pointer bg-transparent"
                />
                {iconColor && (
                  <button
                    type="button"
                    onClick={() => setIconColor(null)}
                    className="underline opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    auto
                  </button>
                )}
              </label>
            )}
            {selected && (
              <p className="text-xs opacity-60 break-all">
                {selectedSet?.label} · {selected.split(":")[1]}
              </p>
            )}
          </div>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            sets
              ? `Search all ${totalIcons.toLocaleString()} icons…`
              : "Loading icons…"
          }
          className="w-full px-4 py-2 mb-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        {!isSearching && sets && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-1 shrink-0">
            {sets.map((set) => (
              <button
                key={set.prefix}
                type="button"
                onClick={() => setActivePrefix(set.prefix)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap cursor-pointer border ${
                  activePrefix === set.prefix
                    ? "bg-purple-600 text-white border-purple-600"
                    : "border-gray-300 hover:border-purple-500"
                }`}
              >
                {set.label}
              </button>
            ))}
          </div>
        )}
        {!isSearching && sections && sections.length > 1 && (
          <div className="flex flex-wrap gap-x-2 gap-y-1 mb-2 text-xs shrink-0">
            {sections.map((section) => (
              <button
                key={section.title}
                type="button"
                onClick={() =>
                  document
                    .getElementById(`icon-section-${section.title}`)
                    ?.scrollIntoView({ block: "start" })
                }
                className="text-purple-500 hover:underline cursor-pointer"
              >
                {section.title}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          {isSearching ? (
            results ? (
              results.icons.length ? (
                <div className="space-y-1">{renderChunks(resultChunks)}</div>
              ) : (
                <p className="text-sm opacity-60 py-8 text-center">No icons found.</p>
              )
            ) : null
          ) : sections ? (
            sections.map((section, i) => (
              <div key={section.title} id={`icon-section-${section.title}`}>
                <h3
                  className={`sticky top-0 z-10 py-1 text-sm font-semibold ${surfaceClass}`}
                >
                  {section.title}
                </h3>
                <div className="space-y-1 mb-3">{renderChunks(sectionChunks[i])}</div>
              </div>
            ))
          ) : (
            !error && (
              <div className="flex justify-center py-12">
                <LoaderCircle className="animate-spin w-8 h-8 opacity-60" />
              </div>
            )
          )}
        </div>
        <p className="text-xs opacity-60 mt-2 flex items-center gap-2 shrink-0">
          {searching && <LoaderCircle className="w-3 h-3 animate-spin" />}
          {isSearching && results
            ? results.total > results.icons.length
              ? `Showing ${results.icons.length} of ${results.total} — refine your search`
              : `${results.total} icon${results.total === 1 ? "" : "s"}`
            : ""}
        </p>
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

        <div className="flex gap-4 pt-3 shrink-0">
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
            disabled={!selectedSvg || saving}
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
