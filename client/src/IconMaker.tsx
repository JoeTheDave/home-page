import { useMemo, useRef, useState } from "react";
import { icons, type LucideIcon } from "lucide-react";
import { canvasToPngFile, loadImage } from "./lib/rasterize";

const OUTPUT_SIZE = 256;
const ICON_SCALE = 0.6;
const MAX_RESULTS = 240;

const BACKGROUND_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
  "#64748b", "#1e293b", "#000000", "#ffffff",
];

const iconNames = Object.keys(icons);
// "ArrowBigDown" → "arrow big down", so searches match word boundaries naturally.
const searchText = new Map(
  iconNames.map((name) => [
    name,
    name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase(),
  ]),
);

const contrastColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111827" : "#ffffff";
};

export default function IconMaker({
  surfaceClass,
  onDone,
  onCancel,
}: {
  surfaceClass: string;
  onDone: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("Globe");
  const [background, setBackground] = useState("#3b82f6");
  const [iconColor, setIconColor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = terms.length
      ? iconNames.filter((name) => {
          const text = searchText.get(name)!;
          return terms.every((t) => text.includes(t));
        })
      : iconNames;
    return { total: found.length, shown: found.slice(0, MAX_RESULTS) };
  }, [query]);

  const foreground = iconColor ?? contrastColor(background);
  const SelectedIcon = icons[selected as keyof typeof icons] as LucideIcon;

  const handleUse = async () => {
    setError("");
    const svg = previewRef.current?.querySelector("svg");
    if (!svg) return;
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", "24");
      clone.setAttribute("height", "24");
      clone.removeAttribute("style");
      const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        new XMLSerializer().serializeToString(clone),
      )}`;
      const img = await loadImage(svgUrl);

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const iconSize = OUTPUT_SIZE * ICON_SCALE;
      const offset = (OUTPUT_SIZE - iconSize) / 2;
      ctx.drawImage(img, offset, offset, iconSize, iconSize);

      const file = await canvasToPngFile(canvas, `${selected}.png`);
      onDone(file, canvas.toDataURL("image/png"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the image");
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
            ref={previewRef}
            className="w-32 h-32 shrink-0 rounded-xl flex items-center justify-center shadow-inner"
            style={{ backgroundColor: background }}
          >
            {SelectedIcon && (
              <SelectedIcon
                color={foreground}
                style={{ width: "60%", height: "60%" }}
              />
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackground(color)}
                  className={`w-7 h-7 rounded-md border cursor-pointer hover:scale-110 transition-transform ${
                    background === color
                      ? "ring-2 ring-purple-500 ring-offset-1"
                      : "border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Background ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                Background
                <input
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-8 h-8 cursor-pointer bg-transparent"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                Icon
                <input
                  type="color"
                  value={foreground}
                  onChange={(e) => setIconColor(e.target.value)}
                  className="w-8 h-8 cursor-pointer bg-transparent"
                />
              </label>
              {iconColor && (
                <button
                  type="button"
                  onClick={() => setIconColor(null)}
                  className="underline opacity-70 hover:opacity-100 cursor-pointer"
                >
                  auto
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${iconNames.length.toLocaleString()} icons…`}
          className="w-full px-4 py-2 mb-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1 content-start">
          {matches.shown.map((name) => {
            const Icon = icons[name as keyof typeof icons] as LucideIcon;
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => setSelected(name)}
                className={`h-11 flex items-center justify-center rounded-lg cursor-pointer hover:bg-purple-500/20 ${
                  selected === name ? "bg-purple-500/30 ring-2 ring-purple-500" : ""
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>
        <p className="text-xs opacity-60 mt-2">
          {matches.total > matches.shown.length
            ? `Showing ${matches.shown.length} of ${matches.total} — refine your search`
            : `${matches.total} icon${matches.total === 1 ? "" : "s"}`}
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
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
          >
            Use Icon
          </button>
        </div>
      </div>
    </div>
  );
}
