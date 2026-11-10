// Prompt viết mã cảnh hoạt hình vẽ tay (template "cartoon"): rút gọn từ ANIMATION_GUIDE.md của Claude Animation Base
// (© 2026 John Heibel, MIT – packages/engine-brush/kit/LICENSE-claude-animation-base.txt) + hợp đồng của Course Video Studio.

import { formatClock, type Scene, type SceneTiming, type Video } from "@cvs/core";
import { getTheme } from "@cvs/themes";
import type { Prompt } from "./index";

/** Nguyên tắc dựng (dùng cả cho skill "Hoạt hình vẽ tay" có sẵn). */
export const CARTOON_PRINCIPLES = `NGUYÊN TẮC HOẠT HÌNH VẼ TAY (rút từ Claude Animation Base – John Heibel, MIT):
Ba mục tiêu: THỦ CÔNG (như vẽ tay từng khung: nét cọ, nét mực rung, phẳng 2D) · SỐNG ĐỘNG (luôn có thứ chuyển động, mặt nhân vật diễn chứ không giật) · MỘT KHỐI (cảnh nối mạch với lời thoại, không phải clip rời). Người xem phải theo kịp.
1. Chất liệu: mọi thứ vẽ bằng paint()/inkLine() (không dùng hình p5 thường rect/ellipse/fill – trông như Flash cũ). Phẳng 2D, KHÔNG xoay 3D/phối cảnh; chiều sâu bằng che khuất, kích thước, màu (xa = nhỏ, nhạt, xanh hơn). Ánh sáng dùng glow(). Không đen/trắng tuyệt đối: PAL.ink, PAL.cream/PAL.paper.
2. Không chữ trong hình: thể hiện bằng hành động, không viết. Phản ứng nhân vật là dấu vẽ (emote: ! ? sweat bulb heart…), không phải chữ. Biển báo lặp lại câu chuyện là lỗi kinh điển.
3. Mỗi cảnh có sự kiện: khung cuối khác khung đầu (nhân vật muốn, phát hiện, thử, sai, phản ứng, đạt). Một hành động trọng tâm mỗi lúc, dáng rõ. Nguyên nhân → rồi mới phản ứng (cho phản ứng thời gian). Cái gì đã gài thì phải giải.
4. Timing theo người xem: mỗi câu thoại là một "read" – điều người xem phải hiểu. Mỗi read cần thời gian để mắt tìm, hiểu, và đọng lại trước read sau. Một read mỗi lúc; hai việc cùng lúc thì người xem chỉ thấy một. Động tác nhanh, ý nghĩa giữ lâu: chuẩn bị (anticipation) báo trước nơi nhìn, giữ (hold) sau đó để hiểu. Dắt mắt trước read quan trọng (nhân vật nhìn về đó, máy quay lướt tới, vật sáng lên trước).
5. Sống động: không bao giờ đứng yên (feel() có chuyển động chờ riêng, máy quay trôi/đẩy nhẹ, cỏ lay, nét mực rung). Mặt đổi cảm xúc qua emotions() (có chuẩn bị, nheo, giật mình, vượt rồi lắng) – không tự đổi eyes/mouth giữa hai khung. Nhân vật đủ lớn: cảnh trung u ≈ 20–28, cận 40–70; nhỏ (u < 12) chỉ cho toàn cảnh mở đầu.
6. Chuyển trong cảnh cũng là chuyển cảnh: đổi cảm xúc qua emotions(), quay người qua turn(), đồ vật vào/ra theo đường cong, không bật hiện. Ứng dụng tự thêm hiệu ứng ra cảnh – chỉ dùng iris()/brushWipe() khi câu chuyện cần.
7. Nguyên tắc hoạt hình: chuẩn bị (ngồi xuống trước khi nhảy) · nén giãn (sq) · chậm vào chậm ra (ease/easeOut/backOut, không lerp thẳng) · trọng lượng (vật nặng khởi động/dừng chậm, ít nảy) · đường cong (arcPt) · chồng lớp & theo đà (mắt dẫn, thân theo, tay/mũ/đồ vật trễ và lắng sau – spring/ring) · tránh song song (hai tay, hai nhân vật lệch nhịp, lệch seed) · cường điệu (tư thế, giật mình đẩy mạnh hơn tự nhiên) · tư thế chính rõ như ảnh tĩnh · thấy được suy nghĩ (nhận ra → nghĩ → làm, mắt động trước) · động tác phụ không tranh với động tác chính.
Lỗi hay gặp: nhân vật đứng cười mà không có gì xảy ra · mọi thứ cùng một tốc độ, sự kiện chồng nhau, không giữ · khoảnh khắc trôi qua trước khi người xem hiểu · nhân vật tí hon giữa khung trống · mặt đổi cảm xúc giật cục · chuyển động máy móc (tuyến tính, mọi phần cùng lúc, hai tay song song) · tư thế rụt rè · nét rung lung tung vì quên boilSeed() · xoay 3D · hình p5 thường/gradient/glow số lẫn vào nét cọ · đồ vật lơ lửng gần tay mà không chạm.`;

