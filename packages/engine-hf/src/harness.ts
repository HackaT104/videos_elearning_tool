// Harness chạy trong trình duyệt: nạp từng compositions/sN.html vào host, tua mọi window.__timelines,
// và đo bố cục (QA mục 7.2). Dùng cho xem trước và render dự phòng.

import { LAYOUT_PROBE_JS } from "@cvs/engine/browser";

export const HARNESS_JS = LAYOUT_PROBE_JS + String.raw`
(() => {
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message || e)));
  window.__cvsErrors = errors;
  async function mount() {
    const hosts = [...document.querySelectorAll("[data-composition-src]")];
    for (const host of hosts) {
      const id = host.getAttribute("data-composition-id");
      const src = host.getAttribute("data-composition-src");
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) { errors.push("Không tải được " + src); continue; }
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const tpl = doc.querySelector("template");
      if (!tpl) { errors.push(src + ": thiếu <template>"); continue; }
      const frag = tpl.content;
      Object.assign(host.style, { position: "absolute", left: "0px", top: "0px", width: "1920px", height: "1080px", visibility: "hidden" });
      for (const st of frag.querySelectorAll("style")) {
        const s = document.createElement("style");
        s.textContent = st.textContent.replace(/#root(?![\w-])/g, "#" + id + "-hfroot");
        document.head.appendChild(s);
      }
      const root = frag.querySelector('[data-composition-id="' + id + '"]');
      if (!root) { errors.push(src + ": thiếu gốc data-composition-id=" + id); continue; }
      const node = document.importNode(root, true);
      node.id = id + "-hfroot";
      host.appendChild(node);
      for (const sc of frag.querySelectorAll("script")) {
        const s = document.createElement("script");
        s.textContent = sc.textContent;
        try { document.body.appendChild(s); } catch (e) { errors.push(id + ": " + e.message); }
      }
      if (!window.__timelines || !window.__timelines[id]) errors.push(id + ": chưa đăng ký window.__timelines[\"" + id + "\"]");
    }
    await document.fonts.ready;
    // clip hoạt hình: chờ có dữ liệu khung đầu (tua sau đó mới chính xác)
    await Promise.all([...document.querySelectorAll("video[data-cvs-clip]")].map((v) => (v.readyState >= 2 ? Promise.resolve() : new Promise((r) => { v.addEventListener("loadeddata", r, { once: true }); v.addEventListener("error", () => { errors.push("Không nạp được clip " + v.getAttribute("src")); r(); }, { once: true }); v.load(); }))));
    // ảnh của dự án (assets/img): chờ giải mã xong để khung chụp đầu tiên không trống
    await Promise.all([...document.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })).then(() => im.decode && im.decode().catch(() => {}))));
  }
  function seek(t) {
    const hosts = [...document.querySelectorAll("[data-composition-src]")];
    const waits = [];
    for (const host of hosts) {
      const id = host.getAttribute("data-composition-id");
      const start = Number(host.getAttribute("data-start"));
      const dur = Number(host.getAttribute("data-duration"));
      const on = t >= start && t < start + dur;
      host.style.visibility = on ? "visible" : "hidden";
      const tl = window.__timelines && window.__timelines[id];
      if (tl) tl.totalTime(Math.max(0, Math.min(dur, t - start)), true);
      if (on) for (const v of host.querySelectorAll("video[data-cvs-clip]")) {
        const want = Math.max(0, Math.min((v.duration || dur) - 0.001, t - start));
        if (Math.abs(v.currentTime - want) > 0.0005) waits.push(new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = want; }));
      }
    }
    if (window.__timelines && window.__timelines.main) window.__timelines.main.totalTime(t, true);
    return Promise.all(waits);
  }
  function layout(sceneId) {
    return window.__cvsLayout(document.getElementById(sceneId));
  }
  window.__cvs = { mount, seek, layout, errors };
})();
`;
