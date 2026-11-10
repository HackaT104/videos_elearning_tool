// character.js (Course Video Studio): nhân vật riêng "Kỹ sư" cho video bài giảng – thay cho Clawd (linh vật của Anthropic).
// Vẽ cùng bộ cọ và cùng hệ toạ độ với clawd() để dùng lại mắt, miệng, mũ, emote, feel(), emotions(), turn(), move():
//   kysu(x, y, u, o)  (x, y) = điểm chạm đất giữa hai chân; u = đơn vị (thân rộng ~8.4u, cao ~9u kể cả chân).
//   Toạ độ thân (nhìn thẳng), cho móc o.draw / o.armL / o.armR: thân x -4.2u..4.2u, y -8.6u..-1.8u; mắt (±2.5u, -6u);
//   miệng gần (0, -4.3u); dải phản quang y -3.4u..-2.6u; vai (±4u, -4.6u), tay dài 2.8u.
// Tuỳ chọn như clawd(): dx, dy, sq, rot, flip, sx, sy, aL, aR, walk, noLegs, noShadow, view, smear, smearDir, eyes, mouth,
// lookX, lookY, squint, blush, gloom, seed, col/dk/lt hoặc tint/tintK, hat (mặc định 'hard'; null = đầu trần), emote, emoteK,
// emoteAge, draw, armL, armR, boilKey. Thêm: vest (màu dải phản quang, null = không), boots (màu ủng).

const KYSU_VIEWS = {
  front: { L: -4.2, R: 4.2, face: { cx: 0, fw: 1, sides: [-1, 1], mx: 0, bx: 3.1 }, hat: 0, hw: 1, legs: [[-1.9, 0], [1.9, 0]], arms: [[-4, -1, 'L', 0], [4, 1, 'R', 0]] },
  q: { L: -4, R: 4.3, strip: [-4, -2], seam: -2, face: { cx: 1.3, fw: .78, sides: [-1, 1], mx: .3, bx: 3.1 }, hat: .5, hw: 1, legs: [[-1.4, 1], [2, 0]], arms: [[4.2, 1, 'R', 2], [-3.8, -1, 'L', 1]] },
  side: { L: -3.1, R: 3.3, face: { cx: 1.3, fw: .58, sides: [1], mx: 1.6, bx: 1 }, hat: .3, hw: .7, legs: [[-1.1, 1], [.7, 0]], arms: [[.6, 0, 'L', 1]] },
  qback: { L: -4.3, R: 4, strip: [2, 4], seam: 2, face: null, hat: -.4, hw: 1, legs: [[2, 1], [-1.4, 0]], arms: [[-4.2, -1, 'R', 2], [3.8, 1, 'L', 1]] },
  back: { L: -4.2, R: 4.2, face: null, hat: 0, hw: 1, back: true, legs: [[-1.9, 0], [1.9, 0]], arms: [[-4, -1, 'R', 0], [4, 1, 'L', 0]] },
};
const KYSU_COL = { col: '#2F6DB0', dk: '#1F4A80', lt: '#7FA9DA', vest: '#F2C53D', boots: '#3A2E2A', skin: '#F4D3B0' };
// mắt có lòng trắng (khác mắt khe của Clawd); các kiểu mắt nhắm/cong/hình thì không vẽ lòng trắng
const KYSU_NO_WHITES = ['happy', 'closed', 'sleepy', 'squeeze', 'x', 'heart', 'shades', 'swirl', 'dot', 'wink'];

