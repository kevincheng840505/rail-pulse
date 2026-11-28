/* ===== 3D 模型：列車、飛機、旅客 =====
   以前每個東西都是「多邊形往上擠出」的方塊疊出來的。現在改成真正的 3D 網格：
   車身是沿著車長把圓角斷面一段段接起來（loft），車頭依實車輪廓收窄、壓低，最前端再用圓頂封起來；
   機身是圓形斷面旋轉體，主翼、尾翼用 NACA 翼型斷面，發動機、輪子、旅客的四肢都是圓柱與橢球。
   法向量是平滑的，所以曲面會有明暗漸層；顏色（腰帶、車窗、塗裝）跟著網格的格線切，邊界是乾淨的直線。

   每個模型只在第一次用到時產生，上傳到顯示卡後重複使用；每一節車廂、每架飛機、每個人只是一個
   「位置＋方向」的矩陣，畫的時候一次一個，不用每格重算三角形。
   座標：x 往前（車頭／機頭）、y 往右、z 往上，單位公尺。 */

const MESH_HEX = new Map();
// 顏色：[r, g, b, 自發光]。自發光 1 = 不受日夜光線影響（亮著的車窗、車燈）
function mcol(hex, e = 0) {
  let v = MESH_HEX.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; MESH_HEX.set(hex, v); }
  return [v[0], v[1], v[2], e];
}
const MB = () => ({ P: [], N: [], C: [] });
function mbDone(mb) { return { P: new Float32Array(mb.P), N: new Float32Array(mb.N), C: new Float32Array(mb.C), n: mb.P.length / 3 }; }

// 一塊矮長方體（枕木這類大量、小、看不到底面的東西）：只畫頂面和兩個長側面，直接寫入頂點，不經過 surf，速度快很多
// c 中心（底面高度 z），(ux,uy) 長邊方向，hl 長邊半長、hw 短邊半寬、h 高
function slab(mb, cx, cy, z, ux, uy, hl, hw, h, col) {
  const vx = -uy, vy = ux, P = mb.P, N = mb.N, C = mb.C;
  const pt = (a, b, zz) => [cx + ux * a + vx * b, cy + uy * a + vy * b, zz];
  const quad = (p0, p1, p2, p3, n) => { for (const q of [p0, p1, p2, p0, p2, p3]) { P.push(q[0], q[1], q[2]); N.push(n[0], n[1], n[2]); C.push(col[0], col[1], col[2], col[3]); } };
  const t = z + h, A = pt(-hl, -hw, t), B = pt(hl, -hw, t), Cc = pt(hl, hw, t), D = pt(-hl, hw, t);
  const a = pt(-hl, -hw, z), b = pt(hl, -hw, z), c = pt(hl, hw, z), d = pt(-hl, hw, z);
  quad(A, B, Cc, D, [0, 0, 1]);
  quad(a, b, B, A, [-vx, -vy, 0]); quad(c, d, D, Cc, [vx, vy, 0]); // 兩端的小面看不太到，省略
}
/* 格狀曲面：rows[i][j] 是點，相鄰四點組成一格；color(i, j) 回傳那一格的顏色。
   法向量 = 周圍各格法向量的平均（平滑）；wrap 表示每一列頭尾相接（圓周）。
   最後依「法向量大多朝外」自動翻正（以所有點的中心判斷，車身、機身這類封閉形狀都適用） */
const perRowC = c => c === 'rows';
function surf(mb, rows, color, wrap = false, center = null) {
  const R = rows.length, Cn = rows[0].length;
  const N = rows.map(r => r.map(() => [0, 0, 0]));
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cn - 1; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const q of [N[i][j], N[i + 1][j], N[i + 1][j + 1], N[i][j + 1]]) { q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; }
  }
  if (wrap) for (let i = 0; i < R; i++) { const a = N[i][0], b = N[i][Cn - 1]; for (let k = 0; k < 3; k++) a[k] = b[k] = a[k] + b[k]; }
  // 收成一點的列（圓頂尖端）：整列共用一個法向量
  for (const i of [0, R - 1]) {
    const r = rows[i], p = r[0];
    if (r.every(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-6)) { const s = [0, 0, 0]; for (const q of N[i]) { s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; } for (const q of N[i]) { q[0] = s[0]; q[1] = s[1]; q[2] = s[2]; } }
  }
  let cx = 0, cy = 0, cz = 0, cnt = 0;
  if (center && !perRowC(center)) [cx, cy, cz] = center; else if (!center) { for (const r of rows) for (const p of r) { cx += p[0]; cy += p[1]; cz += p[2]; cnt++; } cx /= cnt; cy /= cnt; cz /= cnt; }
  // center === 'rows'：每一列各自用自己的中心判斷朝外（很長的放樣路徑若用整體中心，遠處的誤差會讓法向量整個翻面、看起來全黑）
  const perRow = center === 'rows';
  let sg = 0;
  for (let i = 0; i < R; i++) {
    if (perRow) { cx = cy = cz = 0; for (const p of rows[i]) { cx += p[0]; cy += p[1]; cz += p[2]; } cx /= Cn; cy /= Cn; cz /= Cn; }
    for (let j = 0; j < Cn; j++) { const n = N[i][j], l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l; const p = rows[i][j]; sg += n[0] * (p[0] - cx) + n[1] * (p[1] - cy) + n[2] * (p[2] - cz); }
  }
  const f = sg < 0 ? -1 : 1;
  const P = mb.P, NN = mb.N, C = mb.C;
  const v = (i, j, c) => { const p = rows[i][j], n = N[i][j]; P.push(p[0], p[1], p[2]); NN.push(n[0] * f, n[1] * f, n[2] * f); C.push(c[0], c[1], c[2], c[3]); };
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cn - 1; j++) {
    const c = color(i, j); if (!c) continue;
    v(i, j, c); v(i + 1, j, c); v(i + 1, j + 1, c);
    v(i, j, c); v(i + 1, j + 1, c); v(i, j + 1, c);
  }
}
// 圓管（可兩端不同半徑、兩端封口）：輪子、桿件、四肢
function tube(mb, p0, p1, r0, r1, seg, col, caps = true, rz0 = r0, rz1 = r1) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d) || 1, u = d.map(x => x / L);
  const t = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let a = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]; const la = Math.hypot(...a); a = a.map(x => x / la);
  const b = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  const ring = (p, r, rz) => { const o = []; for (let j = 0; j <= seg; j++) { const g = j / seg * Math.PI * 2, c = Math.cos(g) * r, s = Math.sin(g) * rz; o.push([p[0] + a[0] * c + b[0] * s, p[1] + a[1] * c + b[1] * s, p[2] + a[2] * c + b[2] * s]); } return o; };
  const rows = [];
  if (caps) rows.push(ring(p0, 0, 0), ring(p0, r0 * 0.92, rz0 * 0.92));
  rows.push(ring(p0, r0, rz0), ring(p1, r1, rz1));
  if (caps) rows.push(ring(p1, r1 * 0.92, rz1 * 0.92), ring(p1, 0, 0));
  surf(mb, rows, () => col, true, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]);
}
// 橢球（rx 前後、ry 左右、rz 上下）；p 讓形狀介於橢球（2）與圓角柱（越大越方）之間
function ellipsoid(mb, c, rx, ry, rz, col, nu = 10, nv = 7, p = 2) {
  const e = 2 / p, sp = (x, k) => Math.sign(x) * Math.pow(Math.abs(x), k);
  const rows = [];
  for (let i = 0; i <= nv; i++) {
    const th = -Math.PI / 2 + Math.PI * i / nv, cz = sp(Math.sin(th), e), cr = sp(Math.cos(th), e), row = [];
    for (let j = 0; j <= nu; j++) { const g = j / nu * Math.PI * 2; row.push([c[0] + rx * cr * sp(Math.cos(g), e), c[1] + ry * cr * sp(Math.sin(g), e), c[2] + rz * cz]); }
    rows.push(row);
  }
  surf(mb, rows, () => col, true, c);
}

/* ---------- 列車車廂 ----------
   斷面：下緣圓角、側面微微內傾、車頂圓弧。側面的點刻意放在腰帶、車窗帶的高度上，色帶邊界才會是直線。
   車頭：沿用 NOSE_SHAPE 的輪廓參數，越往前越窄、越低、越圓，最前端用圓頂收起來。 */
