// Harness chạy trong trình duyệt: nạp từng compositions/sN.html vào host, tua mọi window.__timelines,
// và đo bố cục (QA mục 7.2). Dùng cho xem trước và render dự phòng.

export const HARNESS_JS = String.raw`
(() => {
  const SAFE = { x0: 96, x1: 1824, y0: 54, y1: 1026 };
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
  }
  function seek(t) {
    const hosts = [...document.querySelectorAll("[data-composition-src]")];
    for (const host of hosts) {
      const id = host.getAttribute("data-composition-id");
      const start = Number(host.getAttribute("data-start"));
      const dur = Number(host.getAttribute("data-duration"));
      const on = t >= start && t < start + dur;
      host.style.visibility = on ? "visible" : "hidden";
      const tl = window.__timelines && window.__timelines[id];
      if (tl) tl.totalTime(Math.max(0, Math.min(dur, t - start)), true);
    }
    if (window.__timelines && window.__timelines.main) window.__timelines.main.totalTime(t, true);
  }
  function rect(el) { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height }; }
  // vùng chữ thực tế (kể cả phần tràn ra ngoài hộp)
  function textRect(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!r.width && !r.height) return rect(el);
    void b;
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height };
  }
  function visible(el) {
    let e = el;
    while (e && e !== document.body) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
      e = e.parentElement;
    }
    return true;
  }
  function layout(sceneId) {
    const issues = [];
    const host = document.getElementById(sceneId);
    if (!host) return issues;
    const texts = [...host.querySelectorAll(".t")].filter(visible).filter((el) => el.textContent.trim());
    const boxes = texts.map((el) => ({ el, r: textRect(el) }));
    for (const { el, r } of boxes) {
      const id = el.id || (el.closest("[id]") || {}).id || "?";
      const src = el.classList.contains("src-line");
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < (src ? 22 : 27.5)) issues.push({ kind: "small-text", id, detail: "Chữ " + fs.toFixed(0) + "px" });
      if (r.x0 < SAFE.x0 - 1 || r.x1 > SAFE.x1 + 1 || r.y0 < SAFE.y0 - 1 || r.y1 > SAFE.y1 + 1)
        issues.push({ kind: "overflow-safe", id, detail: "Tràn vùng an toàn: " + [r.x0, r.y0, r.x1, r.y1].map(Math.round).join(",") });
      if (el.scrollWidth > el.clientWidth + 2) issues.push({ kind: "clipped", id, detail: "Chữ tràn ngang khỏi khung (" + el.scrollWidth + " > " + el.clientWidth + ")" });
      const card = el.closest(".card");
      if (card) {
        const c = rect(card);
        if (r.x1 > c.x1 + 1 || r.y1 > c.y1 + 1 || r.x0 < c.x0 - 1) issues.push({ kind: "card-overflow", id, detail: "Chữ tràn khỏi thẻ" });
      }
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.x1, b.r.x1) - Math.max(a.r.x0, b.r.x0);
        const oy = Math.min(a.r.y1, b.r.y1) - Math.max(a.r.y0, b.r.y0);
        if (ox > 4 && oy > 4) issues.push({ kind: "overlap", id: (a.el.id || "?") + "×" + (b.el.id || "?"), detail: "Hai khối chữ chồng nhau" });
      }
    for (const card of host.querySelectorAll(".card")) {
      if (!visible(card)) continue;
      if (getComputedStyle(card).boxSizing !== "border-box") issues.push({ kind: "card-overflow", id: card.id || "?", detail: "Thẻ không đặt box-sizing: border-box" });
      const c = rect(card);
      if (c.x1 > 1920 || c.y1 > 1080) issues.push({ kind: "overflow-safe", id: card.id || "?", detail: "Thẻ tràn khung hình" });
    }
    return issues;
  }
  window.__cvs = { mount, seek, layout, errors };
})();
`;
