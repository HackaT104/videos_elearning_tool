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
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#13222b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans">
        <header className="bg-ink text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex h-12 max-w-[1500px] items-center gap-5 px-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="4" fill="#0b7a5c" /><path d="M10 8.5v7l6-3.5z" fill="#fff" /></svg>
              Course Video Studio
            </Link>
            <nav className="flex items-center gap-4 text-[13px] text-white/70 [&_a:hover]:text-white">
              <Link href="/">Dự án</Link>
              <Link href="/thuat-ngu" className="hidden sm:inline">Thuật ngữ</Link>
              <ClaudeLink />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-5 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