const BAND_Z = [0.24, 0.33, 0.37, 0.40, 0.42, 0.50, 0.52, 0.56, 0.60, 0.77, 0.80, 0.82, 0.88];
function carSection(a, zb, zt, s, h, zlist) {
  const H = zt - zb, rt = Math.min(a * 0.9, H * 0.45) * (0.32 + 0.55 * s), rb = Math.min(a * 0.6, H * 0.3) * (0.18 + 0.4 * s);
  const tum = z => 1 - 0.055 * Math.max(0, (z - 0.5 * h) / (0.55 * h)) ** 2; // 上半部微微往內收
  const half = [[0, zb]];
  for (let k = 0; k <= 3; k++) { const g = -Math.PI / 2 + Math.PI / 2 * k / 3; half.push([(a - rb) + Math.cos(g) * rb, zb + rb + Math.sin(g) * rb]); }
  const lo = zb + rb, hi = zt - rt;
  for (const zr of zlist) { const z = Math.min(hi, Math.max(lo, zr * h)); half.push([a * tum(z), z]); }
  const at = a * tum(hi);
  for (let k = 0; k <= 4; k++) { const g = Math.PI / 2 * k / 4; half.push([(at - rt) + Math.cos(g) * rt, hi + Math.sin(g) * rt]); }
  half.push([(at - rt) * 0.5, zt + H * 0.004], [0, zt + H * 0.006]);
  // 右半邊（y > 0）由下往上，再接左半邊由上往下
  const ring = half.slice();
  for (let k = half.length - 2; k >= 0; k--) ring.push([-half[k][0], half[k][1]]);
  return ring;
}
/* 一節車廂的網格。o：front/back 是 'nose'（流線車頭）或 'end'（接下一節的平端），
   lampF/lampB 車燈顏色，lit 夜裡車窗亮著，detail 跟拍的列車才有一格格車窗、車門與轉向架細節 */
