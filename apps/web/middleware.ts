// Mở ứng dụng từ điện thoại qua Wi-Fi: truy cập từ máy khác phải nhập mã PIN (CVS_ACCESS_PIN trong .env).
// Truy cập ngay trên máy tính (localhost) không cần PIN.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const config = { runtime: "nodejs", matcher: ["/((?!_next/|icon.svg|manifest.webmanifest|favicon.ico).*)"] };

const COOKIE = "cvs_auth";
const token = (pin: string) => createHash("sha256").update(`cvs:${pin}`).digest("hex");

function isLocal(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export async function middleware(req: NextRequest) {
  if (isLocal(req)) return NextResponse.next();
  const pin = process.env.CVS_ACCESS_PIN?.trim();
  if (!pin) {
    return new NextResponse("Chưa đặt mã PIN: thêm CVS_ACCESS_PIN=… vào file .env trên máy tính rồi khởi động lại ứng dụng.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const { pathname } = req.nextUrl;
  if (pathname === "/dang-nhap") {
    if (req.method === "POST") {
      const form = await req.formData();
      const given = String(form.get("pin") ?? "");
      const ok = given.length === pin.length && timingSafeEqual(Buffer.from(given), Buffer.from(pin));
      const res = NextResponse.redirect(new URL(ok ? String(form.get("next") || "/") : "/dang-nhap?sai=1", req.url), 303);
      if (ok) res.cookies.set(COOKIE, token(pin), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
      return res;
    }
    return NextResponse.next();
  }
  if (req.cookies.get(COOKIE)?.value === token(pin)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Cần nhập mã PIN" }, { status: 401 });
  const url = new URL("/dang-nhap", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
