import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { ClaudeLink } from "@/components/claude-link";

export const metadata: Metadata = {
  title: "Course Video Studio",
  description: "Tạo video e-learning tự động từ Word/Excel",
  appleWebApp: { capable: true, title: "Video Studio", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0e7c5a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="inline-block h-6 w-6 rounded bg-brand text-center text-sm leading-6 text-white">▶</span>
              Course Video Studio
            </Link>
            <nav className="flex gap-3 text-sm text-soft">
              <Link href="/">Dự án</Link>
              <Link href="/thuat-ngu">Thuật ngữ dùng chung</Link>
              <ClaudeLink />
            </nav>
            <div className="ml-auto hidden text-xs text-soft md:block">CIT Voice Studio · HyperFrames · Remotion · Claude</div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-4 sm:py-5">{children}</main>
      </body>
    </html>
  );
}