function carMesh(L, key, o) {
  const mb = MB(), S = NOSE_SHAPE[key] || NOSE_SHAPE.EMU900;
  const w = L.w * EX, h = L.h * EX, a0 = w / 2, len = L.len, xb = -len / 2, xf = len / 2;
  const zb0 = 0.2 * h, zt0 = 1.04 * h;
  const nl = L.nose || 1.4, det = o.detail;
  const zlist = det ? BAND_Z : BAND_Z.filter(z => z !== 0.24 && z !== 0.82 && z !== 0.88 && z !== 0.60 && z !== 0.77);
  const nDoor = DOORS[key] || 2, doorW = L.len > 15 ? 1.4 : 1.1;
  const win = mcol('#141C26'), pane = o.lit ? mcol(o.lit, 1) : mcol('#3A5068'), door = mcol(mixHex(L.body, '#2A3038', 0.16)), under = mcol('#24282E');
  const body = mcol(L.body), roof = mcol(L.roof), cab = L.cab ? mcol(L.cab) : body;
  const band = L.band ? mcol(L.band) : null, st1 = L.stripe ? mcol(L.stripe) : null, st2 = L.stripe2 ? mcol(L.stripe2) : null, line = !L.stripe && o.line ? mcol(o.line) : null;
  const sWin = nl >= 6 ? 0.42 : 1.01;
  // 車門與車窗沿車長的位置（跟 trainDoors 一樣排法）
  const bodyF = o.front === 'nose' ? xf - nl : xf, bodyB = o.back === 'nose' ? xb + nl : xb, span = bodyF - bodyB;
  const doors = [];
  for (let j = 0; j < nDoor; j++) doors.push(bodyB + span * (nDoor === 1 ? 0.9 : nDoor === 2 ? (j ? 0.85 : 0.15) : (j + 0.5) / nDoor));
  const panes = [];
  if (det) {
    const nw = Math.max(2, Math.round(span / 3.4));
    for (let k = 0; k < nw; k++) {
      const pa = bodyB + span * (k + 0.18) / nw, pb = bodyB + span * (k + 0.82) / nw;
      if (doors.some(dc => pb > dc - doorW * 0.7 && pa < dc + doorW * 0.7)) continue;
      panes.push([pa, pb]);
    }
  }
  // 沿車長的斷面位置：[x, s（車頭內的比例 0~1）, 圓頂縮放 k（1 = 不縮）]
  const xs = [];
  const noseS = det ? [0, 0.08, 0.17, 0.27, 0.38, 0.5, 0.61, 0.71, 0.8, 0.88, 0.94, 0.98, 1] : [0, 0.25, 0.5, 0.72, 0.88, 1];
  const domeK = det ? [0.96, 0.86, 0.7, 0.48, 0.22, 0] : [0.85, 0.5, 0];
  const tipA = a0 * S.tipW, bulge = Math.max(0.15, Math.min(1.2, tipA * (1.15 - S.tipW) * 0.85));
  const endCap = (x, dir) => [[x, 0, 0.0], [x, 0, 0.55], [x + dir * 0.02, 0, 0.93], [x + dir * 0.1, 0, 1]];
  if (o.back === 'nose') {
    for (let k = domeK.length - 1; k >= 0; k--) xs.push([xb - bulge * Math.sqrt(1 - domeK[k] ** 2), 1, domeK[k], 'dome']);
    for (let k = noseS.length - 1; k >= 0; k--) xs.push([xb + nl * (1 - noseS[k]), noseS[k], 1, 'nose']);
  } else xs.push(...endCap(xb, 1).map(p => [...p, 'end']));
  const lowB = o.back === 'nose' ? bodyB : xb + 0.1, highF = o.front === 'nose' ? bodyF : xf - 0.1;
  const mids = [lowB, highF];
  if (det) { for (const d of doors) mids.push(d - doorW / 2, d + doorW / 2, d - doorW * 0.14, d + doorW * 0.14); for (const [pa, pb] of panes) mids.push(pa, pb); }
  else for (let k = 1; k < 4; k++) mids.push(bodyB + span * k / 4);
  [...new Set(mids.map(x => +x.toFixed(4)))].sort((p, q) => p - q).forEach(x => { if (x > lowB + 1e-3 && x < highF - 1e-3) xs.push([x, 0, 1, 'body']); });
  if (o.front === 'nose') {
    for (const s of noseS) xs.push([xf - nl * (1 - s), s, 1, 'nose']);
    for (const k of domeK) xs.push([xf + bulge * Math.sqrt(1 - k * k), 1, k, 'dome']);
  } else xs.push(...endCap(xf, -1).reverse().map(p => [...p, 'end']));
  const rows = [], meta = [];
  for (const [x, s, k, zone] of xs) {
    const a = a0 * (S.tipW + (1 - S.tipW) * Math.pow(Math.max(0, 1 - Math.pow(s, S.wp)), 1 / S.wp));
    const zt = h * (1.04 - (1.04 - S.tipH) * Math.pow(s, S.hp)), zb = zb0 + 0.04 * h * s * s;
    const ring = carSection(a, zb, Math.max(zb + 0.3, zt), s, h, zlist), zc = (zb + zt) / 2;
    // 圓頂：寬度依 k 縮小，高度只夾在逐漸變窄的範圍內，色帶的分界才會一直是水平線
    const hz = (zt - zb) / 2 * Math.sqrt(k) + 0.004 * (k > 0);
    rows.push(ring.map(([y, z]) => [x, y * k, k >= 1 ? z : Math.min(zc + hz, Math.max(zc - hz, z))]));
    meta.push({ s, zone, a });
  }
  const inPane = x => panes.some(([pa, pb]) => x > pa && x < pb);
  const inDoor = x => doors.some(d => Math.abs(x - d) < doorW / 2);
  const inDoorWin = x => doors.some(d => Math.abs(x - d) < doorW * 0.14);
  surf(mb, rows, (i, j) => {
    const A = rows[i][j], B = rows[i + 1][j + 1], x = (A[0] + B[0]) / 2, y = (A[1] + B[1]) / 2, z = (A[2] + B[2]) / 2, r = z / h;
    const m0 = meta[i], m1 = meta[i + 1], s = Math.max(m0.s, m1.s), zone = m0.zone === 'dome' || m1.zone === 'dome' ? 'dome' : m0.zone === 'end' || m1.zone === 'end' ? 'end' : s > 0 ? 'nose' : 'body';
    const aa = Math.max(m0.a, m1.a), side = Math.abs(y) > aa * 0.72;
    const isFront = x > 0;
    if (zone === 'end') return r < 0.25 ? under : r > 0.95 ? roof : body;
    if (r < zb0 / h + 0.015 && !side) return under;
    if (zone === 'dome' || zone === 'nose') {
      const lamp = isFront ? o.lampF : o.lampB;
      if (lamp && r > 0.15 && r < 0.31 && Math.abs(y) > aa * 0.3 && Math.abs(y) < aa * 0.8 && (zone === 'dome' || s > 0.9)) return mcol(lamp, 1);
      // 擋風玻璃：短車頭是整片前窗；高鐵這種長鼻子只有鼻根上方一小塊駕駛艙窗
      // 行先顯示器：擋風玻璃上緣中間一塊橘色 LED（高鐵沒有）
      if (nl < 6 && det && r > 0.86 && r < 0.93 && Math.abs(y) < aa * 0.32 && (zone === 'dome' || s > 0.7)) return mcol(o.lit ? '#FFB547' : '#E0902E', o.lit ? 1 : 0.55);
      if (nl >= 6 ? (!side && s > 0.12 && s < sWin && r > 0.62 && Math.abs(y) < aa * 0.8) : (r > 0.5 && r < 0.95 && (zone === 'dome' || !side || s > 0.35))) return win;
    }
    if (st2 && r > 0.33 && r < 0.37) return st2;
    if (st1 && r > 0.40 && r < 0.50) return st1;
    if (line && r > 0.42 && r < 0.52) return line;
    if (det && side && zone === 'body' && inDoor(x) && r > 0.21 && r < 0.82) return inDoorWin(x) && r > 0.56 && r < 0.8 ? pane : door;
    if (r > 0.56 && r < 0.80 && side) return det && zone === 'body' && r > 0.6 && r < 0.77 && inPane(x) ? pane : win;
    if (band && side && r > 0.52 && r < 0.86) return band; // EMU3000 一整條黑色車窗帶
    if (r > 0.95 && !side) return roof;
    if (s > 0 && r < 0.56 && L.cab) return cab;
    return body;
  }, true, [0, 0, h * 0.6]);
  // 貫通道（接下一節的那一端）：深色的伸縮風擋
  if (L.gap > 0) for (const [x0, dir, kind] of [[xb, -1, o.back], [xf, 1, o.front]]) {
    if (kind !== 'end') continue;
    const x1 = x0 + dir * (L.gap / 2 + 0.03), r = [];
    for (const x of [x0 - dir * 0.05, x1]) r.push(carSection(a0 * 0.36, 0.3 * h, 0.92 * h, 0.4, h, [0.5]).map(([y, z]) => [x, y, z]));
    surf(mb, r, () => mcol('#2A2E33'), true, [x0, 0, 0.6 * h]);
  }
  // 車底：轉向架（側架、軸箱、彈簧、車輪）與車底設備箱
  const gauge = (key === 'THSR' || /^(TRTC|TYMC|TYMC_X|TMRT|KRTC)$/.test(key) ? 0.72 : 0.54) * EX;
  const frameC = mcol('#1A1D21'), wheelC = mcol('#3B4046'), springC = mcol('#55595F');
  for (const u of [0.13, 0.87]) {
    const bx = xb + len * u, bl = Math.min(2.8, len * 0.16);
    if (!det) { ellipsoid(mb, [bx, 0, 0.55], bl / 2, gauge + 0.12, 0.24, frameC, 6, 3, 6); continue; }
    ellipsoid(mb, [bx, 0, 0.62], bl * 0.3, gauge - 0.05, 0.12, frameC, 8, 3, 6); // 橫樑
    for (const sy of [-1, 1]) {
      ellipsoid(mb, [bx, sy * (gauge + 0.12), 0.58], bl * 0.52, 0.07, 0.17, frameC, 12, 3, 8); // 側架
      for (const wx of [-bl * 0.38, bl * 0.38]) {
        tube(mb, [bx + wx, sy * (gauge - 0.07), 0.43], [bx + wx, sy * (gauge + 0.07), 0.43], 0.43, 0.43, 16, wheelC);
        ellipsoid(mb, [bx + wx, sy * (gauge + 0.2), 0.43], 0.17, 0.07, 0.13, springC, 6, 3, 6); // 軸箱
        tube(mb, [bx + wx * 0.75, sy * (gauge + 0.12), 0.68], [bx + wx * 0.75, sy * (gauge + 0.12), zb0 - 0.02], 0.1, 0.1, 8, springC, false); // 二次彈簧
      }
    }
  }
  { const ua = xb + len * 0.13 + 1.8, ub = xb + len * 0.87 - 1.8;
    if (ub > ua) {
      if (!det) ellipsoid(mb, [(ua + ub) / 2, 0, zb0 - 0.12], (ub - ua) / 2, a0 * 0.7, 0.2, mcol('#2B2F35'), 6, 4, 6);
      else { // 車底設備箱：幾個大小不一的箱子
        const n = Math.max(2, Math.round((ub - ua) / 3.2));
        for (let k = 0; k < n; k++) { const c = ua + (ub - ua) * (k + 0.5) / n, wl = (ub - ua) / n * 0.42; ellipsoid(mb, [c, 0, zb0 - 0.2 - 0.05 * (k % 2)], wl, a0 * (0.6 + 0.1 * (k % 2)), 0.24 + 0.05 * (k % 2), mcol(k % 2 ? '#2B2F35' : '#34393F'), 8, 3, 8); }
      }
    }
  }
  // 裙板：高鐵、普悠瑪、太魯閣、EMU3000 車身下緣延伸蓋住車底
  if (L.skirt) {
    const sa = xb + len * 0.13 + 1.6, sb = xb + len * 0.87 - 1.6;
    if (sb > sa) for (const sy of [-1, 1]) ellipsoid(mb, [(sa + sb) / 2, sy * (a0 - 0.16), zb0 - 0.08], (sb - sa) / 2, 0.08, 0.34, cab === body ? body : mcol(mixHex(L.body, '#8A9098', 0.3)), det ? 12 : 6, 3, 10);
  }
  // 車頭下方的排障器與連結器蓋（短車頭的電聯車、捷運）
  if (det) for (const [x0, dir, kind] of [[xf, 1, o.front], [xb, -1, o.back]]) {
    if (kind !== 'nose') continue;
    const tip = x0 + dir * (nl >= 6 ? 0 : 0.05);
    ellipsoid(mb, [tip - dir * 0.35, 0, zb0 - 0.05], 0.45, a0 * 0.78, 0.28, mcol('#24282E'), 10, 4, 5);
    if (nl < 6) tube(mb, [tip - dir * 0.2, 0, zb0 + 0.05], [tip + dir * 0.15, 0, zb0 + 0.05], 0.18, 0.15, 8, mcol('#3A3F45'));
  }
  // 車頂設備：空調機組（高鐵車頂是整流罩，看不到）
  const AC = { EMU900: [0.28, 0.72], EMU3000: [0.5], E1000: [0.5], CHUKUANG: [0.5], TEMU1000: [0.5], TEMU2000: [0.5], TRTC: [0.27, 0.73], TYMC: [0.3, 0.7], TYMC_X: [0.3, 0.7], TMRT: [0.3, 0.7], KRTC: [0.27, 0.73], TRTC_Y: [0.5], LRT: [0.5] }[key];
  if (det && AC) for (const u of AC) {
    const cx = xb + len * u;
    if (o.front === 'nose' && cx > bodyF - 1.2 || o.back === 'nose' && cx < bodyB + 1.2 || (o.panto && Math.abs(cx - (xb + len * 0.7)) < 2.2)) continue;
    const acC = mcol(mixHex(L.roof, '#8A9198', 0.35));
    ellipsoid(mb, [cx, 0, zt0 + 0.08], Math.min(1.6, len * 0.08), a0 * 0.52, 0.26, acC, 10, 4, 6);
    for (const dx of [-0.55, 0.55]) ellipsoid(mb, [cx + dx, 0, zt0 + 0.3], 0.36, 0.36, 0.05, mcol('#3C4248'), 10, 2, 2); // 散熱風扇
  }
  // 單臂式集電弓：底座、礙子、下臂、上臂、弓頭（兩側羊角）
  if (o.panto && det) {
    const px = xb + len * 0.7, z0 = zt0 + 0.02, g = mcol('#4A5058'), ins = mcol('#C46A3A'), dark2 = mcol('#2C3036');
    ellipsoid(mb, [px, 0, z0 + 0.1], 1.0, 0.75, 0.07, g, 8, 3, 8);
    for (const [dx, dy] of [[-0.8, -0.55], [-0.8, 0.55], [0.8, -0.55], [0.8, 0.55]]) tube(mb, [px + dx, dy, z0], [px + dx, dy, z0 + 0.16], 0.09, 0.07, 8, ins, false);
    const knee = [px + 1.0, 0, z0 + 0.95], head = [px - 0.15, 0, z0 + 1.7];
    for (const sy of [-0.28, 0.28]) tube(mb, [px - 0.7, sy, z0 + 0.2], [knee[0], sy * 0.4, knee[2]], 0.05, 0.04, 6, g, false);
    tube(mb, [knee[0], 0, knee[2]], [head[0], 0, head[2]], 0.04, 0.035, 6, g, false);
    tube(mb, [head[0], -0.85, head[2]], [head[0], 0.85, head[2]], 0.05, 0.05, 6, dark2);
    for (const sy of [-1, 1]) tube(mb, [head[0], sy * 0.85, head[2]], [head[0], sy * 1.05, head[2] - 0.15], 0.04, 0.03, 5, dark2, false);
  }
  return mbDone(mb);
}
// 打開的車門：兩側各一片深色門洞，寬度 1 公尺，用模型矩陣的 x 縮放成實際打開的寬度
function doorGapMesh(L) {
  const mb = MB(), h = L.h * EX, a = L.w * EX / 2 * (1 - 0.055 * 0.02) + 0.03;
  for (const sy of [-1, 1]) {
    const rows = [0.21, 0.82].map(r => [[-0.5, sy * a, r * h], [0.5, sy * a, r * h]]);
    surf(mb, rows, () => mcol('#0B0F14'), false, [0, 0, 0.5 * h]);
  }
  // 平面的法向量要朝外
  for (let i = 0; i < mb.N.length; i += 3) { const y = mb.P[i + 1]; mb.N[i] = 0; mb.N[i + 1] = Math.sign(y); mb.N[i + 2] = 0; }
  return mbDone(mb);
}