export const CARTOON_API = `API (kit đã nạp sẵn – KHÔNG import gì). Canvas 1920×1080, gốc trên-trái, y hướng xuống. Mọi thứ là HÀM THUẦN CỦA t: không trạng thái giữa các khung, không Math.random/Date/timer.
- Mốc câu: CUES[i], ENDS[i] (giây từ đầu cảnh), at(i, f) = thời điểm f (0..1) của câu i; DUR = độ dài cảnh. Đặt mọi sự kiện theo at(i, f) – KHÔNG giây cứng.
- Màu phong cách của video: THEME.bg, THEME.ink, THEME.accent, THEME.alt, THEME.warn, THEME.card… (hex) – dùng cho bảng màu cảnh để hợp phần chữ ứng dụng phủ lên. PAL: paper, ink, clay, clayDk, clayLt, night, indigo, rose, ochre, sap, teal, violet, cream, sky. mixCol(a, b, k).
- Ngẫu nhiên tất định: hash(i) (giá trị cố định theo vật), jit(a)/random() cho nét rung (đổi 12 lần/giây). GỌI boilSeed('khoá') trước mỗi phần tử riêng (từng lớp nền, đồ vật, hiệu ứng) để vật đứng yên không rung loạn.
- Vẽ: paint(pts, { wash, washOp, fill, fillOp, bleed, tex, border, hatch:{d,a,o,b,c,w}, ink, sw, br, curv }) – wash = màu phẳng (nhân vật, đồ vật), fill = màu nước loang (trời, đồi, bóng), ink: null = không viền. inkLine(pts, sw, màu, 'ink'|'inkfine'|'dry'|'2B'|'HB'|'charcoal'|'marker'|'pen', curv). glow(x, y, r, màu, a) (ánh sáng cộng, vẽ trước vật đứng trước nó).
- Hình: rectPts(x,y,w,h,j) · ellPts(cx,cy,rx,ry,n,j,rot) · rrPts(x,y,w,h,r,j) · starPts(cx,cy,r,inner,n,rot) · heartPts(cx,cy,r) · through(P) · ribbon(P,w0,w1) (dải thon: đuôi, dây, ống, tay). Một vật = càng ít viền càng tốt. push()/pop()/translate()/rotate()/scale() dùng được.
- Thời gian & chuyển động: seg(t,a,b) · kf(t, [[t0,v0],[t1,v1]…], ease) · lerp, clamp, frac, wob(t,freq,phase), TAU · ease, easeIn, easeOut, backOut, elasticOut · pulse(t,k), beatN(t), BEAT.
- Diễn xuất: jump(t,t0,t1,h)→{dy,sq} · take(t,t0,amt)→{sq,dy} · stroll(t,t0,t1,x0,x1,u)→{x,walk,view,flip,dy} · spring(t,t0,k,w) · ring(t,[t…]) · arcPt(p0,p1,h,k) · onTwos(t).
- Máy quay: camBegin(cx, cy, zoom, rot) … camEnd() (một cấp, luôn đóng cặp; máy quay luôn trôi/đẩy nhẹ) · toScreen(x,y) · shakeXY(t, amt) khi va chạm.
- Hiệu ứng toàn khung (sau camEnd): brushWipe(p, [c1,c2]) · iris(cx,cy,r,màu) · irisShape(pts,màu) · flash(k,màu).
- NHÂN VẬT: kysu(x, y, u, o) – "Kỹ sư" của khoá học (thân tròn xanh đồ bảo hộ, dải phản quang, mặc định đội mũ bảo hộ 'hard'). (x, y) = điểm chạm đất giữa hai chân; thân rộng ~8.4u, cao ~9u. Tuỳ chọn: dx, dy (theo u; âm = lên), sq (nén; âm = giãn), rot, flip, aL/aR (góc tay: 0 ngang, + lên, − xuống; ±1.5 thẳng đứng), walk (pha bước), view ('front'|'q'|'side'|'qback'|'back'), smear, eyes, mouth, lookX/lookY (−1..1), squint, blush, gloom, tint (pale|flush|blue|rosy|green|gold|hex), col/dk/lt (đổi màu đồ – nhân vật khác), vest (màu dải, null = không), hat (mặc định 'hard'; null = đầu trần), emote + emoteK + emoteAge, draw(u,sw) (vẽ lên thân), armL/armR(u,sw) (vẽ ở đầu tay – đồ vật cầm tay), boilKey (khoá ổn định khi có nhiều nhân vật).
  Nhiều nhân vật: đổi col/dk/lt/hat/vest để phân biệt; lệch nhịp & seed.
- Cảm xúc: feel(tên, t, ghi đè) · emotions(t, [[t0,'tên', ghi đè?], …], {take}) – trải các khoá theo at(i, f). Tên: happy, excited, laugh, love, proud, starstruck, playful, hopeful, relieved, smug, cool, mischief, suspicious, sad, cry, bored, sleepy, ko, angry, furious, determined, disgusted, scared, nervous, surprised, confused, dizzy, neutral, thinking, idea, shy. Gộp: kysu(x,y,u,{ ...emotions(t, keys), ...turn(t, t0, t1, 0, .25), aR: 1.2 }) – nếu cả cảm xúc và tư thế cùng đổi dy/sq thì CỘNG lại.
- Quay người: turn(t, t0, t1, a0, a1) (hướng theo vòng: 0 = trước, .25 = nhìn phải, .5 = sau, −.25 = nhìn trái) · spinView(a).
- Mắt: normal, look, wide, happy, closed, sleepy, wink, narrow, angry, determined, sad, teary, cry, squeeze, shine, scared, blank, spark, heart, x, swirl, dot, shades. Miệng: o, O, smile, grin, flat, wobble, cat, frown, smirk, laugh, open, wail, teeth, tongue, pout, yawn, null. Mũ: hard, party, crown, halo, wizard, hood, top, fedora, band, sweatband, beanie, bow, flower, headphones, cat. Emote: ! ? !! !? zzz sweat spark heart hearts anger steam bulb dots scribble music swirl stars cloud – emote(kind, x, y, s, k, age) vẽ ở chỗ bất kỳ.
- Điệu: move(style, t, seed) (bounce, hop, roof, sway, spin, wave, walk, run, idle, stomp, shimmy, mix) · dancer(x, y, u, style, t, extra).
- Đồ vật/bối cảnh: tự vẽ bằng paint/inkLine/ribbon (máy móc, bàn, kệ, biển báo KHÔNG chữ, bình chữa cháy, cây, nhà xưởng…). Đồ cầm tay vẽ trong armR/armL để luôn chạm tay.
- Chi phí: số hình fill và nét – hàng trăm thì được, hàng nghìn thì không. Không tạo vòng lặp vẽ hàng nghìn hình.`;

