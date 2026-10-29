// Giao diện thuần: mọi /api/* chuyển tới API trong tiến trình worker (SQLite, ffmpeg, Playwright, Remotion chạy ở đó).
const API = `http://127.0.0.1:${process.env.CVS_API_PORT ?? 3001}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: { proxyTimeout: 30 * 60 * 1000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};
export default nextConfig;
