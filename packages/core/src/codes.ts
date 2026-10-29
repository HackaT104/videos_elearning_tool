// Mã video và tên file (mục 3.4).

export type VideoCodeParts = { module: string; unit: string; seq: string; base: string };

/**
 * Bóc phần học phần/unit/STT từ tên file kịch bản: "videos/MO1_U1.5_1.mp4" → {MO1, U1.5, 1}.
 * Chấp nhận các biến thể "MO1-U1.5-1", "M01_U1_5_2" (khi không rõ: base = tên file đã làm sạch).
 */
export function parseVideoFileName(name: string): VideoCodeParts {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.(mp4|mov|webm|mkv)$/i, "")
    .trim();
  const m = base.match(/^(M[O0]?\d+)[_\- ]+(U\d+(?:[.,]\d+)*)[_\- ]+(\d+)$/i);
  if (m) {
    return { module: m[1].toUpperCase().replace(/^M0/, "MO"), unit: m[2].toUpperCase().replace(",", "."), seq: m[3], base: `${m[1].toUpperCase().replace(/^M0/, "MO")}_${m[2].toUpperCase().replace(",", ".")}_${m[3]}` };
  }
  const m2 = base.match(/^(M[O0]?\d+)[_\- ]+(U\d+(?:[.,]\d+)*)$/i);
  if (m2) {
    const mod = m2[1].toUpperCase().replace(/^M0/, "MO");
    const unit = m2[2].toUpperCase().replace(",", ".");
    return { module: mod, unit, seq: "1", base: `${mod}_${unit}_1` };
  }
  const clean = sanitizeCode(base);
  return { module: "", unit: "", seq: "", base: clean };
}

export function sanitizeCode(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Mã video = <Khóa>-<Cấp độ>_<Học phần>_<Unit>_<STT>, ví dụ CAR-L1_MO1_U1.5_1. Luôn có tiền tố cấp độ. */
export function makeVideoKey(course: string, level: string, base: string): string {
  return `${sanitizeCode(course).toUpperCase()}-${sanitizeCode(level).toUpperCase()}_${base}`;
}

/** "L1" → "Cap_do_1" (thư mục xuất). */
export function levelFolder(level: string): string {
  const n = level.match(/\d+/)?.[0];
  return n ? `Cap_do_${n}` : `Cap_do_${sanitizeCode(level)}`;
}

/** Tìm các tên file trùng giữa các cấp độ (cảnh báo ở bước Phân tích). */
export function findCrossLevelDuplicates(items: { level: string; base: string }[]): string[] {
  const byBase = new Map<string, Set<string>>();
  for (const it of items) {
    if (!byBase.has(it.base)) byBase.set(it.base, new Set());
    byBase.get(it.base)!.add(it.level);
  }
  return [...byBase.entries()].filter(([, lv]) => lv.size > 1).map(([b, lv]) => `${b} (${[...lv].sort().join(", ")})`);
}

/** "0:30" → 30; "1:05" → 65; "1:02:03" → 3723. */
export function parseClock(s: string): number {
  const parts = s.trim().split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
