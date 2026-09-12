/**
 * Resizes/compresses a picked image file via <canvas> before it's ever sent
 * to the server — most phone photos are several MB straight off the camera,
 * comfortably over the 1.5MB server-side cap (see
 * SUPPORT_MAX_ATTACHMENT_BYTES in worker/lib/config.ts) before any
 * resizing. This just gets typical photos under that cap; the server always
 * re-checks the decoded byte size regardless of what this produces.
 *
 * Decoding is tried through two independent paths before giving up:
 * createImageBitmap() first (broader, more reliable format support in
 * modern browsers, and doesn't depend on the DOM <img> load event firing),
 * then a plain <img>/blob-URL fallback for older browsers. If BOTH decode
 * paths fail — the common real case is a HEIC/HEIF photo straight off an
 * iPhone, which most non-Safari browsers simply cannot decode client-side
 * at all — this throws a specific, actionable error rather than a generic
 * one, so the UI can tell the person what to do about it instead of just
 * "try another image".
 */
export async function fileToCompressedDataUrl(
  file: File,
  opts: { maxLongEdge?: number; quality?: number } = {}
): Promise<{ dataUrl: string; filename: string }> {
  const maxLongEdge = opts.maxLongEdge ?? 1600;
  const quality = opts.quality ?? 0.8;

  // Animated GIFs would lose their animation if re-encoded through canvas —
  // pass them through untouched. The server enforces the size/mime cap
  // regardless, so an oversized GIF still gets a clear rejection rather
  // than silently losing its animation to "fix" the size.
  if (file.type === "image/gif") {
    return { dataUrl: await readFileAsDataUrl(file), filename: file.name || "attachment.gif" };
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadViaImageBitmap(file);
  } catch {
    try {
      source = await loadViaImgElement(file);
    } catch {
      // Neither decode path worked — most likely an unsupported format
      // (HEIC/HEIF is the common real-world case). Last resort: send the
      // original bytes through untouched, IF the browser at least reports
      // one of our accepted mime types; the server will still reject it if
      // it's not actually decodable/allowed. If the mime type isn't even
      // one we accept, fail clearly instead of uploading something the
      // server can never use.
      if (KNOWN_MIME_TYPES.has(file.type)) {
        return { dataUrl: await readFileAsDataUrl(file), filename: file.name || "attachment" };
      }
      throw new Error(
        "unsupported_format:This image format isn't supported by your browser. Please try a JPEG, PNG, WebP, or GIF (screenshots usually work best)."
      );
    }
  }

  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser.");
  ctx.drawImage(source, 0, 0, targetW, targetH);
  if ("close" in source) source.close();

  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, quality);

  const filename = file.name || `attachment.${mime === "image/png" ? "png" : "jpg"}`;
  return { dataUrl, filename };
}

const KNOWN_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function loadViaImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap unsupported");
  return createImageBitmap(file);
}

function loadViaImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("Timed out reading that image"));
    }, 10000);
    img.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}