/* ---------- 旅客 ----------
   沿用原本的人體比例（鞋、小腿、大腿、骨盆、胸腔、肩、上臂、前臂、脖子、頭），每段改成圓角的橢球。
   十種角色：上班族（公事包、領帶）、上班族女（裙子、肩背包）、學生與女學生（制服、書包）、長輩（白髮、拐杖、微駝）、
   小朋友（矮、亮色衣服、小書包）、旅客（拉行李箱）、休閒（帽子）、洋裝（長髮、雨傘）、背包客（大登山包）。
   每種角色兩組配色。走路的姿勢量化成 16 個相位，每個「角色＋配色＋相位」做一個模型重複使用 */
const PERSON_STYLES = [
  { tops: ['#F2F2EE', '#D9E4F2'], bottom: '#2B2F36', hair: '#1E1C1A', acc: 'brief', accC: '#3B2A20', tie: '#3A4A7A', phone: true },
  { tops: ['#C9A7B8', '#E8E2D6'], bottom: '#2E2A33', skirt: true, long: true, hair: '#2A211C', acc: 'handbag', accC: '#7A4B2F', phone: true },
  { tops: ['#F4F6F8', '#EEF2F5'], bottom: '#1F2E5A', hair: '#141414', acc: 'backpack', accC: '#2F5D9E', phone: true },
  { tops: ['#F4F6F8', '#EEF2F5'], bottom: '#24356B', skirt: true, long: true, hair: '#141414', acc: 'backpack', accC: '#C0392B' },
  { tops: ['#8A6E55', '#6F7A63'], bottom: '#55524C', hair: '#C9C7C2', stoop: true, acc: 'cane', accC: '#4A3A2C', speed: 0.7 },
  { tops: ['#F2B134', '#6BC2A1'], bottom: '#3B6EA8', hair: '#1A1A1A', scale: 0.66, acc: 'backpack', accC: '#E86A92', speed: 0.9 },
  { tops: ['#5E8C61', '#3F6FB8'], bottom: '#C9B48A', hair: '#3A2A20', acc: 'suitcase', accC: '#2F3A4A', speed: 0.85 },
  { tops: ['#4A4F57', '#9A3B3B'], bottom: '#3D5A80', hair: '#2A2420', acc: 'cap', accC: '#B03A2E', phone: true },
  { tops: ['#E8D5B5', '#B8C9D9'], dress: true, long: true, hair: '#3A2A20', acc: 'umbrella', accC: '#2E7D8C' },
  { tops: ['#C7553A', '#2F6F8F'], bottom: '#4A4F45', hair: '#2A2420', acc: 'bigpack', accC: '#3F5D3A' },
];
function personMesh(phase, walk, sid = 0, vi = 0) {
  const st = PERSON_STYLES[sid] || PERSON_STYLES[0], mb = MB(), k = EX * (st.scale || 1);
  const shirt = mcol(st.tops[vi % st.tops.length]), pants = mcol(st.dress ? st.tops[vi % st.tops.length] : st.bottom), skin = mcol('#D9A988'), hair = mcol(st.hair), shoe = mcol('#1B1D20');
  const accC = mcol(st.accC || '#333'), dark = mcol('#1E2226');
  const ell = (fwd, lat, rf, rl, b, t, col, p = 2.6) => ellipsoid(mb, [fwd * k, lat * k, (b + t) / 2 * k], rf * k, rl * k, Math.max(0.02, (t - b) / 2) * k, col, 6, 3, p);
  const box = (fwd, lat, z, hf, hl, hz, col) => ellipsoid(mb, [fwd * k, lat * k, z * k], hf * k, hl * k, hz * k, col, 6, 3, 7);
  const stick = (a, b, r, col) => tube(mb, a.map(v => v * k), b.map(v => v * k), r * k, r * k, 5, col, false);
  const slow = st.stoop || st.acc === 'suitcase' ? 0.7 : 1;
  const sw = Math.sin(phase) * walk * slow, vel = Math.cos(phase) * walk;
  const bob = (1 - Math.abs(Math.cos(phase))) * walk * 0.035, lean = walk * 0.035 + (st.stoop ? 0.07 : 0);
  const legC = st.skirt || st.dress ? skin : pants;
  for (const [side, f, v] of [[1, sw, vel], [-1, -sw, -vel]]) {
    const foot = f * 0.21, swing = Math.max(0, v), lift = swing * 0.07, lat = side * 0.085;
    ell(foot + 0.04, lat, 0.12, 0.05, lift, lift + 0.08, shoe, 3);
    ell(foot * 0.75 - swing * 0.06, lat, 0.055, 0.055, lift + 0.05, 0.49 + lift * 0.6, legC);
    ell(foot * 0.38, lat * 0.95, 0.07, 0.07, 0.43 + lift * 0.6, 0.88 + bob, legC);
  }
  // 裙子：從腰往下張開的鐘形；洋裝一路到小腿
  if (st.skirt) ell(lean * 0.4, 0, 0.17, 0.2, 0.55 + bob, 0.98 + bob, pants, 2.2);
  else if (st.dress) ell(lean * 0.4, 0, 0.19, 0.22, 0.4 + bob, 1.0 + bob, pants, 2.2);
  else ell(lean * 0.5, 0, 0.11, 0.165, 0.8 + bob, 0.98 + bob, pants);
  ell(lean, 0, 0.12, 0.18, 0.93 + bob, 1.3 + bob, shirt, 3);
  ell(lean * 1.2, 0, 0.1, 0.205, 1.2 + bob, 1.36 + bob, shirt, 3);
  if (st.tie) ell(lean * 1.1 + 0.115, 0, 0.012, 0.025, 1.02 + bob, 1.32 + bob, mcol(st.tie));
  // 手臂：站著滑手機的人，右手前臂抬到胸前，手上一支手機
  const phoneUp = !walk && st.phone;
  for (const [side, a] of [[1, -sw], [-1, sw]]) {
    const lat = side * 0.235;
    ell(lean * 1.2 + a * 0.06, lat, 0.05, 0.05, 1.0 + bob, 1.34 + bob, shirt);
    if (phoneUp && side > 0) { stick([lean + 0.02, lat * 0.9, 1.02], [lean + 0.24, lat * 0.45, 1.16], 0.04, skin); box(lean + 0.27, lat * 0.4, 1.19, 0.008, 0.04, 0.07, dark); }
    else ell(lean + a * 0.17, lat * 0.97, 0.042, 0.042, 0.73 + bob, 1.03 + bob, skin);
  }
  ell(lean * 1.3, 0, 0.045, 0.045, 1.32 + bob, 1.45 + bob, skin);
  const hx = lean * 1.4 + (phoneUp ? 0.03 : 0), hz = (phoneUp ? -0.03 : 0);
  ellipsoid(mb, [(hx + 0.01) * k, 0, (1.55 + bob + hz) * k], 0.105 * k, 0.095 * k, 0.125 * k, skin, 9, 6);
  ellipsoid(mb, [(hx - 0.01) * k, 0, (1.6 + bob + hz) * k], 0.11 * k, 0.1 * k, 0.1 * k, hair, 9, 4);
  if (st.long) ell(hx - 0.07, 0, 0.06, 0.1, 1.3 + bob, 1.62 + bob, hair);
  // 配件
  const handF = lean + sw * -0.17, handL = 0.24, handZ = 0.72 + bob; // 右手（側向 +）大概的位置
  switch (st.acc) {
    case 'brief': box(handF, handL + 0.03, handZ - 0.16, 0.2, 0.04, 0.14, accC); break;
    case 'handbag': box(lean - 0.02, -0.27, 0.98 + bob, 0.13, 0.05, 0.1, accC); stick([lean, -0.24, 1.08 + bob], [lean, -0.2, 1.36 + bob], 0.012, accC); break;
    case 'backpack': box(lean - 0.19, 0, 1.13 + bob, 0.08, 0.15, 0.17, accC); break;
    case 'bigpack': box(lean - 0.24, 0, 1.2 + bob, 0.13, 0.17, 0.34, accC); box(lean - 0.24, 0, 1.58 + bob, 0.1, 0.13, 0.06, mcol('#C9B48A')); break;
    case 'cap': ellipsoid(mb, [(hx - 0.005) * k, 0, (1.66 + bob) * k], 0.115 * k, 0.105 * k, 0.07 * k, accC, 9, 4); box(hx + 0.12, 0, 1.64 + bob, 0.07, 0.08, 0.012, accC); break;
    case 'cane': stick([handF + 0.05, handL, handZ + 0.02], [handF + 0.16, handL + 0.02, 0], 0.016, accC); break;
    case 'umbrella': stick([handF + 0.02, handL, handZ + 0.05], [handF + 0.08, handL + 0.02, 0.05], 0.022, accC); break;
    case 'suitcase': {
      // 行李箱拉在身後，拉桿接到右手
      const sx = lean - 0.42, sl = handL + 0.05;
      box(sx, sl, 0.34, 0.1, 0.17, 0.27, accC);
      stick([sx + 0.06, sl, 0.6], [handF, handL, handZ], 0.012, mcol('#9AA1A8'));
      for (const d of [-0.12, 0.12]) ellipsoid(mb, [(sx - 0.04) * k, (sl + d) * k, 0.03 * k], 0.03 * k, 0.015 * k, 0.03 * k, dark, 6, 3);
      break;
    }
  }
  return mbDone(mb);
}

