// Thu nhỏ ảnh khung (PNG 1920×1080) thành JPEG ≤ 1280 px để gửi cho Claude Desktop (giới hạn dung lượng kết quả công cụ).
// sharp là thư viện native: thiếu (hoặc lỗi nạp) → gửi ảnh gốc.

type Sharp = typeof import("sharp").default;
let sharpMod: Promise<Sharp | null> | null = null;
const loadSharp = () => (sharpMod ??= import("sharp").then((m) => (m.default ?? m) as Sharp).catch(() => null));

export const MAX_SIDE = 1280;

export async function toImageContent(buf: Buffer, maxSide = MAX_SIDE): Promise<{ type: "image"; data: string; mimeType: string }> {
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const out = await sharp(buf).resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
      return { type: "image", data: out.toString("base64"), mimeType: "image/jpeg" };
    } catch {
      /* ảnh lạ – gửi nguyên */
    }
  }
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  return { type: "image", data: buf.toString("base64"), mimeType: png ? "image/png" : "image/jpeg" };
}