// Đường viền hình chữ nhật bo góc (không rung) – để cắt mảng mặt bên đúng theo thân, không thò ra góc bo.
function kysuOutline(L, T, w, h, r, n = 10) {
  r = Math.min(r, w / 2, h / 2);
  const P = [], C = [[L + w - r, T + r, -Math.PI / 2], [L + w - r, T + h - r, 0], [L + r, T + h - r, Math.PI / 2], [L + r, T + r, Math.PI]];
  for (const [cx, cy, a0] of C) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return P;
}
// Cắt đa giác theo đường x = xs, giữ phần bên trái (left) hoặc phải (Sutherland–Hodgman, một cạnh).
function kysuClipX(P, xs, left) {
  const inside = (p) => (left ? p[0] <= xs : p[0] >= xs), out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const k = (xs - a[0]) / (b[0] - a[0]); out.push([xs, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}

function kysu(x, y, u, o = {}) {
  const id = o.boilKey ?? ++CLAWD_N, rs = part => boilSeed(`kysu ${id} ${part}`);
  x += (o.dx || 0) * u;
  const V = KYSU_VIEWS[o.view] || KYSU_VIEWS.front;
  const dy = (o.dy || 0) * u, sq = (o.sq || 0) + (o.take || 0), sm = clamp(o.smear || 0);
  const sw = clamp(u / 15, .45, 2.4) * (o.swMul || 1), J = u * .06;
  const { col, dk, lt } = tintCols({ ...o, col: o.col || KYSU_COL.col, dk: o.dk || KYSU_COL.dk, lt: o.lt || KYSU_COL.lt });
  const vest = o.vest === undefined ? KYSU_COL.vest : o.vest, boots = o.boots || KYSU_COL.boots;
  const hatName = o.hat === undefined ? 'hard' : o.hat;

  rs('shadow');
  if (!o.noShadow) {
    const f = 1 - Math.min(.5, Math.abs(o.dy || 0) * .06), w = (V.R - V.L) / 8.4;
    paint(ellPts(x, y + u * .15, u * 4.8 * f * w, u * .9 * f, 22), { fill: PAL.ink, fillOp: 90, bleed: .25, tex: .3, border: .1, ink: null });
  }
  if (sm > .05) smearTrail(x, y + dy, u, V, sm, o.smearDir ?? (o.flip ? -1 : 1), col);

  push();
  translate(x, y + dy);
  if (o.rot) rotate(o.rot);
  scale((o.flip ? -1 : 1) * (o.sx ?? 1) * (1 + sq * .6) * (1 + sm * .35), (o.sy ?? 1) * (1 - sq));

  // tay: dải thon (một nét viền) + bàn tay tròn; a = góc nâng (0 = ngang, + = lên)
  const arm = ([px, dir, which, layer]) => {
    rs('arm' + which);
    const a = which === 'L' ? (o.aL ?? -.9) : (o.aR ?? -.9), hook = which === 'L' ? o.armL : o.armR;
    const c = layer === 2 ? mixCol(col, dk, .45) : col;
    push(); translate(px * u, -4.6 * u);
    if (dir === 0) { translate(0, .3 * u); rotate(.7 - a); }
    else { rotate(dir < 0 ? a : -a); if (dir < 0) scale(-1, 1); }
    paint(ribbon([[0, 0], [1.4 * u, .05 * u], [2.6 * u, 0]], .95 * u, .75 * u), { wash: c, washOp: 255, ink: PAL.ink, sw: sw * .8 });
    paint(ellPts(2.85 * u, 0, .62 * u, .62 * u, 14, J * .5), { wash: KYSU_COL.skin, washOp: 255, ink: PAL.ink, sw: sw * .7 });
    if (hook) { translate(2.85 * u, 0); hook(u, sw); }
    pop();
  };

  V.arms.filter(a => a[3] !== 1).forEach(arm);
  if (!o.noLegs) V.legs.forEach(([lx, isFar], i) => {
    rs('leg' + i);
    let h = 1.9, sx = 0;
    if (o.walk != null) {
      const ph = (o.walk + (i % 2 ? .5 : 0)) * TAU;
      if (o.view === 'side') { sx = Math.sin(ph) * .6; h = 1.9 - Math.max(0, Math.cos(ph)) * .7; }
      else if (Math.sin(ph) > 0) h = 1.9 - Math.sin(ph) * .8;
    }
    const c = isFar ? mixCol(dk, PAL.ink, .3) : dk;
    paint(rrPts((lx + sx - .6) * u, -2 * u, 1.2 * u, h * u, .3 * u, J * .5), { wash: c, washOp: 255, ink: PAL.ink, sw: sw * .8 });
    paint(rrPts((lx + sx - .8) * u, (-2 + h - .55) * u, 1.75 * u, .75 * u, .35 * u, J * .4), { wash: boots, washOp: 255, ink: PAL.ink, sw: sw * .7 });
  });

  rs('body');
  const L = V.L * u, R = V.R * u, rad = 2.9 * u * (V.R - V.L) / 8.4, body = rrPts(L, -8.6 * u, R - L, 6.8 * u, rad, J);
  paint(body, { wash: col, washOp: 255, ink: null });
  // mảng sáng phía trên, dải phản quang, mặt bên tối (góc 3/4)
  paint(ellPts((V.strip ? (V.strip[0] < 0 ? 1.2 : -1.2) : -1.3) * u, -7 * u, 2.6 * u, 1.1 * u, 18, J * 2, -.1), { fill: lt, fillOp: V.back ? 70 : 110, bleed: .2, tex: .8, border: .7, ink: null });
  // mặt bên tối (góc 3/4) vẽ TRƯỚC dải phản quang: p5.brush pha màu như sơn (vàng dưới lớp xanh → xanh lá)
  if (V.strip) paint(kysuClipX(kysuOutline(L + .1 * u, -8.5 * u, R - L - .2 * u, 6.6 * u, rad), V.seam * u, V.strip[0] < 0), { fill: dk, fillOp: 140, bleed: .04, tex: .6, border: .4, ink: null });
  if (vest) {
    // thân bo tròn ở dưới: dải thụt vào theo độ bo để không thò ra ngoài viền; phần nằm ở mặt bên tối hơn (màu phẳng, không pha)
    paint(rectPts(L + .8 * u, -3.4 * u, R - L - 1.6 * u, .8 * u, J * .4), { wash: vest, washOp: 255, ink: null });
    if (V.strip) {
      const a = Math.max(L + .8 * u, V.strip[0] * u), b = Math.min(R - .8 * u, V.strip[1] * u);
      if (b > a) paint(rectPts(a, -3.4 * u, b - a, .8 * u, J * .3), { wash: mixCol(vest, '#7A5A10', .35), washOp: 255, ink: null });
    }
    inkLine([[L + .95 * u, -3.0 * u], [R - .95 * u, -3.0 * u]], sw * .4, mixCol(vest, '#FFFFFF', .5), 'inkfine', 0);
  }
  if (V.strip) inkLine([[V.seam * u + jit(J), -8.1 * u], [V.seam * u + jit(J), -5 * u], [V.seam * u + jit(J), -2 * u]], sw * .5, PAL.ink, 'inkfine', 0);
  paint(body, { ink: PAL.ink, sw });
  if (o.gloom > .02) gloom(u, sw, V, o.gloom);
  if (V.face) {
    const F = V.face;
    push(); translate(F.cx * u, 0); scale(F.fw, 1);
    if (o.blush) blush(u, sw, F, o.blush === true ? 1 : o.blush);
    const kinds = Array.isArray(o.eyes) ? o.eyes : [o.eyes || 'normal', o.eyes || 'normal'];
    rs('whites');
    if (sm < .5 && (o.squint || 0) < .5) F.sides.forEach((s) => {
      if (!KYSU_NO_WHITES.includes(kinds[s < 0 ? 0 : 1])) paint(ellPts(s * 2.5 * u, -6 * u, 1.05 * u, 1.35 * u, 16, J * .3), { wash: PAL.cream, washOp: 255, ink: PAL.ink, sw: sw * .55 });
    });
    rs('eyes'); eyes(u, { ...o, eyes: o.eyes }, sw, F.sides, sm); rs('mouth');
    push(); translate(F.mx * u, 0); mouth(u, o.mouth === undefined ? 'smile' : o.mouth, sw); pop();
    if (['cat', 'masq', 'bowtie'].includes(hatName)) faceHat(u, hatName, sw, F.sides);
    pop();
  }
  rs('hat'); push(); translate(V.hat * u, .35 * u); scale(V.hw * 1.05, 1); hat(u, hatName, sw); pop();
  V.arms.filter(a => a[3] === 1).forEach(arm);
  rs('draw'); if (o.draw) o.draw(u, sw);
  pop();

  rs('emote');
  if (o.emote) {
    const top = EMOTE_TOP.includes(o.emote), dir = o.flip ? -1 : 1;
    const ex = top ? x + dir * V.hat * u : x + dir * (V.R + .5) * u, ey = y + dy + (top ? -11.4 : -9.2) * u * (1 - sq);
    emote(o.emote, ex, ey, u * .9, o.emoteK ?? 1, o.emoteAge ?? T);
  }
  rs('after');
}