/* ---------- 飛機 ----------
   機身：圓形斷面的旋轉體，機頭圓鈍、機尾變細上翹；一格格的客艙窗、駕駛艙擋風玻璃、腰線與機腹塗裝。
   主翼、水平尾翼、垂直尾翼、小翼與吊架：NACA 對稱翼型斷面，沿翼展漸細、後掠、上反。
   發動機：短艙旋轉體，前緣深色進氣口；ATR 是翼上的短艙加螺旋槳盤。 */
// 翼面：secs 是沿翼展的斷面 [{x 前緣, y, z, c 弦長, t 厚度比}]，thick 指厚度方向（'z' 主翼、'y' 垂直尾翼）
function foil(mb, secs, thick, color, NC = 12) {
  const cs = [];
  for (let i = 0; i <= NC; i++) cs.push((1 - Math.cos(Math.PI * i / NC)) / 2); // 前緣附近密一點
  const tk = (c, t) => 5 * t * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4);
  const loop = [];
  for (let i = NC; i >= 0; i--) loop.push([cs[i], 1]);
  for (let i = 1; i <= NC; i++) loop.push([cs[i], -1]);
  const rows = secs.map(S => loop.map(([c, sd]) => { const d = tk(c, S.t) * S.c * sd; return thick === 'z' ? [S.x - c * S.c, S.y, S.z + d] : [S.x - c * S.c, S.y + d, S.z]; }));
  // 翼尖收口：最後一個斷面壓扁成一條線
  const last = secs[secs.length - 1];
  rows.push(loop.map(([c]) => [last.x - c * last.c, last.y, last.z]));
  const cx = secs.reduce((s, q) => s + q.x - q.c / 2, 0) / secs.length, cy = secs.reduce((s, q) => s + q.y, 0) / secs.length, cz = secs.reduce((s, q) => s + q.z, 0) / secs.length;
  surf(mb, rows, (i, j) => color(i, j, secs.length, (loop[j][0] + loop[Math.min(j + 1, loop.length - 1)][0]) / 2), false, [cx, cy, cz]);
}
// 尾翼塗裝：依 AIR_LIVERY 的 fin 圖案，算出尾翼上 (u 翼根→翼尖, v 前緣→後緣) 這一點的顏色。asp：弦長／翼高，讓圓形標誌不會被拉成橢圓
function finPaint(Lv, u, v, asp) {
  let c = Lv.tail || '#8C9AA6';
  for (const op of Lv.fin || []) {
    const k = op[0];
    if (k === 'top') { if (u >= op[1]) c = op[2]; }
    else if (k === 'band') { if (u >= op[1] && u < op[2]) c = op[3]; }
    else if (k === 'diag') { if (u > op[1] + op[2] * v) c = op[3]; }
    else if (k === 'stripes') { const w = (u * 1.2 + v * 0.9) * op[1]; if (w % 1 < 0.42 && u > 0.12) c = op[2]; }
    else {
      const du = u - op[1], dv = (v - op[2]) * asp, d = Math.hypot(du, dv) / op[3];
      if (k === 'disc') { if (d < 1) c = op[4]; }
      else if (k === 'half') { if (d < 1) c = du > 0.04 * Math.sin(dv / op[3] * Math.PI) * op[3] * 4 ? op[4] : op[5]; }
      else if (k === 'flower') { const a = Math.atan2(du, dv), petal = 0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)); if (d < 0.28) c = op[5]; else if (d < petal) c = op[4]; }
    }
  }
  return c;
}
function planeMesh(type, airline, gearDown, lo = false) {
  const T = AC_TYPES[type], Lv = AIR_LIVERY[airline] || {}, mb = MB();
  const body = mcol(Lv.body || '#EEF1F4'), belly = mcol(Lv.belly || Lv.body || '#E2E6EA'), tail = mcol(Lv.tail || TAIL_OLD[airline] || '#8C9AA6');
  const crown = Lv.crown ? mcol(Lv.crown) : null, cheat = (Lv.cheat || []).map(([z, w, c]) => [z, w, mcol(c)]);
  const nacC = mcol(Lv.nac || '#B7C0C8'), lipC = Lv.lip ? mcol(Lv.lip) : null, wlC = mcol(Lv.wl || Lv.tail || TAIL_OLD[airline] || '#8C9AA6');
  const finCache = new Map(), finCol = hex => { let c = finCache.get(hex); if (!c) finCache.set(hex, c = mcol(hex)); return c; };
  const dark = mcol('#1E2630'), wingC = mcol(mixHex(Lv.body || '#EEF1F4', '#9AA3AD', 0.25)), metal = mcol('#B7C0C8'), gearC = mcol('#3A4148'), tire = mcol('#202326');
  const z0 = gearDown ? T.gear : 0, NCf = lo ? 7 : 12;
  const L = T.L, D = T.D, R = D / 2, nose = L / 2, tailEnd = -L / 2;
  const noseLen = D * 1.9, tailLen = L * 0.24;
  const prof = fw => {
    if (fw > nose - noseLen) { const k = Math.min(1, (fw - (nose - noseLen)) / noseLen); const e = Math.sqrt(Math.max(0, 1 - k * k)); return { r: R * e, lo: R * (1 - e) * 0.55, hi: D - R * (1 - e) * 0.62 }; }
    if (fw < tailEnd + tailLen) { const k = Math.min(1, 1 - (fw - tailEnd) / tailLen); return { r: R * (1 - 0.84 * k ** 1.2), lo: D * 0.66 * k * k, hi: D - D * 0.06 * k }; }
    return { r: R, lo: 0, hi: D };
  };
  // 機身斷面位置：機頭、機尾密一點；客艙每 0.53 公尺一格（窗、窗間柱交錯）
  const xs = [], cabinF = nose - noseLen * 0.95, cabinA = tailEnd + tailLen * 0.9, pitchW = lo ? 2.4 : T.prop ? 0.48 : 0.53;
  for (let i = 0; i <= 8; i++) xs.push(tailEnd + tailLen * (i / 8) ** 1.3);
  for (let x = tailEnd + tailLen + pitchW / 2; x < nose - noseLen; x += pitchW / 2) xs.push(x);
  for (let i = 0; i <= 14; i++) xs.push(nose - noseLen + noseLen * Math.sin(Math.PI / 2 * i / 14));
  xs.sort((a, b) => a - b);
  const SEG = lo ? 14 : 24, rows = [], info = [];
  for (const x of xs) {
    const P = prof(x), h = P.hi - P.lo, rz = h / 2, zc = P.lo + rz, row = [];
    for (let j = 0; j <= SEG; j++) { const g = -Math.PI / 2 + j / SEG * Math.PI * 2; row.push([x, Math.cos(g) * P.r, z0 + zc + Math.sin(g) * rz]); }
    rows.push(row); info.push({ x, zc: z0 + zc, rz, r: P.r });
  }
  const winZ = 0.62, stripeZ = 0.36, doorC = mcol(mixHex(Lv.body || '#EEF1F4', '#7D8790', 0.28));
  // 艙門位置（機頭往後）：窄體機前後各一＋翼上逃生門；廣體機每側四到五個
  const cabLen = cabinF - cabinA, doorX = (T.L > 55 ? [0.02, 0.3, 0.62, 0.97] : T.prop ? [0.03, 0.97] : [0.03, 0.5, 0.97]).map(u => cabinF - cabLen * u);
  surf(mb, rows, (i, j) => {
    const A = rows[i][j], B = rows[i + 1][j + 1], x = (A[0] + B[0]) / 2, y = (A[1] + B[1]) / 2, z = (A[2] + B[2]) / 2, I = info[i];
    const rel = I.rz > 0.01 ? (z - I.zc) / I.rz : 0, hz = (rel + 1) / 2; // 0 機腹 ~ 1 機頂
    // 駕駛艙擋風玻璃：左右各兩、三片，中間窗框；A350 的窗框一圈塗黑（「浣熊面罩」）
    if (x > nose - noseLen * 0.8 && x < nose - noseLen * 0.4 && hz > 0.58 && hz < 0.88 && Math.abs(y) < I.r * 0.88) {
      const ay = Math.abs(y) / I.r;
      if (type === 'A359') return dark;
      if (ay < 0.07 || (ay > 0.42 && ay < 0.5) || hz > 0.84 || hz < 0.62) return body === belly && !Lv.body ? mcol('#D5DADF') : body;
      return dark;
    }
    // 艙門：比機身略深的長方形（左右對稱），門上一個小窗
    if (!lo && Math.abs(y) > I.r * 0.55 && hz > 0.3 && hz < 0.8) for (const dx of doorX) if (Math.abs(x - dx) < 0.55) return Math.abs(x - dx) < 0.18 && Math.abs(hz - winZ) < 0.05 ? dark : doorC;
    if (x < cabinF && x > cabinA && Math.abs(hz - winZ) < 0.055 && Math.abs(y) > I.r * 0.5) {
      if (lo) return dark; // 遠看：窗戶連成一條線
      const ph = ((x - (tailEnd + tailLen)) / pitchW) % 1;
      if (ph > 0.15 && ph < 0.65) return dark;
    }
    // 腰線：從機頭後方一路到機尾（遠看的簡化模型只畫最主要的一條）
    if (x < cabinF + noseLen * 0.4 && x > cabinA - tailLen * 0.3) for (const [cz, w, c] of lo ? cheat.slice(0, 1) : cheat) if (Math.abs(hz - cz) < w * (lo ? 2 : 1) + 0.012) return c;
    if (hz < 0.3) return belly;
    if (crown && hz > 0.5) return crown;
    return body;
  }, true, [0, 0, z0 + R]);

  // 主翼
  const semi = T.b / 2, rootLE = nose - L * T.wx, tanSw = Math.tan(T.sw / DEG);
  const wingZ = z0 + (T.prop ? D * 0.95 : D * 0.16), dih = T.prop ? 0.02 : 0.09;
  const le = y => rootLE - (y - R) * tanSw, ch = y => T.cr + (T.ct - T.cr) * Math.max(0, y - R) / (semi - R);
  const wz = y => wingZ + Math.max(0, y - R) * dih;
  for (const s of [-1, 1]) {
    const ys = [R * 0.55, R, R + (semi - R) * 0.15, R + (semi - R) * 0.35, R + (semi - R) * 0.6, R + (semi - R) * 0.85, semi];
    foil(mb, ys.map(y => ({ x: le(y) + (y < R ? 0.4 : 0), y: s * y, z: wz(y), c: ch(y) * (y < R ? 1.08 : 1), t: 0.13 - 0.04 * (y - R) / semi })), 'z', () => wingC, NCf);
    // 小翼：從翼尖往上翹
    if (T.wl) { const c = ch(semi) * 0.85, x0 = le(semi) - ch(semi) * 0.05; foil(mb, [0, 0.5, 1].map(u => ({ x: x0 - u * T.wl * 0.6, y: s * (semi + 0.05 + u * 0.35), z: wz(semi) + 0.05 + u * T.wl, c: c * (1 - 0.55 * u), t: 0.08 })), 'y', () => wlC, NCf); }
    // 發動機
    const ey = R + (semi - R) * T.ey, er = T.de / 2;
    if (T.prop) {
      const ef = le(ey) + T.le * 0.25, ezc = wingZ + er * 0.35, ea = ef - T.le;
      const nr = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, x = ea + (ef - ea) * u, r = er * (u < 0.15 ? 0.5 + u / 0.15 * 0.5 : u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) * 0.9 + 0.1 : 1); const row = []; for (let j = 0; j <= 14; j++) { const g = j / 14 * Math.PI * 2; row.push([x, s * ey + Math.cos(g) * r * 0.8, ezc + Math.sin(g) * r]); } nr.push(row); }
      surf(mb, nr, () => body, true, [(ea + ef) / 2, s * ey, ezc]);
      tube(mb, [ef + 0.05, s * ey, ezc], [ef + 0.12, s * ey, ezc], 1.95, 1.95, 24, mcol('#4C5560'));
      tube(mb, [ef, s * ey, ezc], [ef + 0.55, s * ey, ezc], er * 0.32, 0.02, 10, mcol('#2A2F35'), false);
    } else {
      const ef = le(ey) + T.le * 0.55, ea = ef - T.le, ezc = wz(ey) - er - 0.3;
      const nr = [];
      const prf = u => u < 0.1 ? 0.88 + 0.12 * Math.sin(u / 0.1 * Math.PI / 2) : u < 0.45 ? 1 : 1 - 0.32 * ((u - 0.45) / 0.55) ** 1.4;
      for (let i = 0; i <= 14; i++) { const u = i / 14, x = ef - T.le * u, r = er * prf(u), row = []; for (let j = 0; j <= 18; j++) { const g = j / 18 * Math.PI * 2; row.push([x, s * ey + Math.cos(g) * r, ezc + Math.sin(g) * r]); } nr.push(row); }
      surf(mb, nr, i => i === 0 ? dark : i === 1 && lipC ? lipC : nacC, true, [(ea + ef) / 2, s * ey, ezc]);
      tube(mb, [ef - 0.25, s * ey, ezc], [ef - 0.2, s * ey, ezc], er * 0.86, er * 0.86, 18, dark); // 進氣口內的風扇
      tube(mb, [ef - 0.3, s * ey, ezc], [ef + 0.25, s * ey, ezc], er * 0.22, 0.02, 10, metal, false); // 鼻錐
      tube(mb, [ea + 0.2, s * ey, ezc], [ea - T.le * 0.18, s * ey, ezc], er * 0.5, 0.05, 10, mcol('#5B636B'), false); // 尾錐
      foil(mb, [0, 1].map(u => ({ x: ef - T.le * 0.25 + u * 0.4, y: s * ey, z: ezc + er * 0.8 + (wz(ey) - ezc - er * 0.8 + 0.2) * u, c: T.le * 0.75, t: 0.12 })), 'y', () => metal, NCf);
    }
  }
  // 翼身整流罩
  if (!T.prop) ellipsoid(mb, [rootLE - T.cr * 0.45, 0, z0 + D * 0.16], T.cr * 0.75, R * 0.98, D * 0.2, belly, 16, 6, 2.4);
  // 尾翼
  const finRoot = T.cr * 1.05, finLE = tailEnd + tailLen * 0.62, finTanSw = Math.tan((T.prop ? 30 : 40) / DEG);
  const finBase = z0 + prof(finLE - finRoot / 2).hi - 0.25;
  // 尾翼：近看時沿翼高切 25 段、沿弦長 28 格，標誌才畫得出形狀；遠看只切 5 段
  const finUs = lo ? [0, 0.25, 0.5, 0.75, 1] : Array.from({ length: 25 }, (_, i) => i / 24);
  foil(mb, finUs.map(u => ({ x: finLE + 0.6 * (1 - u) - u * T.fin * finTanSw, y: 0, z: finBase + u * T.fin, c: finRoot * (1 - 0.6 * u) + (u === 0 ? 0.8 : 0), t: 0.12 - 0.03 * u })), 'y', (i, j, n, cf) => {
    if (!Lv.fin) return tail;
    const u = Math.min(1, (i + 0.5) / (n - 1)), asp = finRoot * (1 - 0.6 * u) / T.fin;
    return finCol(finPaint(Lv, u, cf, asp));
  }, lo ? NCf : 28);
  const hsZ = T.prop ? finBase + T.fin * 0.97 : z0 + D * 0.42, hsLE = T.prop ? finLE - T.fin * finTanSw + 0.2 : tailEnd + tailLen * 0.42, hsC = T.cr * 0.5, hsTan = Math.tan((T.prop ? 8 : 32) / DEG);
  for (const s of [-1, 1]) foil(mb, [0, 0.35, 0.7, 1].map(u => ({ x: hsLE - u * T.hs * hsTan, y: s * (0.3 + u * (T.hs - 0.3)), z: hsZ + u * T.hs * (T.prop ? 0 : 0.08), c: hsC * (1 - 0.55 * u), t: 0.1 })), 'z', () => wingC, NCf);
  // 襟翼滑軌整流罩：主翼後緣下方的獨木舟形狀
  if (!lo && !T.prop) for (const s of [-1, 1]) for (const u of [0.18, 0.38, 0.58]) {
    const y = R + (semi - R) * u, xc = le(y) - ch(y) * 0.85;
    ellipsoid(mb, [xc, s * y, wz(y) - 0.22], ch(y) * 0.32, 0.22, 0.28, wingC, 8, 4, 2.2);
  }
  // 燈：機頂、機腹紅色防撞燈，左翼尖紅、右翼尖綠的航行燈，機尾白燈
  { const red = mcol('#FF3B30', 1), mid = (cabinF + cabinA) / 2;
    ellipsoid(mb, [mid, 0, z0 + D + 0.05], 0.18, 0.18, 0.1, red, 6, 3);
    ellipsoid(mb, [mid - L * 0.05, 0, z0 - 0.04], 0.18, 0.18, 0.1, red, 6, 3);
    for (const s of [-1, 1]) ellipsoid(mb, [le(semi) - 0.3, s * (semi + 0.05), wz(semi)], 0.16, 0.12, 0.1, mcol(s > 0 ? '#38E07A' : '#FF3B30', 1), 6, 3);
    ellipsoid(mb, [tailEnd - 0.05, 0, z0 + D * 0.62], 0.12, 0.12, 0.12, mcol('#FFFFFF', 1), 6, 3);
  }
  // 機尾 APU 排氣口
  if (!T.prop) tube(mb, [tailEnd + 0.4, 0, z0 + D * 0.62], [tailEnd - 0.08, 0, z0 + D * 0.62], 0.22, 0.2, 10, mcol('#3A3F45'));
  // 起落架：鼻輪兩輪；主輪窄體每側兩輪，A330／787／A350 每側四輪，777 每側六輪（三軸台車）
  if (gearDown) {
    const g = T.gear, nx = nose - noseLen * 1.05, wr = Math.min(0.62, g * 0.32);
    tube(mb, [nx, 0, z0 + 0.3], [nx, 0, wr], 0.12, 0.1, 8, gearC, false);
    tube(mb, [nx + 0.25, 0, z0 + 0.1], [nx, 0, wr + 0.4], 0.05, 0.05, 6, gearC, false); // 斜撐
    for (const sy of [-1, 1]) tube(mb, [nx, sy * 0.12, wr], [nx, sy * 0.38, wr], wr * 0.85, wr * 0.85, 12, tire);
    const axles = type === 'B77W' ? 3 : T.L > 55 ? 2 : 1, y0 = R * (T.prop ? 0.95 : 1.1), gf = rootLE - T.cr * 0.72, ax = 1.45;
    for (const s of [-1, 1]) {
      tube(mb, [gf, s * y0, z0 + D * 0.2], [gf, s * y0, wr * 1.2], 0.2, 0.17, 8, gearC, false);
      tube(mb, [gf, s * y0, z0 + D * 0.15], [gf + 1.2, s * (y0 - 0.9), z0 + D * 0.45], 0.08, 0.08, 6, gearC, false); // 側撐桿
      if (axles > 1) tube(mb, [gf - ax * (axles - 1) / 2 - 0.2, s * y0, wr * 1.05], [gf + ax * (axles - 1) / 2 + 0.2, s * y0, wr * 1.05], 0.12, 0.12, 6, gearC); // 台車樑
      for (let k = 0; k < axles; k++) { const dx = (k - (axles - 1) / 2) * ax; for (const dy of [-0.34, 0.34]) tube(mb, [gf + dx, s * y0 + dy - 0.17, wr * 1.05], [gf + dx, s * y0 + dy + 0.17, wr * 1.05], wr * 1.05, wr * 1.05, 14, tire); }
    }
  }
  return mbDone(mb);
}