export type CartoonPromptOptions = {
  brief: string;
  /** Cho dùng nhân vật Clawd (linh vật Anthropic) – mặc định tắt. */
  clawd?: boolean;
  /** Chế độ nhẹ: không dùng fill màu nước (render nhanh). */
  fast?: boolean;
  /** Bố cục: hoạt hình kín khung, hoặc ở bên trái/phải (chữ ứng dụng ở bên kia). */
  layout?: "full" | "left" | "right";
  /** Ghi chú sửa của người duyệt + mã hiện tại (sửa trên nền đó). */
  note?: string;
  current?: string;
  feedback?: string;
};

/** Prompt viết mã cảnh hoạt hình (dùng chung cho Claude API và Claude Code). */
export function cartoonPrompt(video: Video, scene: Scene, T: SceneTiming, o: CartoonPromptOptions): Prompt {
  const th = getTheme(video.style, video.font);
  const c = th.colors;
  const lines = scene.sentences.map((s, i) => `  [câu ${i}] ${T.cues[i]?.toFixed(2)}–${T.ends[i]?.toFixed(2)}s: ${s.text}`).join("\n");
  const region = o.layout === "left" || o.layout === "right"
    ? `Clip hiện ở nửa ${o.layout === "left" ? "TRÁI" : "PHẢI"} màn hình (thu nhỏ), chữ của ứng dụng ở bên kia: dựng khung chặt, nhân vật lớn ở giữa clip.`
    : `Clip phủ KÍN khung; tiêu đề/ý chính của ứng dụng có thể phủ ở trên hoặc dưới: để khoảng trời/nền yên ở mép trên ~200px, hành động chính ở giữa–dưới.`;
  return {
    system: `Bạn là đạo diễn hoạt hình 2D vẽ tay cho video bài giảng e-learning TUV NORD. Bạn viết MÃ CẢNH JavaScript cho kit p5.js + p5.brush.
${CARTOON_PRINCIPLES}

${CARTOON_API}

HỢP ĐỒNG MÃ CẢNH (bắt buộc):
- Định nghĩa đúng một hàm: function scene(t) { … } – t = giây từ đầu cảnh (0..DUR). Hàm vẽ TOÀN KHUNG (cả nền) mỗi lần gọi. Có thể thêm hàm phụ/hằng số.
- KHÔNG gọi shots(), createCanvas, letter/sfx/text, loadImage/loadFont; KHÔNG dùng document/window/fetch/import/eval/Math.random/Date/setTimeout/requestAnimationFrame.
- KHÔNG vẽ chữ, số, logo hay giao diện của tổ chức thật trong hình. Không bịa số liệu.
- ${o.clawd ? "Nhân vật chính: kysu() (hoặc clawd() nếu người dùng yêu cầu rõ)." : "Nhân vật: CHỈ dùng kysu() (clawd() bị tắt trong dự án)."}
- ${o.fast ? "Chế độ NHẸ: KHÔNG dùng fill màu nước cho hình lớn (nền, trời, đồi) – dùng wash màu phẳng + hatch nhẹ nếu cần chất; glow() dùng được." : "Chế độ đầy đủ: fill màu nước cho nền/bóng (chậm hơn) – giữ số hình fill vừa phải."}
- Mỗi câu thoại = một read: sự kiện của câu i xảy ra trong [at(i,0), at(i,1)], read quan trọng cần giữ ≥ 0,6 s trước read sau. Khung đầu (t≈0) đã có bối cảnh + nhân vật (ứng dụng tự làm hiệu ứng vào/ra cảnh).
- ${region}

Trả về: một khối \`\`\`js … \`\`\` chứa TOÀN BỘ mã cảnh, rồi một khối \`\`\`json {"assumptions": [...]} \`\`\` liệt kê những gì bạn tự thêm ngoài mô tả (đồ vật, bối cảnh, cảm xúc).`,
    content: `PHONG CÁCH VIDEO: «${th.name}» – ${th.description}. Màu: nền ${c.bg}, chữ ${c.ink}, nhấn ${c.accent}, phụ ${c.alt}, rủi ro ${c.warn}, thẻ ${c.card}. ${th.dark ? "Nền tối." : "Nền sáng."}
VIDEO: ${video.key} – ${video.title}
CẢNH ${scene.id} · ${scene.title} (kịch bản ${formatClock(scene.scriptStart)}–${formatClock(scene.scriptEnd)}) · DUR = ${T.dur.toFixed(2)} s
MÔ TẢ HÌNH (kịch bản): ${scene.visual || "—"}
MÔ TẢ CẢNH HOẠT HÌNH (brief): ${o.brief}
LỜI THOẠI (mốc theo giọng thật – dùng at(i, f)):
${lines}
${o.current ? `\nMÃ CẢNH HIỆN TẠI (sửa trên nền này, giữ những gì ghi chú không nhắc tới):\n\`\`\`js\n${o.current.slice(0, 30000)}\n\`\`\`` : ""}
${o.note ? `\nGHI CHÚ SỬA CỦA NGƯỜI DUYỆT (bắt buộc làm theo): ${o.note}` : ""}
${o.feedback ? `\nLỖI CỦA LẦN TRƯỚC (phải sửa hết):\n${o.feedback}` : ""}`,
  };
}

/** Tách mã cảnh + assumptions từ câu trả lời. */
export function parseCartoonReply(text: string): { code: string | null; assumptions: string[] } {
  const code = text.match(/```(?:js|javascript)\s*([\s\S]*?)```/)?.[1]?.trim() ?? null;
  let assumptions: string[] = [];
  try {
    const a = JSON.parse(text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? "{}").assumptions;
    if (Array.isArray(a)) assumptions = a.map(String).slice(0, 12);
  } catch {
    /* không có khối json – bỏ qua */
  }
  return { code, assumptions };
}
