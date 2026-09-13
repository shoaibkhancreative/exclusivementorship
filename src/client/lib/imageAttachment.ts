export async function fileToCompressedDataUrl(
  file: File,
  opts: { maxLongEdge?: number; quality?: number } = {}
): Promise<{ dataUrl: string; filename: string }> {
  const maxLongEdge = opts.maxLongEdge ?? 1600;
  const quality = opts.quality ?? 0.8;

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