/* ---------- 共用的繪製程式 ----------
   打光：主光（跟地圖的日夜、方位一樣）＋天空與地面的環境光＋一點點亮面反光，曲面才看得出立體；
   自發光的部分（亮著的車窗、車燈）不受光線影響 */
const GL3D = {
  progs: new WeakMap(),
  prog(gl) {
    let p = this.progs.get(gl); if (p) return p;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
      uniform mat4 u_pm; uniform mat3 u_r; uniform vec3 u_light; uniform vec3 u_lc; uniform float u_li;
      attribute vec3 a_pos; attribute vec3 a_n; attribute vec4 a_c; varying vec3 v_c;
      void main() {
        vec3 n = normalize(u_r * a_n);
        float d = max(dot(n, u_light), 0.0);
        float sky = 0.5 + 0.5 * n.z;
        float k = (mix(0.34, 0.62, sky) + 0.62 * d) * clamp(0.3 + u_li * 2.3, 0.45, 1.05);
        vec3 hv = normalize(u_light + vec3(0.0, 0.0, 1.0));
        float sp = pow(max(dot(n, hv), 0.0), 28.0) * 0.22 * clamp(u_li * 3.0, 0.0, 1.0);
        vec3 lit = a_c.rgb * mix(vec3(1.0), u_lc, 0.35) * k + sp * u_lc;
        v_c = mix(lit, a_c.rgb, a_c.a);
        gl_Position = u_pm * vec4(a_pos, 1.0);
      }`));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform float u_alpha; varying vec3 v_c; void main() { gl_FragColor = vec4(clamp(v_c, 0.0, 1.0), u_alpha); }`));
    gl.linkProgram(prog);
    p = { prog, pm: gl.getUniformLocation(prog, 'u_pm'), r: gl.getUniformLocation(prog, 'u_r'), light: gl.getUniformLocation(prog, 'u_light'), lc: gl.getUniformLocation(prog, 'u_lc'), li: gl.getUniformLocation(prog, 'u_li'), alpha: gl.getUniformLocation(prog, 'u_alpha'),
      attrs: ['a_pos', 'a_n', 'a_c'].map(a => gl.getAttribLocation(prog, a)) };
    this.progs.set(gl, p); return p;
  },
  upload(gl, d) {
    return { n: d.n, bufs: [d.P, d.N, d.C].map(arr => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; }) };
  },
  // 地圖目前的光線：方向（墨卡托座標，z 朝上）、顏色、強度
  light() {
    let lc = [1, 1, 1], li = 0.3, dir = [0.4, -0.3, 0.86];
    try {
      const lt = map.getLight() || {};
      if (typeof lt.color === 'string' && lt.color[0] === '#') lc = mcol(lt.color).slice(0, 3);
      if (typeof lt.intensity === 'number') li = lt.intensity;
      if (Array.isArray(lt.position)) { const a = lt.position[1] / DEG, pl = lt.position[2] / DEG; dir = [Math.sin(pl) * Math.sin(a), -Math.sin(pl) * Math.cos(a), Math.cos(pl)]; }
    } catch {}
    return { lc, li, dir };
  },
  // alpha < 1：半透明（城市建築，隔著建築也看得到列車）
  begin(gl, alpha = 1) {
    const p = this.prog(gl), L = this.light();
    gl.useProgram(p.prog);
    gl.uniform3fv(p.light, L.dir); gl.uniform3fv(p.lc, L.lc); gl.uniform1f(p.li, L.li); gl.uniform1f(p.alpha, alpha);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    if (alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    p.bound = null;
    return p;
  },
  // matrix：地圖的投影矩陣；m：模型矩陣（本地公尺 → 墨卡托），兩者用雙精度相乘
  draw(gl, p, mesh, matrix, m) {
    const PM = PlaneGLmul(matrix, m);
    const sx = Math.hypot(m[0], m[1], m[2]) || 1, sy = Math.hypot(m[4], m[5], m[6]) || 1, sz = Math.hypot(m[8], m[9], m[10]) || 1;
    gl.uniformMatrix4fv(p.pm, false, new Float32Array(PM));
    gl.uniformMatrix3fv(p.r, false, new Float32Array([m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz]));
    if (p.bound !== mesh) {
      mesh.bufs.forEach((b, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(p.attrs[i]); gl.vertexAttribPointer(p.attrs[i], i === 2 ? 4 : 3, gl.FLOAT, false, 0, 0); });
      p.bound = mesh;
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  },
  // 模型矩陣：ll 經緯度、alt 高度（公尺）、brg 方位角（弧度，0 = 北，順時針）、pitch 抬頭角（弧度）、sx 沿 x 縮放
  model(ll, alt, brg, pitch = 0, sx = 1) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(ll, alt), s = mc.meterInMercatorCoordinateUnits();
    const fw = [Math.sin(brg), -Math.cos(brg)], rt = [Math.cos(brg), Math.sin(brg)];
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const F = [fw[0] * cp, fw[1] * cp, sp], U = [-fw[0] * sp, -fw[1] * sp, cp];
    return [F[0] * s * sx, F[1] * s * sx, F[2] * s * sx, 0, rt[0] * s, rt[1] * s, 0, 0, U[0] * s, U[1] * s, U[2] * s, 0, mc.x, mc.y, mc.z, 1];
  },
  /* 場景網格（車站、軌道、城市）的位置矩陣。網格的 x、y 是 proj() 的公里座標 ×1000，
     但 proj() 是以北緯 23.7° 為準的等距投影，不是真的公尺：台北一帶東西方向差約 1%、南北差約 0.5%。
     以前直接當公尺擺，離原點越遠偏越多，鏡頭一移動、原點換了，整片景物就跳一下，也跟列車對不齊。
     這裡把 proj 單位直接換成墨卡托座標，位置就跟 unproj() 完全一致，不管原點在哪都一樣。 */
  local(ll) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(ll, 0), s = mc.meterInMercatorCoordinateUnits();
    const ax = 1 / (KX * 1000 * 360), ay = 1 / (KY * 1000 * 360 * Math.cos(ll[1] * Math.PI / 180));
    return [ax, 0, 0, 0, 0, ay, 0, 0, 0, 0, s, 0, mc.x, mc.y, mc.z, 1];
  },
};

