/**
 * Draw an image (any format the browser can decode: ICO, SVG, PNG…) onto a canvas and
 * return it as a PNG File, so every image source ends up as a normal upload.
 */
export async function rasterizeToPng(
  src: string,
  fileName: string,
  maxSize = 256,
): Promise<File> {
  const img = await loadImage(src);
  const natural = Math.max(img.naturalWidth, img.naturalHeight);
  // SVGs without intrinsic dimensions report 0 — render them at the max size.
  const scale = natural > 0 ? Math.min(1, maxSize / natural) : 1;
  const width = img.naturalWidth > 0 ? Math.round(img.naturalWidth * scale) : maxSize;
  const height = img.naturalHeight > 0 ? Math.round(img.naturalHeight * scale) : maxSize;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToPngFile(canvas, fileName);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

export function canvasToPngFile(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not encode PNG"));
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}
