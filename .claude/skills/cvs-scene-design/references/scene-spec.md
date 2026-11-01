# SceneSpec, template và cảnh tùy biến

## Mô hình

`SceneSpec` (`packages/engine/src/spec.ts`): `html` (markup tĩnh: HTML/CSS/SVG inline, id có tiền tố `sN-`), `css`, `anims: Anim[]`,
`counts: CountAnim[]`, `texts` (mọi chữ hiển thị, cho QA), `assumptions` (chữ template tự thêm), `template`.

- `Anim = { id, from, to, at: TimeRef, dur, until?, ease }`, `from`/`to` chỉ gồm AnimProps (xem `motion.md`).
- `TimeRef`: `{cue, f?, d?}` → `at(cue, f) + d`; `{t}` giây cứng (chỉ tiêu đề < 1 s); `{end, d?}` → `T.dur − end`.
- HyperFrames: `compile.ts` sinh `tl.fromTo("#id", from, {…to, duration, ease}, at(i, f))`; lint ở `lint.ts`.
- Remotion: `engine-rmt/remotion/anim.ts` + `SpecScene.tsx` phát lại bằng `interpolate` + `easeFn` cùng công thức GSAP.
  ⇒ Chỉ dùng prop/ease mà cả hai hiểu; mọi giá trị tất định (không random, không đo layout lúc chạy).

## Viết template (`packages/engine/src/templates/*.ts`)

- `TemplateDef = { id, label, when, schema, example, build(params, ctx) }`. `when` là mô tả cho AI chọn – viết rõ **hình dạng thông tin** và giới hạn (số mục, độ dài nhãn).
- Dựng bằng `SpecBuilder`: `b.add(html)`, `b.text(s)` (bắt buộc cho mọi chữ hiển thị), `b.anim(...)`, `b.count(...)`, `b.assume(s)`.
- Bố cục tính bằng số: `SAFE`, `fitSize(text, maxW, max, {maxLines, min, kind})`, `blockHeight` – không để chữ tự tràn.
- Mốc: `beatOf(P.at?.x, i, count, nSent)` rải phần tử trên các câu nếu AI không đặt `at`.
- Lớp chung (theme CSS): `.abs .card .d .b .soft .kicker .icon .line .draw .t .tone-accent|alt|money|warn|neutral` (`--tone`).
- Phải thêm template vào `TEMPLATES` trong `templates/index.ts`, có `example` dựng được, và xem bằng `scripts/gallery.ts`.

Mẫu lớp vào cảnh giàu hơn (thay cho "mọi thứ enter"):

```ts
b.anim(fade(ctx, b.id("bg"), { t: 0.1 }));                          // khung/nền
b.anim(enter(ctx, b.id("title"), { t: 0.3 }, { rise: 30 }));        // tiêu đề
b.anim(draw(ctx, b.id("link-p"), { cue: 1, f: 0.1 }));              // nét nối vẽ ra khi câu 1 bắt đầu
items.forEach((it, i) => b.anim(enter(ctx, b.id(`it${i}`), shift({ cue: 1, f: 0.2 }, i * 0.09), { x: -24, rise: 0 })));
b.anim(wipeIn(ctx, b.id("mark"), { cue: 2, f: 0.15 }));             // marker dưới từ khóa
b.anim(dim(ctx, b.id("it0"), { cue: 2, f: 0.1 }));                  // ý cũ lùi lại
b.anim(springIn(ctx, b.id("badge"), { cue: 2, f: 0.4 }));           // một điểm nhấn nảy
```

## Cảnh tùy biến HyperFrames (theo `HF_CONTRACT`)

- `<!-- sN · <tên> (kịch bản m:ss–m:ss) … -->` rồi `<template>` bọc style + markup + script.
- `<div id="root" data-composition-id="sN" data-width="1920" data-height="1080">` → `<div id="sN-stage" class="cvs-scene">`.
- Giữ nguyên `const T = /*TIMING*/{…}/*/TIMING*/;` và `const at = (i, f) => …`. Mọi vị trí tween đi qua `at()`/`T`.
- Một `gsap.timeline({ paused: true })`, **chỉ `tl.fromTo`**, đăng ký `window.__timelines["sN"] = tl` ở cuối, bọc IIFE.
- Cấm `class="clip"`, `tl.to/set/from`, random, Date.now, timer, rAF, `repeat: -1`, display/visibility/autoAlpha, CDN/fetch.
- Không đặt CSS `transform` trên phần tử được tween x/y/scale (bọc thêm một div nếu cần xoay/tâm).
- Stagger trong cảnh tùy biến: vòng `for` sinh nhiều `tl.fromTo(..., at(i, f) + k * 0.08)`.
- Vẽ nét: `<path pathLength="1" class="line draw">` + `tl.fromTo(sel, {strokeDashoffset: 1}, {strokeDashoffset: 0, …})`.
- Đếm số trong cảnh tùy biến: `tl.fromTo(obj, {v: 0}, {v: N, onUpdate: () => el.textContent = fmt(obj.v)}, at(i, f))`, dùng `tabular-nums`, định dạng số kiểu Việt (dấu phẩy thập phân).
- Ra cảnh: một tween trên `#sN-stage` tại `T.dur - 0.45` (blur 8 px + mờ 0,3 s `power3.in`). **Bắt buộc** – engine không thêm exit/máy quay cho cảnh tùy biến và lint không bắt thiếu.

Remotion (`RMT_CONTRACT`): `at(T, i, f)`, `enter`, `dim`, `count`, `wobble`, `interpolate`, `Easing` từ `../lib`; cùng nguyên tắc.