/* ===== 場景：車站、高架橋、城市建築、行道樹、路燈、機場 =====
   這些東西不會動，附近的全部合成一個大網格、一次畫完；鏡頭移動夠遠才重建。
   座標以某個原點為中心：x 往東、y 往南、z 往上（公尺），用 GL3D.model(原點, 0, π/2) 擺到地圖上。 */

// 沿路徑放樣：path 是 [x, y, nx, ny, z0]（位置、單位法向量、整體抬高），sec 是封閉斷面 [側向, 高度]；
// color(i, j) 依沿路徑第 i 段、斷面第 j 段決定顏色。兩端封口
function loftPath(mb, path, sec, color, caps = true) {
  if (path.length < 2) return;
  let sl = 0, sz = 0; for (const [l, z] of sec) { sl += l; sz += z; } sl /= sec.length; sz /= sec.length;
  const ring = (p, k) => sec.concat([sec[0]]).map(([l, z]) => { const L = sl + (l - sl) * k, Z = sz + (z - sz) * k + (p[4] || 0); return [p[0] + p[2] * L, p[1] + p[3] * L, Z]; });
  const rows = [];
  if (caps) rows.push(ring(path[0], 0), ring(path[0], 0.97));
  for (const p of path) rows.push(ring(p, 1));
  if (caps) rows.push(ring(path[path.length - 1], 0.97), ring(path[path.length - 1], 0));
  const off = caps ? 2 : 0, n = path.length - 1;
  surf(mb, rows, (i, j) => color(Math.max(0, Math.min(n - 1, i - off)), j, i < off || i >= off + n), false, 'rows');
}
// 一片牆：a→b（平面座標）、高度 zs（由下往上）、沿牆的切點 us（0~1）；center 是建築內部的一點，法向量朝外
function panel(mb, a, b, zs, us, color, center) {
  const rows = zs.map(z => us.map(u => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z]));
  surf(mb, rows, color, false, center);
}
// 平面多邊形（屋頂、樓板）：扇形三角化，凸多邊形與大部分建築外框都適用；up 決定法向量朝上或朝下
function capPoly(mb, pts, z, col, up = true) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  const nz = up ? 1 : -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (const p of [[cx, cy], a, b]) { mb.P.push(p[0], p[1], z); mb.N.push(0, 0, nz); mb.C.push(col[0], col[1], col[2], col[3]); }
  }
}

