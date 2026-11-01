import { describe, expect, it } from "vitest";
import { CURATED_LIB_ICONS, guessIcon, ICON_NAMES, ICONS, iconExists, iconSvg, libIconNames } from "../src";

const body = (svg: string) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

describe("icons", () => {
  it("ICON_NAMES gồm icon vẽ tay + danh sách Lucide chọn lọc, không trùng, gọn cho prompt", () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(Object.keys(ICONS)));
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(CURATED_LIB_ICONS.length).toBeGreaterThanOrEqual(240);
    expect(ICON_NAMES.length).toBeLessThan(400);
  });

  it("mọi tên trong ICON_NAMES đều vẽ ra SVG nội tuyến, an toàn, nét currentColor", () => {
    const fallback = body(iconSvg("idea"));
    for (const n of ICON_NAMES) {
      expect(iconExists(n), n).toBe(true);
      const svg = iconSvg(n);
      const b = body(svg);
      expect(b.length, n).toBeGreaterThan(10);
      if (n !== "idea") expect(b, n).not.toBe(fallback);
      expect(svg).toMatch(/^<svg viewBox="0 0 24 24"[^>]*stroke="currentColor"/);
      expect(svg).not.toMatch(/<script|<image|<use|<foreignObject|href=|url\(|on\w+=|style=/i);
      expect(b).toMatch(/^(<(path|circle|rect|line|polyline|polygon|ellipse)\s[^<>]*\/>)+$/);
    }
  });

  it("tên không có → icon dự phòng; tên Lucide ngoài danh sách vẫn vẽ được", () => {
    expect(iconExists("khong-co-icon-nay")).toBe(false);
    expect(iconSvg("khong-co-icon-nay")).toBe(iconSvg("idea"));
    expect(iconSvg(undefined)).toBe(iconSvg("idea"));
    expect(iconSvg('"><script>alert(1)</script>')).toBe(iconSvg("idea"));
    const extra = libIconNames().find((n) => !ICON_NAMES.includes(n))!;
    expect(extra).toBeTruthy();
    expect(iconExists(extra)).toBe(true);
    expect(iconExists("lucide:leaf")).toBe(true);
    expect(body(iconSvg("lucide:leaf"))).not.toBe(body(iconSvg("leaf"))); // icon vẽ tay thắng khi trùng tên
  });

  it("guessIcon: từ khoá lĩnh vực mới trả về icon có thật", () => {
    expect(guessIcon("An toàn lao động")).toBe("hard-hat");
    expect(guessIcon("Hệ thống HACCP")).toBe("utensils");
    expect(guessIcon("ISO 27001 – an toàn thông tin")).toBe("lock-keyhole");
    expect(guessIcon("Đánh giá nội bộ")).toBe("clipboard-check");
    expect(guessIcon("Nước thải")).toBe("droplets");
    expect(guessIcon("Bảo đảm an toàn")).toBe("shield");
    // thứ tự quy tắc: cụm cụ thể thắng từ chung
    expect(guessIcon("Đánh giá")).toBe("clipboard-check");
    expect(guessIcon("Kết quả đánh giá")).toBe("clipboard-check");
    expect(guessIcon("Đánh giá rủi ro")).toBe("shield-alert");
    expect(guessIcon("Phát thải khí nhà kính trong xây dựng")).toBe("smoke");
    expect(guessIcon("Tín chỉ carbon từ điện gió")).toBe("co2");
    expect(guessIcon("Đào tạo nhân viên mới")).toBe("graduation-cap");
    expect(guessIcon("Lãnh đạo cam kết")).toBe("briefcase");
    expect(guessIcon("Xe nâng")).toBe("forklift");
    // NFD (dấu tách rời) cho kết quả như NFC
    for (const t of ["Khó khăn", "Đánh giá nội bộ", "Giám sát"]) expect(guessIcon(t.normalize("NFD")), t).toBe(guessIcon(t));
    expect(guessIcon("Khó khăn".normalize("NFD"))).toBe("idea");
    for (const t of ["Khóa đào tạo", "Chất thải rắn", "Thi công", "Biến đổi khí hậu", "Kho hàng", "xin chào"]) expect(iconExists(guessIcon(t)), t).toBe(true);
  });
});
