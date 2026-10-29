import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Course Video Studio", description: "Tạo video e-learning tự động từ Word/Excel" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="inline-block h-6 w-6 rounded bg-brand text-center text-sm leading-6 text-white">▶</span>
              Course Video Studio
            </Link>
            <nav className="flex gap-3 text-sm text-soft">
              <Link href="/">Dự án</Link>
              <Link href="/thuat-ngu">Thuật ngữ dùng chung</Link>
            </nav>
            <div className="ml-auto text-xs text-soft">CIT Voice Studio · HyperFrames · Remotion · Claude</div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
