import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./globals.css";
import { ClaudeLink } from "@/components/claude-link";

export const metadata: Metadata = {
  title: "Course Video Studio",
  description: "Tạo video e-learning tự động từ Word/Excel",
  appleWebApp: { capable: true, title: "Video Studio", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1f36" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col font-sans">
        <header className="bg-ink text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex h-12 max-w-[1500px] items-center gap-5 px-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="4" fill="#00469b" /><path d="M10 8.5v7l6-3.5z" fill="#fff" /></svg>
              Course Video Studio
            </Link>
            <nav className="flex items-center gap-4 text-[13px] text-white/70 [&_a:hover]:text-white">
              <Link href="/">Dự án</Link>
              <Link href="/thuat-ngu" className="hidden sm:inline">Thuật ngữ</Link>
              <ClaudeLink />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 sm:py-6">{children}</main>
        <footer className="mt-8 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-[13px] text-soft">
            <span>
              <span className="font-medium text-ink">Course Video Studio</span> – sản phẩm của Team E-learning, TÜV NORD Việt Nam
            </span>
            <span>
              Hỗ trợ: <a className="text-brand underline-offset-2 hover:underline" href="mailto:supportelearning@tuvnord.vn">supportelearning@tuvnord.vn</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
