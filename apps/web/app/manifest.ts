import type { MetadataRoute } from "next";

// Cài lên màn hình chính điện thoại (PWA) – mở như một ứng dụng.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Course Video Studio",
    short_name: "Video Studio",
    description: "Tạo video e-learning tự động từ Word/Excel với giọng CIT Voice Studio",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f9",
    theme_color: "#00469b",
    lang: "vi",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