/* 一棟大樓：外牆每層一列窗（窗框、玻璃、樓板線分開上色），一樓是店面玻璃，屋頂有女兒牆。
   pts 是外框（公尺，不含重複的終點），h 樓頂高、b0 起始高度，detail 為 false 時只畫樓層帶不切窗 */
function buildingMesh(mb, pts, h, b0, o) {
  const n = pts.length; if (n < 3) return;
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
  const center = [cx, cy, (h + b0) / 2], FL = 3.4, nF = Math.max(1, Math.floor((h - b0) / FL));
  const wall = mcol(o.wall), band = mcol(o.band), rim = mcol(o.rim);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], Lw = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lw < 0.5) continue;
    const zs = [b0], us = [0];
    // 樓層：窗台、窗頂兩條切線
    for (let k = 0; k < nF; k++) { const z = b0 + k * FL; zs.push(z + (k ? 0.9 : 0.4), z + (k ? 2.6 : 2.9)); }
    zs.push(h);
    const nw = o.detail ? Math.max(1, Math.round(Lw / 3.2)) : 1;
    for (let k = 0; k < nw; k++) { if (o.detail) us.push((k + 0.18) / nw, (k + 0.82) / nw); }
    us.push(1);
    const uniq = arr => [...new Set(arr.map(v => +v.toFixed(5)))].sort((p, q) => p - q);
    const Z = uniq(zs).filter(z => z <= h), U = uniq(us);
    panel(mb, a, b, Z, U, (r, c) => {
      const z = (Z[r] + Z[r + 1]) / 2, k = Math.floor((z - b0) / FL), inF = z - b0 - k * FL;
      const winRow = k === 0 ? inF > 0.4 && inF < 2.9 : inF > 0.9 && inF < 2.6;
      const u = (U[c] + U[c + 1]) / 2, inCol = !o.detail || (u * nw % 1 > 0.18 && u * nw % 1 < 0.82);
      if (z > b0 + nF * FL - 0.2 && z > h - 1.2) return rim;
      if (winRow && inCol && k < nF) {
        const hsh = o.hash(i * 131 + k * 17 + Math.floor(u * nw));
        return o.lit && hsh < o.on ? mcol(hsh < o.on * 0.25 ? '#FF9E45' : '#FFC25A', 1) : mcol(k === 0 && b0 === 0 ? o.shop : o.glass);
      }
      return k % 4 === 0 && inF < 0.3 ? band : wall;
    }, center);
  }
  // 屋頂與女兒牆
  capPoly(mb, pts, h, mcol(o.roof));
  const inner = pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1, k = Math.max(0, 1 - 0.35 / d); return [cx + (x - cx) * k, cy + (y - cy) * k]; });
  for (let i = 0; i < n; i++) panel(mb, inner[(i + 1) % n], inner[i], [h, h + 0.9], [0, 1], () => rim, center);
}
// 樹：樹幹＋兩三團樹冠
function treeMesh(mb, x, y, h, r, leaf, trunk, seed) {
  tube(mb, [x, y, 0], [x, y, h * 0.55], 0.2, 0.14, 6, trunk, false);
  ellipsoid(mb, [x, y, h * 0.68], r, r, h * 0.3, leaf, 8, 5, 2.2);
  ellipsoid(mb, [x + r * 0.35 * Math.cos(seed * 9), y + r * 0.35 * Math.sin(seed * 9), h * 0.88], r * 0.62, r * 0.62, h * 0.2, leaf, 7, 4, 2.2);
}
// 路燈：燈桿彎出一支燈臂，燈頭夜裡發光
function lampMesh(mb, x, y, ax, ay, lit, pole) {
  tube(mb, [x, y, 0], [x, y, 7], 0.11, 0.08, 7, pole, false);
  tube(mb, [x, y, 7], [x + ax * 1.4, y + ay * 1.4, 7.25], 0.06, 0.06, 6, pole, false);
  ellipsoid(mb, [x + ax * 1.6, y + ay * 1.6, 7.15], 0.4, 0.4, 0.13, lit ? mcol('#FFE3A0', 1) : pole, 8, 3);
}
// 頂樓水塔：架子＋不鏽鋼圓桶
function tankMesh(mb, x, y, z, steel, legs) {
  for (const [dx, dy] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) tube(mb, [x + dx, y + dy, z], [x + dx, y + dy, z + 1.05], 0.05, 0.05, 5, legs, false);
  tube(mb, [x, y, z + 1.0], [x, y, z + 2.9], 1.0, 1.0, 14, steel);
}
// 頂樓鐵皮加蓋：斜屋頂的棚子
function shedMesh(mb, pts, z, sheet, wall) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  const n = pts.length;
  for (let i = 0; i < n; i++) panel(mb, pts[i], pts[(i + 1) % n], [z, z + 2.2], [0, 1], () => wall, [cx, cy, z + 1]);
  // 屋面中央拱起一點，看起來像浪板屋頂
  const rows = [pts.concat([pts[0]]).map(([x, y]) => [x, y, z + 2.2]), pts.concat([pts[0]]).map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5, z + 2.75]), pts.concat([pts[0]]).map(() => [cx, cy, z + 2.9])];
  surf(mb, rows, () => sheet, true, [cx, cy, z]);
}
