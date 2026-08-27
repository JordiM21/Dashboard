/**
 * Client-side downscale/compress before upload — runs in the browser via
 * canvas, so an oversized photo (a phone camera shot easily runs 3-5MB at
 * 4000px+) never leaves the device at full size in the first place. Used
 * for student profile pictures, which only ever render as a ~44px circular
 * avatar — there's no reason to upload, store, or serve the original.
 */
export async function resizeImageFile(file: File, maxDimension = 256, quality = 0.82): Promise<File> {
  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // canvas unsupported — fall back to the original rather than block the upload

  ctx.drawImage(bitmap, 0, 0, width, height);
  closeImage(bitmap);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  // Skip the swap if compression somehow produced a larger file (rare, but
  // possible for an already-tiny/already-compressed source image).
  if (blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

function closeImage(image: ImageBitmap | HTMLImageElement) {
  if ("close" in image) image.close();
}
