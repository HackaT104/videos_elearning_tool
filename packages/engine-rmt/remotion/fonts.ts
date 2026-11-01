// Nạp phông ĐỒNG BỘ bằng FontFace(ArrayBuffer) + document.fonts.add – KHÔNG dùng delayRender (mục 6.4:
// luồng dựng mở lại tab giữa chừng thì delayRender("Tải phông chữ") không được giải phóng → render chết).

import type { RmtFont } from "./types";

const loaded = new Set<string>();

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function loadFontsSync(fonts: RmtFont[]) {
  if (typeof document === "undefined") return;
  for (const f of fonts) {
    const key = `${f.family}|${f.weight}|${f.unicodeRange}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    const face = new FontFace(f.family, b64ToBuffer(f.base64), {
      weight: String(f.weight),
      style: "normal",
      unicodeRange: f.unicodeRange,
      display: "block",
      // cùng ghi đè số đo dọc như @font-face của HyperFrames
      ...(f.ascentOverride ? { ascentOverride: f.ascentOverride, descentOverride: f.descentOverride } : {}),
    });
    document.fonts.add(face);
    // dữ liệu nhị phân: phân tích ngay, không cần chờ mạng
    void face.load().catch(() => undefined);
  }
}
