import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

export interface LibraryImage {
  id: string;
  url: string;
  label: string | null;
}

export default function ImageLibrary({
  baseUrl,
  surfaceClass,
  onPick,
  onCancel,
}: {
  baseUrl: string;
  surfaceClass: string;
  onPick: (image: LibraryImage) => void;
  onCancel: () => void;
}) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${baseUrl}/api/images`, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load images");
        return response.json();
      })
      .then(setImages)
      .catch((e) => setError(e.message));
  }, [baseUrl]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!images) return [];
    return q
      ? images.filter((image) => image.label?.toLowerCase().includes(q))
      : images;
  }, [images, query]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        className={`${surfaceClass} rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]`}
      >
        <h2 className="text-2xl font-bold mb-4">Choose Existing Image</h2>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full px-4 py-2 mb-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <div className="flex-1 min-h-[200px] overflow-y-auto">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!images && !error && (
            <div className="flex justify-center py-12">
              <LoaderCircle className="animate-spin w-8 h-8 opacity-60" />
            </div>
          )}
          {images && filtered.length === 0 && (
            <p className="text-sm opacity-60 py-8 text-center">No images found.</p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
            {filtered.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => onPick(image)}
                title={image.label ?? ""}
                className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer hover:bg-purple-500/20"
              >
                <img
                  src={image.url}
                  alt={image.label ?? ""}
                  loading="lazy"
                  className="w-16 h-16 object-contain rounded-lg"
                />
                <span className="text-xs w-full text-center break-words line-clamp-2">
                  {image.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-500/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
