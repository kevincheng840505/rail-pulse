/* ===== 場景：3D 車廂模型、跟車視角、光線與天氣 ===== */

/* ---------- 車廂造型 ----------
   依實際車型的編組、車長、車寬與塗裝。單位公尺；寬高略為放大，遠看也認得出來。
   body 車身、stripe/stripe2 腰帶、roof 車頂、nose 車頭流線段長度、cab 車頭色（無則同車身） */
const EX = 1.3;
const LIFT = 0.3; // 車輪踩在鋼軌頂（道碴＋枕木＋鋼軌約 30 公分高）
/* 車頭外形（依實車照片的大致比例）：
   tipH 車鼻最前端的高度比例、hp 側面輪廓往下收的曲率（越大越像子彈頭，前段才開始下降）、
   tipW 最前端寬度比例、wp 俯視輪廓的圓潤度（越大越方、越小越尖） */
const NOSE_SHAPE = {
  THSR:     { tipH: 0.22, hp: 1.35, tipW: 0.3,  wp: 2.2 }, // 700T 長鴨嘴
  TEMU2000: { tipH: 0.3,  hp: 1.1,  tipW: 0.28, wp: 1.9 }, // 普悠瑪 尖流線
  TEMU1000: { tipH: 0.34, hp: 1.1,  tipW: 0.32, wp: 2.0 }, // 太魯閣
  EMU3000:  { tipH: 0.42, hp: 1.2,  tipW: 0.42, wp: 2.4 }, // 新自強 斜面流線
  E1000:    { tipH: 0.5,  hp: 1.0,  tipW: 0.5,  wp: 2.6 },
  EMU900:   { tipH: 0.62, hp: 1.0,  tipW: 0.62, wp: 3.0 }, // 區間車 微斜平頭
  TRTC:     { tipH: 0.84, hp: 1.0,  tipW: 0.8,  wp: 4.0 }, // 捷運 圓角平頭
  TRTC_BR:  { tipH: 0.7,  hp: 1.0,  tipW: 0.72, wp: 3.0 },
  TRTC_Y:   { tipH: 0.72, hp: 1.1,  tipW: 0.66, wp: 2.6 },
  TYMC:     { tipH: 0.6,  hp: 1.1,  tipW: 0.6,  wp: 2.6 },
  TYMC_X:   { tipH: 0.6,  hp: 1.1,  tipW: 0.6,  wp: 2.6 },
  TMRT:     { tipH: 0.62, hp: 1.1,  tipW: 0.6,  wp: 2.6 },
  KRTC:     { tipH: 0.84, hp: 1.0,  tipW: 0.8,  wp: 4.0 },
  LRT:      { tipH: 0.72, hp: 1.0,  tipW: 0.6,  wp: 2.4 },
};
// 每節車廂單側的車門數
const DOORS = { THSR: 1, TEMU2000: 1, TEMU1000: 1, EMU3000: 2, E1000: 2, CHUKUANG: 2, EMU900: 3, TRTC: 4, TRTC_BR: 2, TRTC_Y: 3, TYMC: 3, TYMC_X: 2, TMRT: 4, KRTC: 4, LRT: 1 };
/* 尺寸依各車型公開規格（維基百科）：700T 中間車 25 m、寬 3.38 m、高 3.65 m、車鼻約 8 m；
   普悠瑪 20.7 m／太魯閣 20.5 m、寬 2.9 m；EMU3000、EMU900 20.3 m、寬 2.9 m；
   北捷高運量 C371／C381 23.5 m、寬 3.18 m、高 3.585 m、單側 4 門，不鏽鋼車身配藍色飾條；
   機捷 2000 型 20.25 m、寬 3.03 m、高 3.76 m（直達車紫色、普通車藍色） */
const LIVERY = {
  THSR:     { n:12, len:25,   w:3.38, h:3.65, gap:0.5, nose:8.5, body:'#F3F4F1', stripe:'#F07F1F', stripe2:'#1F2329', roof:'#D9DCDF', skirt:true, name:'700T' },
  TEMU2000: { n:8,  len:20.7, w:2.9,  h:3.6,  gap:0.6, nose:4.5, body:'#F4F4F2', stripe:'#E8452C', stripe2:'#E8452C', roof:'#C9CDD1', cab:'#E8452C', skirt:true, name:'普悠瑪' },
  TEMU1000: { n:8,  len:20.5, w:2.9,  h:3.6,  gap:0.6, nose:4,   body:'#F4F4F2', stripe:'#C8102E', stripe2:'#9AA3AD', roof:'#C9CDD1', cab:'#C8102E', skirt:true, name:'太魯閣' },
  EMU3000:  { n:12, len:20.3, w:2.91, h:3.6,  gap:0.6, nose:3.5, body:'#F2F3F1', stripe:'#E0442E', stripe2:'#2B2F36', roof:'#C9CDD1', cab:'#2B2F36', skirt:true, band:'#20252B', name:'EMU3000' },
  E1000:    { n:12, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:3,   body:'#F2F3F1', stripe:'#E2752B', stripe2:'#E2752B', roof:'#B9BEC4', cab:'#E2752B', name:'推拉式' },
  CHUKUANG: { n:10, len:20,   w:2.9,  h:3.6,  gap:0.7, nose:0,   body:'#E8833A', stripe:'#FFFFFF', stripe2:'#FFFFFF', roof:'#8D8F93', name:'莒光' },
  EMU900:   { n:10, len:20.3, w:2.89, h:3.6,  gap:0.6, nose:2,   body:'#E9ECEF', stripe:'#F2C230', stripe2:'#2D5BA8', roof:'#B9BEC4', cab:'#2D5BA8', name:'EMU900' },
  TRTC:     { n:6,  len:23.5, w:3.18, h:3.585,gap:0.5, nose:1.5, body:'#C9CED3', stripe:'#2D62B0', roof:'#A9AFB5', steel:true, name:'高運量' },
  TRTC_BR:  { n:4,  len:13.7, w:2.5,  h:3.3,  gap:0.5, nose:1.5, body:'#E9EBEC', roof:'#B4BAC0', name:'中運量' },
  TRTC_Y:   { n:4,  len:22,   w:2.65, h:3.5,  gap:0.5, nose:2,   body:'#D9DDE0', roof:'#B4BAC0', name:'中運量' },
  TYMC:     { n:5,  len:20.25,w:3.03, h:3.76, gap:0.5, nose:2.5, body:'#D3D7DB', stripe:'#2E6DB4', roof:'#A9AFB5', steel:true, name:'機捷' },
  TYMC_X:   { n:5,  len:20.25,w:3.03, h:3.76, gap:0.5, nose:2.5, body:'#D3D7DB', stripe:'#6B3FA0', roof:'#A9AFB5', steel:true, name:'機捷直達' },
  TMRT:     { n:2,  len:22,   w:2.9,  h:3.6,  gap:0.5, nose:2.5, body:'#E4E8EB', roof:'#B4BAC0', name:'台中捷運' },
  KRTC:     { n:3,  len:23.5, w:3.2,  h:3.6,  gap:0.5, nose:1.5, body:'#C9CED3', roof:'#A9AFB5', steel:true, name:'高雄捷運' },
  LRT:      { n:5,  len:6.8,  w:2.65, h:3.4,  gap:0,   nose:1.5, body:'#F1F3F1', roof:'#7CBD52', name:'輕軌' },
};
function liveryOf(trip) {
  if (trip.sys === 'THSR') return LIVERY.THSR;
  if (trip.sys === 'TRA') {
    if (trip.type === '莒光') return LIVERY.CHUKUANG;
    if (trip.car && trip.car.startsWith('TEMU2000') || trip.type === '普悠瑪') return LIVERY.TEMU2000;
    if (trip.car && trip.car.startsWith('TEMU1000') || trip.type === '太魯閣') return LIVERY.TEMU1000;
    if (trip.car && /推拉|E1000/.test(trip.car)) return LIVERY.E1000;
    if (trip.type === '自強' || (trip.car && trip.car.startsWith('EMU3000'))) return LIVERY.EMU3000;
    return LIVERY.EMU900;
  }
  const id = trip.line && trip.line.id;
  if (trip.sys === 'TRTC') return id === 'BR' ? LIVERY.TRTC_BR : id === 'Y' ? LIVERY.TRTC_Y : LIVERY.TRTC;
  if (trip.sys === 'KRTC' && id === 'KC') return LIVERY.LRT;
  if (trip.sys === 'TYMC' && /直達/.test((trip.type || '') + (trip.name || ''))) return LIVERY.TYMC_X;
  return LIVERY[trip.sys] || LIVERY.TRTC;
}
const trainLength = trip => { const L = liveryOf(trip); return (L.n * L.len + (L.n - 1) * L.gap) / 1000; };

/* 沿著列車行駛路徑取第 km 公里處的點（投影座標，單位公里） */
/* 上下行各走一條軌道：資料只有一條中心線，依行進方向往旁邊偏移半個軌距，會車時才不會疊在一起。
   台鐵、高鐵靠左行駛，捷運靠右 */
const LEFT_HAND = { TRA: 1, THSR: 1 };
function sideOffset(trip) {
  if (trip._side == null) {
    const L = liveryOf(trip);
    trip._side = (LEFT_HAND[trip.sys] ? -1 : 1) * (L.w * EX / 2 + 0.5) / 1000;
  }
  return trip._side;
}
function trackPoint(trip, km) {
  // 方向取前後各 12 公尺的連線，經過車站接點或轉角時不會突然轉向
  const p = centerPoint(trip, km), a = centerPoint(trip, km - 0.012), b = centerPoint(trip, km + 0.012), o = sideOffset(trip);
  const h = Math.hypot(b.x - a.x, b.y - a.y) > 1e-6 ? Math.atan2(b.y - a.y, b.x - a.x) : p.heading;
  // 投影座標 y 軸朝南，o 為正時偏向行進方向的右側
  return { x: p.x - Math.sin(h) * o, y: p.y + Math.cos(h) * o, heading: h };
}
/* 軌道資料是一站一站接起來的，車站接點常有幾公尺的側向錯位或轉折（彎道上看起來就是 Z 字破圖）。
   在前後 25 公尺內做三角加權平均，把接點的錯位抹成平順的過渡 */
const SMOOTH_W = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], SMOOTH_SUM = 36, SMOOTH_STEP = 0.005;
function centerPoint(trip, km) {
  let x = 0, y = 0;
  for (let i = 0; i < SMOOTH_W.length; i++) {
    const q = rawCenter(trip, km + (i - 5) * SMOOTH_STEP);
    x += q.x * SMOOTH_W[i]; y += q.y * SMOOTH_W[i];
  }
  return { x: x / SMOOTH_SUM, y: y / SMOOTH_SUM, heading: rawCenter(trip, km).heading };
}
function rawCenter(trip, km) {
  const c = trip.cum, n = c.length;
  if (km <= 0) { const p = segPoint(trip.nodes[0], trip.nodes[1], 0); return { x: p.x + Math.cos(p.heading) * km, y: p.y + Math.sin(p.heading) * km, heading: p.heading }; }
  if (km >= c[n - 1]) { const p = segPoint(trip.nodes[n - 2], trip.nodes[n - 1], 1), d = km - c[n - 1]; return { x: p.x + Math.cos(p.heading) * d, y: p.y + Math.sin(p.heading) * d, heading: p.heading }; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= km) lo = mid; else hi = mid; }
  const span = c[hi] - c[lo] || 1e-9;
  return segPoint(trip.nodes[lo], trip.nodes[hi], (km - c[lo]) / span);
}

/* 把一列車拆成一節節車廂的 3D 模型（models.js 的 carMesh）：每節車廂是一個剛體，
   擺在車頭到車尾兩個軌道點的連線上，依坡度抬頭或低頭。停站時車門位置疊上打開的門洞 */
const LIVERY_KEY = new Map(Object.entries(LIVERY).map(([k, v]) => [v, k]));
const PANTO = { THSR: [2, 8], TEMU2000: [1, 5], TEMU1000: [1, 5], EMU3000: [2, 8], EMU900: [1, 6], E1000: [0] };
function carFeatures(trip, pos, P, out, detail) {
  const L = liveryOf(trip), key = LIVERY_KEY.get(L);
  const nDoor = DOORS[key] || 2, doorW = (L.len > 15 ? 1.4 : 1.1) / 1000;
  // 車門開合：停站一開始門向兩側滑開，快開車前關上（0 = 關、1 = 全開）
  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const doorOpen = pos.atStation ? sm((pos.dwell - 0.03) / 0.07) * sm((0.97 - pos.dwell) / 0.07) : 0;
  const lit = P.lit ? P.winLit : '', line = !L.stripe ? trip.color || '' : '';
  const lampF = P.lit ? '#FFF6DC' : '#E9E4D2', lampB = P.lit ? '#FF2D2D' : '#B3262A';
  const sloped = !!elevProfile(trip), E = k => sloped ? elevAt(trip, k) : 0;
  const total = trip.cum[trip.cum.length - 1], panto = PANTO[key] || [];
  let km = pos.km;
  for (let i = 0; i < L.n; i++) {
    const front = km, back = km - L.len / 1000;
    km = back - L.gap / 1000;
    const lead = i === 0, tail = i === L.n - 1 && L.n > 1;
    const f = trackPoint(trip, Math.min(front, total + 0.02)), bk = trackPoint(trip, back);
    const hd = Math.atan2(f.y - bk.y, f.x - bk.x), ef = E(front), eb = E(back);
    const pitch = Math.atan2(ef - eb, (front - back) * 1000), brg = hd + Math.PI / 2;
    const o = { front: lead ? 'nose' : 'end', back: tail ? 'nose' : 'end', lampF: lead ? lampF : '', lampB: tail ? lampB : '', lit: detail ? lit : '', line, detail, panto: panto.includes(i) && !lead && !tail };
    const mk = key + '|' + o.front + o.back + '|' + o.lampF + o.lampB + '|' + o.lit + '|' + line + '|' + (detail ? 1 : 0) + (o.panto ? 'p' : '');
    out.push({ key: mk, make: () => carMesh(L, key, o), m: GL3D.model(unproj((f.x + bk.x) / 2, (f.y + bk.y) / 2), LIFT + (ef + eb) / 2, brg, pitch) });
    // 打開的車門：門洞的寬度跟著開門的程度
    if (doorOpen > 0.02 && (detail || pos.atStation)) {
      const nose = L.nose / 1000, k0 = back + (tail && nose ? nose : 0), span = (front - back) - (lead && nose ? nose : 0) - (tail && nose ? nose : 0);
      for (let j = 0; j < nDoor; j++) {
        const dc = k0 + span * (nDoor === 1 ? 0.9 : nDoor === 2 ? (j ? 0.85 : 0.15) : (j + 0.5) / nDoor), u = (dc - back) / (front - back);
        out.push({ key: 'gap|' + key, make: () => doorGapMesh(L), m: GL3D.model(unproj(bk.x + (f.x - bk.x) * u, bk.y + (f.y - bk.y) * u), LIFT + eb + (ef - eb) * u + 0.005, brg, pitch, doorOpen * doorW * 1000) });
      }
    }
  }
}

/* 各節車廂車門中心所在的里程（與 carFeatures 的車門排法一致），給上下車的旅客找門 */
function trainDoors(trip, headKm) {
  const L = liveryOf(trip), key = Object.keys(LIVERY).find(k => LIVERY[k] === L), nDoor = DOORS[key] || 2, nose = L.nose / 1000, out = [];
  let km = headKm;
  for (let i = 0; i < L.n; i++) {
    const front = km, back = km - L.len / 1000; km = back - L.gap / 1000;
    const lead = i === 0, tail = i === L.n - 1;
    const span = (front - back) - (lead && nose ? nose : 0) - (tail && nose ? nose : 0), k0 = back + (tail && nose ? nose : 0);
    for (let j = 0; j < nDoor; j++) out.push(k0 + span * (nDoor === 1 ? 0.9 : nDoor === 2 ? (j ? 0.85 : 0.15) : (j + 0.5) / nDoor));
  }
  return out;
}

const PERSON_COLOR = '#3F6FB8';
// 中心線上 km 處的位置與方向
function railFrame(trip, km) {
  const p = centerPoint(trip, km), a = centerPoint(trip, km - 0.008), b = centerPoint(trip, km + 0.008);
  const h = Math.atan2(b.y - a.y, b.x - a.x);
  return { x: p.x, y: p.y, nx: -Math.sin(h), ny: Math.cos(h), ux: Math.cos(h), uy: Math.sin(h) };
}
// 沿著軌道、在中心線側向 o0~o1（公里）之間的一條帶狀多邊形
function railBand(trip, k0, k1, o0, o1) {
  const n = Math.max(2, Math.ceil((k1 - k0) / 0.01)), A = [], B = [];
  for (let i = 0; i <= n; i++) {
    const f = railFrame(trip, k0 + (k1 - k0) * i / n);
    A.push(unproj(f.x + f.nx * o0, f.y + f.ny * o0)); B.push(unproj(f.x + f.nx * o1, f.y + f.ny * o1));
  }
  const ring = A.concat(B.reverse()); ring.push(ring[0]); return ring;
}
/* 小人：全身同一個顏色，但用圓柱、橢圓做出鞋子、小腿、大腿、骨盆、胸腔、肩膀、上臂、前臂、脖子和頭。
   hd 是面向的方向，phase 是走路擺動的相位，walk（0~1）是擺動幅度。
   走路時：前後腳交錯，往前邁的那隻腳會抬起來、膝蓋彎（小腿落在大腿後面），
   手臂跟同側的腳反向擺、前臂擺得比上臂多；身體每一步上下起伏一點、微微前傾。 */
function personFig(out, x, y, base, hd, phase, walk, id = '') {
  // 走路的姿勢量化成 16 個相位，同一個角色、配色、相位共用一個模型
  const q = walk ? ((Math.round(phase / (Math.PI / 8)) % 16) + 16) % 16 : -1, [sid, vi] = personStyle(id);
  out.push({ key: 'person|' + sid + '|' + vi + '|' + q, make: () => personMesh(q < 0 ? 0 : q * Math.PI / 8, q < 0 ? 0 : 1, sid, vi), m: GL3D.model(unproj(x, y), base, hd + Math.PI / 2) });
}
// 依旅客的編號決定角色與配色（同一個人每一格都一樣）；角色越常見的越容易抽到
const STYLE_W = [3, 2, 2, 2, 1.2, 0.8, 1.2, 2, 1.2, 0.8];
function personStyle(id) {
  if (!id) return [0, 0];
  let r = hash(id + 'style') * STYLE_W.reduce((a, b) => a + b, 0), sid = 0;
  while (sid < STYLE_W.length - 1 && r > STYLE_W[sid]) r -= STYLE_W[sid++];
  return [sid, hash(id + 'tint') < 0.5 ? 0 : 1];
}
// 角色的走路速度：長輩、拉行李箱的人走得慢
const styleSpeed = id => (PERSON_STYLES[personStyle(id)[0]] || {}).speed || 1;
// 沿著折線走 d 公尺後的位置與方向
function alongPath(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay) * 1000;
    if (d <= L || i === pts.length - 1) { const u = L > 0 ? Math.min(1, Math.max(0, d / L)) : 1; return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, hd: Math.atan2(by - ay, bx - ax) }; }
    d -= L;
  }
  return { x: pts[0][0], y: pts[0][1], hd: 0 };
}
const pathLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 1000; return s; };
const STRIDE = 0.62; // 每半步的距離（公尺）
const walker = (out, pts, d, base, id) => { const p = alongPath(pts, d); personFig(out, p.x, p.y, base, p.hd, d / STRIDE * Math.PI * (personStyle(id)[0] === 5 ? 1.4 : 1), 1, id); };

/* ---------- 多層車站：捷運交會、台鐵高鐵共構的車站，每條線的月台放在不同樓層 ---------- */
const LEVEL_H = 8;      // 一層樓高（公尺）
const RAMP = 0.034;     // 每公尺高差需要的坡道長度（公里），約 3% 的坡度
const LINE_GROUP = { OL: 'O' }; // 同一條線的支線（中和新蘆線的蘆洲支線）放在同一層
const levelKey = trip => trip.sys === 'TRA' || trip.sys === 'THSR' ? trip.sys : 'L:' + (trip.line ? LINE_GROUP[trip.line.id] || trip.line.id : trip.type);
let LEVELS = null;
function buildLevels() {
  LEVELS = new Map(); LEVELS.n = TRIPS.length;
  const keysAt = new Map();
  for (const n of NODES) { const ks = new Set(); for (const [t] of NODE_TRIPS.get(n.id) || []) ks.add(levelKey(t)); if (ks.size) keysAt.set(n, ks); }
  const nodes = [...keysAt.keys()], rank = k => k === 'TRA' ? 0 : k === 'THSR' ? 1 : 2;
  for (const n of nodes) {
    // 250 公尺內的車站視為同一座轉乘站
    const all = new Set();
    for (const m of nodes) if (Math.abs(m.x - n.x) < 0.25 && Math.abs(m.y - n.y) < 0.25 && Math.hypot(m.x - n.x, m.y - n.y) < 0.25) for (const k of keysAt.get(m)) all.add(k);
    if (all.size < 2) continue;
    const order = [...all].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    for (const k of keysAt.get(n)) LEVELS.set(n.id + '|' + k, order.indexOf(k));
    LEVELS.set(n.id + '|hub', true);
  }
}
function stationLevel(node, trip) { if (!LEVELS || LEVELS.n !== TRIPS.length) buildLevels(); return LEVELS.get(node.id + '|' + levelKey(trip)) || 0; }
const isHub = node => { if (!LEVELS || LEVELS.n !== TRIPS.length) buildLevels(); return !!LEVELS.get(node.id + '|hub'); };
// 同一系統（或同一條捷運線）最長的列車，決定月台平台段的長度，讓同線每一班車的坡道起點都一樣
const PLAT_HALF = new Map();
function platHalf(trip) {
  const k = levelKey(trip);
  if (!PLAT_HALF.has(k) || PLAT_HALF.get(k).n !== TRIPS.length) { let L = 0; for (const t of TRIPS) if (levelKey(t) === k) L = Math.max(L, trainLength(t)); PLAT_HALF.set(k, { v: L + 0.03, n: TRIPS.length }); }
  return PLAT_HALF.get(k).v;
}
/* 每一班車沿線的高度：每個車站前後一段（月台長）是平的，站與站之間用坡道接起來。
   兩個高架站離得近就不下到地面；坡度不夠時把低的那站墊高，所以坡度不會超過 RAMP */
function elevProfile(trip) {
  if (trip._ez !== undefined && trip._ezn === TRIPS.length) return trip._ez;
  trip._ezn = TRIPS.length;
  const n = trip.nodes.length, h = trip.nodes.map(nd => stationLevel(nd, trip) * LEVEL_H);
  if (!h.some(v => v > 0)) return (trip._ez = null);
  const half = platHalf(trip), a = trip.cum.map(c => c - half), b = trip.cum.map(c => c + half);
  for (let i = 0; i < n; i++) {
    if (!h[i]) continue;
    let j = i + 1; while (j < n && !h[j]) j++;
    if (j < n && j > i + 1 && a[j] - b[i] < (h[i] + h[j]) * RAMP + 0.3) for (let k = i + 1; k < j; k++) h[k] = Math.min(h[i], h[j]);
  }
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let i = 0; i < n - 1; i++) {
      const gap = Math.max(0, a[i + 1] - b[i]), need = Math.abs(h[i] - h[i + 1]) * RAMP;
      if (need <= gap + 1e-9) continue;
      const lo = h[i] < h[i + 1] ? i : i + 1, hi = lo === i ? i + 1 : i;
      h[lo] = Math.max(0, h[hi] - gap / RAMP); changed = true;
    }
    if (!changed) break;
  }
  return (trip._ez = { a, b, h });
}
function elevAt(trip, km) {
  const P = elevProfile(trip); if (!P) return 0;
  const { a, b, h } = P, c = trip.cum;
  let lo = 0, hi = c.length - 1;
  if (km <= c[0]) return h[0];
  if (km >= c[hi]) return h[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= km) lo = mid; else hi = mid; }
  if (km <= b[lo]) return h[lo];
  if (km >= a[hi]) return h[hi];
  const g0 = b[lo], g1 = a[hi], h0 = h[lo], h1 = h[hi];
  // 站距短就維持在兩站中較低的高度，站距長就回到地面；坡道各自貼著兩端的車站
  const base = g1 - g0 < (h0 + h1) * RAMP + 0.3 ? Math.min(h0, h1) : 0;
  const ss = v => { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); };
  const r0 = (h0 - base) * RAMP, r1 = (h1 - base) * RAMP;
  const e0 = r0 > 0 ? (h0 - base) * ss(1 - (km - g0) / r0) : 0, e1 = r1 > 0 ? (h1 - base) * ss((km - (g1 - r1)) / r1) : 0;
  return base + Math.max(e0, e1);
}
// 高架橋：箱型梁橋面沿著軌道放樣（跟著坡度升降），每 24 公尺一支圓柱橋墩。
// 同一段橋可能被好幾班車各畫一次，用 seen 去重；遇到已經畫過的地方，橋面要多延伸一格接上去，不然會留下一道縫
function viaductFeatures(trip, k0, k1, P, mb, seen, O) {
  const o = Math.abs(sideOffset(trip)), w = liveryOf(trip).w * EX / 1000, half = (o + w / 2 + 0.0007) * 1000 + 1.2;
  const deck = mcol(mixHex('#A8ACAE', P.land, 0.3)), side = mcol(mixHex('#9A9FA3', P.land, 0.3)), pier = mcol(mixHex('#8E9397', P.land, 0.3)), step = 0.004;
  // 斷面：兩側矮牆（防音牆）、橋面板，下面是收窄的箱型梁
  const plain = [[-half, 1.0], [-half, -0.9], [-half * 0.55, -1.05], [-half * 0.4, -2.2], [half * 0.4, -2.2], [half * 0.55, -1.05], [half, -0.9], [half, 1.0], [half - 0.22, 1.0], [half - 0.22, 0.05], [-half + 0.22, 0.05], [-half + 0.22, 1.0]];
  let run = [], prev = null, prevSeen = false;
  const flush = () => { if (run.length > 1) loftPath(mb, run, plain, (i, j) => j === 9 ? deck : side); run = []; };
  for (let i = Math.floor(k0 / step); i * step < k1; i++) {
    const k = i * step, e = elevAt(trip, k);
    if (e < 0.05) { flush(); prev = null; continue; }
    const f = railFrame(trip, k), key = levelKey(trip) + Math.round(f.x * 250) + ',' + Math.round(f.y * 250);
    const pt = [(f.x - O.x) * 1000, (f.y - O.y) * 1000, f.nx, f.ny, e];
    if (seen.has(key)) {
      if (run.length) { run.push(pt); flush(); } // 接到已經有的橋面上
      prev = pt; prevSeen = true; continue;
    }
    seen.add(key);
    if (!run.length && prev && prevSeen) run.push(prev); // 從已經有的橋面接出來
    run.push(pt); prev = pt; prevSeen = false;
    if (e > 2.5 && i % 6 === 0) { tube(mb, [pt[0], pt[1], 0], [pt[0], pt[1], e - 2.1], 0.95, 0.85, 12, pier, false); ellipsoid(mb, [pt[0], pt[1], e - 2.15], 1.4, half * 0.5, 0.25, pier, 10, 3, 4); }
  }
  flush();
}

/* 軌道去重：同一股道會被好幾班車（上下行、不同車次）各畫一次，取樣點也不會剛好對齊。
   以 3 公尺的格子記下已經畫過的點；新的點附近若已有點，沿軌道方向 3 公尺內、側向 1.2 公尺內，就算同一股道已經畫過。
   以前用格子座標直接比對，對不齊的地方會畫出兩層同高的道碴，畫面會閃爍、邊緣鋸齒，看起來像物件在微微移動 */
function trackTaken(seen, lk, x, y, ux, uy) {
  const G = seen._track || (seen._track = new Map()), c = 0.003, gx = Math.floor(x / c), gy = Math.floor(y / c);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = G.get(lk + ':' + (gx + i) + ',' + (gy + j)); if (!a) continue;
    for (const [px, py] of a) { const dx = px - x, dy = py - y, al = Math.abs(dx * ux + dy * uy), lat = Math.abs(dy * ux - dx * uy); if (al < 0.003 && lat < 0.0012) return true; }
  }
  const k = lk + ':' + gx + ',' + gy; (G.get(k) || G.set(k, []).get(k)).push([x, y]);
  return false;
}
// 直線段不需要每 5 公尺一個斷面：中間的點離弦線都不到 2 公分就略過（彎道照樣保留細節）
function thinPath(r, tol = 0.02) {
  const out = [r[0]]; let a = 0;
  for (let b = 2; b < r.length; b++) {
    const A = r[a], B = r[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    let ok = b - a < 40;
    for (let i = a + 1; ok && i < b; i++) {
      const p = r[i], t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (L * L);
      if (Math.abs((p[1] - A[1]) * dx - (p[0] - A[0]) * dy) / L > tol || Math.abs(p[4] - (A[4] + (B[4] - A[4]) * t)) > tol) ok = false;
    }
    if (!ok) { a = b - 1; out.push(r[a]); }
  }
  out.push(r[r.length - 1]);
  return out;
}
/* 軌道：每條線上下行各一股道。道碴（碎石道床）、混凝土枕木、兩條鋼軌；台鐵與高鐵再加電車線桿和架空線。
   枕木很多，只畫鏡頭附近 near 公里內 */
function trackFeatures(trip, k0, k1, P, mb, seen, O, near) {
  const o = Math.abs(sideOffset(trip)) * 1000, g = (trip.sys === 'THSR' || trip.sys !== 'TRA' ? 0.72 : 0.54) * EX, step = 0.005;
  const ballast = mcol(mixHex('#8A847A', P.land, 0.25)), sleeper = mcol(mixHex('#B3AFA6', P.land, 0.2)), railSide = mcol('#5E6368'), railTop = mcol('#C2C7CC');
  const wireC = mcol('#2E3236'), mastC = mcol(mixHex('#8C9399', P.land, 0.2));
  const elec = trip.sys === 'TRA' || trip.sys === 'THSR';
  const bsec = [[-g - 1.7, -0.02], [g + 1.7, -0.02], [g + 1.05, 0.14], [-g - 1.05, 0.14]];
  for (const sd of [-1, 1]) {
    const lat = sd * o, runs = [[]];
    let n = 0, prevPt = null;
    for (let i = Math.floor(k0 / step); i * step < k1; i++) {
      const k = i * step, f = railFrame(trip, k), cx = f.x + f.nx * lat / 1000, cy = f.y + f.ny * lat / 1000;
      const r = runs[runs.length - 1], e = elevAt(trip, k), x = (cx - O.x) * 1000, y = (cy - O.y) * 1000, pt = [x, y, f.nx, f.ny, e];
      // 接到別班車已經畫好的那一段：多畫一格接上去，不留縫
      // 跟車時車站的網格是快取的（跟拍的那條線不含枕木和電車線桿），所以就算這段股道車站畫過了，枕木和線桿仍由這裡補上
      const taken = trackTaken(seen, levelKey(trip), cx, cy, f.ux, f.uy);
      if (taken) { if (r.length) { r.push(pt); runs.push([]); } prevPt = pt; if (!seen._detailTaken) continue; }
      else { if (!r.length && prevPt) r.push(prevPt); r.push(pt); prevPt = null; }
      const d = seen._noDetail === levelKey(trip) ? Infinity : Math.hypot(cx - O.x, cy - O.y);
      if (d < near) {
        // 枕木：每 0.6 公尺一根（這一格 5 公尺裡排 8 根）
        // （用 slab 直接寫頂點；以前每根枕木是一顆橢球，跟拍高鐵時一次重建要畫二十幾萬個頂點，手機會卡半秒以上）
        for (let q = 0; q < 8; q++) { const u = (q + 0.5) / 8 * step * 1000, sx = x + f.ux * u, sy = y + f.uy * u; slab(mb, sx, sy, e + 0.12, f.nx, f.ny, g + 0.42, 0.13, 0.1, sleeper); }
      }
      // 電車線桿：每 50 公尺一支，立在股道外側，懸臂伸到軌道正上方
      if (elec && d < near * 2.5 && i % 10 === 0) {
        const mx = x + f.nx * sd * (g + 2.6), my = y + f.ny * sd * (g + 2.6);
        tube(mb, [mx, my, e], [mx, my, e + 7.4], 0.17, 0.12, 8, mastC, false);
        tube(mb, [mx, my, e + 6.9], [x, y, e + 6.6], 0.05, 0.05, 5, mastC, false);
        tube(mb, [mx, my, e + 5.9], [x, y, e + 5.75], 0.04, 0.04, 5, mastC, false);
      }
      n++;
    }
    for (let r of runs) {
      if (r.length < 2) continue;
      r = thinPath(r);
      loftPath(mb, r, bsec, () => ballast, false);
      // 鋼軌：窄的工字形，頂面亮一點
      for (const rs of [-1, 1]) loftPath(mb, r, [[rs * g - 0.035, 0.18], [rs * g + 0.035, 0.18], [rs * g + 0.035, 0.3], [rs * g - 0.035, 0.3]], (i, j) => j === 2 ? railTop : railSide, false);
      // 架空線：吊線與接觸線
      if (elec) for (const z of [5.75, 6.6]) loftPath(mb, r, [[-0.03, z - 0.03], [0.03, z - 0.03], [0.03, z + 0.03], [-0.03, z + 0.03]], () => wireC, false);
    }
  }
}

/* ---------- 車站：月台、雨棚、樓梯、站名牌 ----------
   列車停站時車頭對齊車站點，上行與下行的車身各在車站點的一側，所以兩邊的月台也前後錯開 */
const PLATFORM = {
  THSR: { h: 1.25, w: 6.5, roof: '#E8EBEE', accent: '#F07F1F' },
  TRA:  { h: 1.0,  w: 5.5, roof: '#56636C', accent: '#2F6FB3' },
  LRT:  { h: 0.35, w: 3.0, roof: '#DDE3E6', accent: null },
  MRT:  { h: 1.0,  w: 4.5, roof: '#CBD2D8', accent: null },
};
function platformSpec(trip) { return trip.sys === 'THSR' ? PLATFORM.THSR : trip.sys === 'TRA' ? PLATFORM.TRA : trip.sys === 'LRT' || /輕軌/.test(trip.type) ? PLATFORM.LRT : PLATFORM.MRT; }
// 每座車站每個系統（或每條捷運線）挑一班停靠的列車當作畫月台的基準
const REPS = new Map();
function stationReps(node) {
  const key = node.id + '|' + TRIPS.length; let v = REPS.get(key); if (v) return v;
  const by = new Map();
  for (const [t, i] of NODE_TRIPS.get(node.id) || []) {
    const k = levelKey(t), mid = i > 0 && i < t.nodes.length - 1;
    if (!by.has(k) || (mid && !by.get(k).mid)) by.set(k, { t, i, mid });
  }
  v = [...by.values()].map(r => [r.t, r.i]);
  if (REPS.size > 400) REPS.clear();
  REPS.set(key, v); return v;
}
// 月台的幾何：s 是哪一側（與基準列車同向的那側為 sg）
function platformGeom(node, trip, idx, s) {
  const L = liveryOf(trip), spec = platformSpec(trip), len = trainLength(trip), kS = trip.cum[idx];
  const o = Math.abs(sideOffset(trip)), sg = Math.sign(sideOffset(trip)) || 1, w = L.w * EX / 1000;
  const same = s === sg, [ka, kb] = same ? [kS - len - 0.006, kS + 0.006] : [kS - 0.006, kS + len + 0.006];
  const inner = o + w / 2 + 0.00025, pw = spec.w / 1000, outer = inner + pw;
  const at = (k, lat) => { const f = railFrame(trip, k); return [f.x + f.nx * s * lat, f.y + f.ny * s * lat]; };
  const stairs = [0.35, 0.65].map(u => ka + (kb - ka) * u);
  return { spec, kS, ka, kb, inner, pw, outer, same, sg, at, stairs, e: elevAt(trip, kS), base: elevAt(trip, kS) + spec.h };
}
function stationFeatures(node, trip, idx, P, mb, seen, O) {
  const spec = platformSpec(trip), sg = Math.sign(sideOffset(trip)) || 1, hub = isHub(node);
  const accent = mcol(spec.accent || trip.color || '#888888'), concrete = mcol(mixHex('#B9B5AC', P.land, 0.3)), side = mcol(mixHex('#9C988F', P.land, 0.3));
  const roof = mcol(mixHex(spec.roof, P.bld, 0.15)), yellow = mcol('#E8C547'), metal = mcol('#7A8288'), rail = mcol('#8A9096'), dark = mcol('#2E3338');
  const pt = (k, lat, s) => { const f = railFrame(trip, k); return [(f.x + f.nx * s * lat - O.x) * 1000, (f.y + f.ny * s * lat - O.y) * 1000]; };
  const path = (ka, kb, e, st = 0.005) => { const n = Math.max(1, Math.ceil((kb - ka) / st)), out = []; for (let i = 0; i <= n; i++) { const f = railFrame(trip, ka + (kb - ka) * i / n); out.push([(f.x - O.x) * 1000, (f.y - O.y) * 1000, f.nx, f.ny, e]); } return out; };
  for (const s of [sg, -sg]) {
    const G = platformGeom(node, trip, idx, s), { ka, kb, e } = G, H = spec.h, I = G.inner * 1000 * s, U = G.outer * 1000 * s, bz = e > 0 ? -0.6 : -e;
    const m = v => v * s; // 往月台外側為正
    // 月台：側面、月台邊的白線與黃色導盲磚、主要地坪，邊緣倒角
    const sec = [[I, bz], [I, H - 0.12], [I + m(0.06), H], [I + m(0.3), H], [I + m(0.6), H], [U - m(0.08), H], [U, H - 0.1], [U, bz]];
    loftPath(mb, path(ka, kb, e), sec, (i, j, c) => c ? side : j === 2 ? mcol('#E6E3DC') : j === 3 ? yellow : j === 4 ? concrete : side);
    // 高架的月台底下有一排圓柱
    if (e > 1) for (let k = ka + 0.004; k < kb; k += 0.012) { const [x, y] = pt(k, (G.inner + G.outer) / 2, s); tube(mb, [x, y, 0], [x, y, e - 0.6], 0.4, 0.4, 10, mcol(mixHex('#9AA0A4', P.land, 0.3)), false); }
    // 樓梯口：月台上的深色開口，三面欄杆
    for (const k of G.stairs) {
      loftPath(mb, path(k - 0.0035, k + 0.0035, e, 0.0035), [[U - m(2.2), H + 0.005], [U - m(0.3), H + 0.005], [U - m(0.3), H + 0.03], [U - m(2.2), H + 0.03]], () => dark);
      for (const lat of [2.3, 0.2]) {
        const a = pt(k - 0.0035, G.outer - lat / 1000, s), b = pt(k + 0.0035, G.outer - lat / 1000, s);
        tube(mb, [a[0], a[1], e + H + 1.0], [b[0], b[1], e + H + 1.0], 0.04, 0.04, 6, rail, false);
        for (const p of [a, b]) tube(mb, [p[0], p[1], e + H], [p[0], p[1], e + H + 1.0], 0.035, 0.035, 5, rail, false);
      }
      { const a = pt(k + 0.0035, G.outer - 0.0023, s), b = pt(k + 0.0035, G.outer - 0.0002, s); tube(mb, [a[0], a[1], e + H + 1.0], [b[0], b[1], e + H + 1.0], 0.04, 0.04, 6, rail, false); }
    }
    // 雨棚：多層的轉乘站才有，弧形屋頂架在一排圓柱上，只蓋月台靠外側，從上面看得到停靠的列車
    if (hub) {
      const ca = ka + (kb - ka) * 0.12, cb = kb - (kb - ka) * 0.12, ci = (G.inner + G.pw * 0.4) * 1000 * s, co = U + m(0.4);
      const arc = [], N = 8;
      for (let i = 0; i <= N; i++) { const t = i / N; arc.push([ci + (co - ci) * t, H + 3.45 + 0.35 * Math.sin(Math.PI * t)]); }
      for (let i = N; i >= 0; i--) { const t = i / N; arc.push([ci + (co - ci) * t, H + 3.2 + 0.35 * Math.sin(Math.PI * t)]); }
      loftPath(mb, path(ca, cb, e), arc, (i, j) => j === N * 2 || j === 0 ? accent : roof);
      for (let k = ca; k <= cb; k += 0.016) { const [x, y] = pt(k, G.outer - 0.0012, s); tube(mb, [x, y, e + H], [x, y, e + H + 3.5], 0.16, 0.14, 8, metal, false); }
    }
    // 站名牌：沿軌道方向的一塊線色看板，立在一根柱子上
    for (const u of [0.2, 0.8]) {
      const k = ka + (kb - ka) * u, lo = U - m(1.2);
      loftPath(mb, path(k - 0.0018, k + 0.0018, e, 0.0018), [[lo - 0.08, H + 2.0], [lo + 0.08, H + 2.0], [lo + 0.08, H + 2.7], [lo - 0.08, H + 2.7]], () => accent);
      const [x, y] = pt(k, G.outer - 0.0012, s); tube(mb, [x, y, e + H], [x, y, e + H + 2.0], 0.07, 0.07, 6, metal, false);
    }
  }
  // 高架段的橋面與橋墩（坡道一路畫到落地）
  // 高架段的橋面與橋墩：一路畫到前後兩站（最多各 3 公里），站與站中間不會斷掉
  const c = trip.cum, ka = Math.max(c[idx] - 3, idx > 0 ? c[idx - 1] : c[idx] - 1), kb = Math.min(c[idx] + 3, idx < c.length - 1 ? c[idx + 1] : c[idx] + 1);
  if (elevProfile(trip)) viaductFeatures(trip, ka, kb, P, mb, seen, O);
  trackFeatures(trip, Math.max(ka, c[idx] - 1.2), Math.min(kb, c[idx] + 1.2), P, mb, seen, O, 0.35);
}

/* ---------- 月台上的旅客 ----------
   每一側月台在上一班車開走後開始慢慢聚人，從樓梯走到車門附近排隊；
   列車進站開門後先下後上：下車的人走向樓梯，排隊的人走到最近的車門上車，車開走時月台就空了 */
const SIDE_TRIPS = new Map();
function sideTrips(node, R, idx, same) {
  const key = node.id + '|' + R.idx + '|' + same + '|' + TRIPS.length; let v = SIDE_TRIPS.get(key); if (v) return v;
  const dirOf = (t, i) => { const a = centerPoint(t, t.cum[i] - 0.03), b = centerPoint(t, t.cum[i] + 0.03); return [b.x - a.x, b.y - a.y]; };
  const [rx, ry] = dirOf(R, idx), k = levelKey(R);
  v = (NODE_TRIPS.get(node.id) || []).filter(([t, i]) => { if (levelKey(t) !== k) return false; const [x, y] = dirOf(t, i); return (x * rx + y * ry > 0) === same; });
  if (SIDE_TRIPS.size > 600) SIDE_TRIPS.clear();
  SIDE_TRIPS.set(key, v); return v;
}
function stationPeople(node, R, idx, m, out, cap) {
  const spec = platformSpec(R), sg = Math.sign(sideOffset(R)) || 1;
  const hr = ((m / 60) % 24 + 24) % 24, peak = (hr >= 7 && hr < 9.5) || (hr >= 17 && hr < 19.5) ? 1.8 : hr >= 22.5 || hr < 6 ? 0.35 : 1;
  const rate = (R.sys === 'THSR' ? 0.9 : R.sys === 'TRA' ? 1.3 : spec === PLATFORM.LRT ? 0.5 : 2.2) * peak; // 每分鐘來幾個人
  const nowS = m * 60;
  for (const s of [sg, -sg]) {
    const G = platformGeom(node, R, idx, s), base = G.base, same = G.same;
    const stairPt = k => G.at(k, G.outer - 0.0012);
    const nearStair = (x, y) => { let best = null, bd = 1e9; for (const k of G.stairs) { const p = stairPt(k), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; } } return best; };
    const spotDoors = trainDoors(R, G.kS).map(dk => same ? dk : 2 * G.kS - dk);
    let cur = null, lastDep = -Infinity; const recent = [];
    for (const [t, i] of sideTrips(node, R, idx, same)) for (const off of [0, 1440]) {
      const arr = effTime(t, i, 'arr') - off, dep = effTime(t, i, 'dep') - off, last = i === t.nodes.length - 1;
      if (arr > m + 0.01) continue;
      // 上一班開走的時間不受下面 4 分鐘視窗限制，班距長的路線候車人潮才不會重來
      if (!last && dep <= m && dep > lastDep) lastDep = dep;
      if (dep < m - 4) continue;
      const ev = { t, i, arr, dep, off, last };
      if (arr <= m && m < dep && !last) cur = ev;
      if (i > 0 && arr <= m && arr > m - 3 && dep > arr) recent.push(ev);
    }
    // 車門的位置（月台邊緣），由實際停靠的列車算出來
    const doorsOf = ev => {
      const pos = tripPos(ev.t, (ev.arr + ev.dep) / 2 + ev.off); if (!pos) return [];
      const w2 = liveryOf(ev.t).w * EX / 2000, sgt = Math.sign(sideOffset(ev.t)) || 1;
      return trainDoors(ev.t, pos.km).map(dk => { const p = trackPoint(ev.t, dk), nx = -Math.sin(p.heading) * sgt, ny = Math.cos(p.heading) * sgt; return { x: p.x + nx * w2, y: p.y + ny * w2, nx, ny }; });
    };
    // 下車：開門後一個接一個走出來，走向最近的樓梯
    for (const ev of recent) {
      const D = (ev.dep - ev.arr) * 60, doors = doorsOf(ev), t0 = ev.arr * 60;
      doors.forEach((dp, j) => {
        const key = ev.t.idx + ':' + ev.i + ':' + j, na = Math.floor(hash(key + 'n') * (peak > 1 ? 4 : 2.6) * (R.sys === 'THSR' ? 0.6 : 1));
        for (let q = 0; q < na && out.length < cap; q++) {
          const st = t0 + D * 0.09 + q * 1.3 + hash(key + q) * 1.0; if (st > t0 + D * 0.8) break;
          const tau = nowS - st; if (tau < 0) continue;
          const v = (1.15 + hash(key + 'v' + q) * 0.4) * styleSpeed(key + q), side = (hash(key + 's' + q) - 0.5) * 0.0012;
          const p1 = [dp.x + dp.nx * 0.0012 - dp.ny * side, dp.y + dp.ny * 0.0012 + dp.nx * side];
          const pts = [[dp.x, dp.y], p1, nearStair(dp.x, dp.y)], Lp = pathLen(pts);
          if (tau * v > Lp) continue;
          walker(out, pts, tau * v, base, key + q);
        }
      });
    }
    // 候車：上一班車開走後陸續到來
    const since = Math.max(lastDep, m - 40), cutoff = cur ? cur.arr : m;
    const n = Math.min(spotDoors.length * 3, 30, Math.floor((cutoff - since) * rate));
    const seed = node.id + '|' + s + '|' + Math.round(since * 10), ranks = new Array(spotDoors.length).fill(0);
    const doors = cur ? doorsOf(cur) : null, D = cur ? (cur.dep - cur.arr) * 60 : 0;
    for (let q = 0; q < n && out.length < cap; q++) {
      const aq = since + (q + 0.5 + (hash(seed + q) - 0.5) * 0.9) / rate; if (aq > cutoff) continue;
      const di = Math.floor(hash(seed + 'd' + q) * spotDoors.length), rk = ranks[di]++;
      const along = spotDoors[di] + (rk % 2 ? 1 : -1) * (0.0009 + hash(seed + 'a' + q) * 0.0004), lat = Math.min(G.outer - 0.0006, G.inner + 0.0013 + Math.floor(rk / 2) * 0.0006);
      const spot = G.at(along, lat), face = G.at(along, 0), stair = stairPt(G.stairs[hash(seed + 's' + q) < 0.5 ? 0 : 1]);
      const pid = seed + q, v = (1.1 + hash(seed + 'v' + q) * 0.4) * styleSpeed(pid), path = [stair, spot], Lp = pathLen(path);
      const standAt = sec => Math.min(Lp, Math.max(0, sec - aq * 60) * v);
      // 上車：先等下車的人，再依到月台的先後走向最近的車門
      if (cur && doors.length) {
        const sb = cur.arr * 60 + D * (0.3 + 0.4 * q / Math.max(1, n)), d0 = standAt(sb), p0 = alongPath(path, d0);
        if (nowS >= sb) {
          let dp = doors[0], bd = 1e9; for (const o of doors) { const d = Math.hypot(o.x - spot[0], o.y - spot[1]); if (d < bd) { bd = d; dp = o; } }
          // 走到車門前、在門口停一下（看一下車廂、拉行李箱的人停久一點），再跨進車廂
          const front = [dp.x + dp.nx * 0.0007, dp.y + dp.ny * 0.0007], pts = [[p0.x, p0.y], front, [dp.x - dp.nx * 0.0006, dp.y - dp.ny * 0.0006]], L2 = pathLen(pts);
          const L1 = pathLen(pts.slice(0, 2)), pause = PERSON_STYLES[personStyle(pid)[0]].acc === 'suitcase' ? 1.1 : 0.45;
          const vb = Math.max(v, L2 / Math.max(1, cur.arr * 60 + D * 0.88 - sb - pause)), tt = nowS - sb, t1 = L1 / vb;
          const d = tt < t1 ? tt * vb : tt < t1 + pause ? L1 : L1 + (tt - t1 - pause) * vb * 0.8;
          if (d < L2) {
            if (tt >= t1 && tt < t1 + pause) personFig(out, front[0], front[1], base, Math.atan2(-dp.ny, -dp.nx), 0, 1, pid); // 站在門口（不滑手機）
            else walker(out, pts, d, base, pid);
          }
          continue;
        }
      }
      const d = standAt(nowS);
      if (d < Lp) walker(out, path, d, base, pid);
      else personFig(out, spot[0], spot[1], base, Math.atan2(face[1] - spot[1], face[0] - spot[0]), 0, 0, pid);
    }
  }
}

/* ---------- 跟車視角 ---------- */
const VIEWS = [
  { id: 'persp', name: '透視' },
  { id: 'chase', name: '追車' },
  { id: 'side', name: '側拍' },
  { id: 'orbit', name: '環繞' },
  { id: 'trackside', name: '路邊' },
  { id: 'aerial', name: '空拍' },
];
const M = 0.001; // 1 公尺 = 0.001 公里
const offsetPt = (p, along, side) => {
  const c = Math.cos(p.heading), s = Math.sin(p.heading);
  return { x: p.x + c * along - s * side, y: p.y + s * along + c * side };
};

/* ---------- 光線：依時間在幾個關鍵色票之間平滑內插 ---------- */
const PALETTES = {
  night: { sea:'#050A12', land:'#0F1822', edge:'#1C2733', water:'#06101B', wood:'#0F1D1A', road:'#1D2A37', bld:'#6FA6DE', bldEdge:'#A8D4FF', bldOp:0.6,
    hsShadow:'#000000', hsHigh:'#3A4C60', hsAccent:'#0A121B', label:'#C3CFD8', halo:'#050A12',
    sky:'#081222', horizon:'#1C2B40', fog:'#0B1320', tra:'#A9BCCD', light:'#7C8FB0', glow:0.6, lightI:0.25 },
  dawn: { sea:'#2A3348', land:'#3A3540', edge:'#4A4452', water:'#2C3650', wood:'#2E3A35', road:'#4D4652', bld:'#A396C0', bldEdge:'#DCC8EE', bldOp:0.48,
    hsShadow:'#1A1424', hsHigh:'#E0A27E', hsAccent:'#382A3A', label:'#E6D2C6', halo:'#241E28',
    sky:'#5B5A86', horizon:'#F2A97A', fog:'#7A6070', tra:'#F0E2D4', light:'#FFB98A', glow:0.35, lightI:0.4 },
  day: { sea:'#8EB2C7', land:'#DCDDD0', edge:'#C3C4B4', water:'#86AAC0', wood:'#BFCDB0', road:'#F4F2EA', bld:'#B9C7D6', bldEdge:'#6F8CA8', bldOp:0.32,
    hsShadow:'#4E5C55', hsHigh:'#FFFFFF', hsAccent:'#7D8B80', label:'#3B4650', halo:'#F4F2EA',
    sky:'#6FA8D8', horizon:'#E2ECF0', fog:'#DCE6EA', tra:'#3F4E5E', light:'#FFFFFF', glow:0.15, lightI:0.3 },
  dusk: { sea:'#1F2438', land:'#30293A', edge:'#433A4E', water:'#222A46', wood:'#283029', road:'#4A3F4E', bld:'#9886C2', bldEdge:'#D6BDF0', bldOp:0.5,
    hsShadow:'#140E1A', hsHigh:'#D98A62', hsAccent:'#2E2232', label:'#E2CFC6', halo:'#1C1820',
    sky:'#3E3560', horizon:'#F08A5A', fog:'#4E3A4A', tra:'#EADCCF', light:'#FF9E6A', glow:0.4, lightI:0.4 },
};
// 一天中的關鍵時刻（小時 → 色票）
const TOD_KEYS = [[0, 'night'], [4.9, 'night'], [5.7, 'dawn'], [6.8, 'day'], [16.8, 'day'], [17.7, 'dusk'], [18.7, 'night'], [24, 'night']];
const TOD_FIXED = { day: 11, dusk: 17.7, night: 22, dawn: 5.7 };
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
function paletteAt(hour, wx) {
  let i = 0; while (i < TOD_KEYS.length - 2 && TOD_KEYS[i + 1][0] <= hour) i++;
  const [h0, k0] = TOD_KEYS[i], [h1, k1] = TOD_KEYS[i + 1];
  const t = h1 > h0 ? Math.min(1, Math.max(0, (hour - h0) / (h1 - h0))) : 0;
  const A = PALETTES[k0], B = PALETTES[k1], P = {};
  for (const k in A) P[k] = typeof A[k] === 'number' ? A[k] + (B[k] - A[k]) * t : mixHex(A[k], B[k], t);
  // 天氣：雲越厚越灰、越暗
  const W = WEATHER[wx] || WEATHER.clear;
  const dayness = hour > 6 && hour < 18 ? 1 : 0.3;
  const grey = mixHex('#1B2027', '#9AA3AB', dayness);
  for (const k of ['sea', 'land', 'water', 'wood', 'road', 'hsHigh', 'sky', 'horizon', 'fog', 'light']) P[k] = mixHex(P[k], grey, W.grey);
  // 建築只輕微變灰，夜裡下雨起霧時城市輪廓仍看得清楚
  P.bld = mixHex(P.bld, grey, W.grey * 0.25);
  P.bldOp = Math.min(0.75, P.bldOp + W.grey * 0.25);
  if (W.dark) for (const k of ['sea', 'land', 'water', 'wood', 'road', 'bld', 'sky', 'horizon']) P[k] = mixHex(P[k], '#000000', W.dark);
  P.fogBlend = W.fogBlend; P.lightI *= 1 - W.grey * 0.5;
  P.lit = P.glow > 0.3 || W.dark > 0.25;
  P.winLit = '#FFF0B8';
  return P;
}

/* ---------- 天氣 ---------- */
const WEATHER = {
  clear:  { name: '晴',   icon: '☀', grey: 0,    dark: 0,    fogBlend: 0.55, rain: 0,   fog: 0 },
  cloudy: { name: '多雲', icon: '☁', grey: 0.35, dark: 0.05, fogBlend: 0.4,  rain: 0,   fog: 0.08 },
  rain:   { name: '雨',   icon: '☂', grey: 0.5,  dark: 0.15, fogBlend: 0.25, rain: 0.55, fog: 0.15 },
  storm:  { name: '雷雨', icon: '⛈', grey: 0.6,  dark: 0.3,  fogBlend: 0.18, rain: 1,   fog: 0.2, flash: true },
  fog:    { name: '霧',   icon: '🌫', grey: 0.55, dark: 0.05, fogBlend: 0.04, rain: 0,   fog: 0.55 },
};
// Open-Meteo（免金鑰）WMO 天氣代碼對應
function wmoToWx(code, cloud) {
  if (code >= 95) return 'storm';
  if (code >= 51 && code <= 82) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2 || cloud > 60) return 'cloudy';
  return 'clear';
}
const RealWeather = {
  cache: new Map(), // 0.25 度格點 → {wx, temp, at}
  async at(lon, lat) {
    const key = `${(Math.round(lat * 4) / 4).toFixed(2)},${(Math.round(lon * 4) / 4).toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60e3) return hit;
    const [la, lo] = key.split(',');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=weather_code,cloud_cover,temperature_2m&timezone=Asia%2FTaipei`);
    if (!r.ok) throw new Error('天氣資料 ' + r.status);
    const c = (await r.json()).current;
    const v = { wx: wmoToWx(c.weather_code, c.cloud_cover), temp: Math.round(c.temperature_2m), at: Date.now() };
    this.cache.set(key, v);
    return v;
  },
};

/* 雨滴與閃電：畫在地圖上方的透明畫布 */
const Precip = (() => {
  let cv = null, ctx = null, drops = [], level = 0, flash = 0, nextFlash = 0, night = false, dirty = true;
  function resize() { if (!cv) return; const d = 1; /* 雨絲很細，用 1 倍解析度就夠 */ cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  function init() {
    cv = document.getElementById('precip'); ctx = cv.getContext('2d');
    addEventListener('resize', resize); resize();
  }
  function set(l, isNight, storm) {
    level = l; night = isNight; Precip.storm = storm;
    const want = Math.round(l * 420 * Math.min(1, innerWidth * innerHeight / 1.6e6)); // 小螢幕少一點雨滴
    while (drops.length < want) drops.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 900 + Math.random() * 700, l: 10 + Math.random() * 16 });
    drops.length = want;
  }
  function step(dt, now) {
    if (!ctx) return;
    if (!drops.length && flash <= 0 && !Precip.storm) { if (dirty) { ctx.clearRect(0, 0, innerWidth, innerHeight); dirty = false; } return; }
    dirty = true;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (Precip.storm && now > nextFlash) { flash = 1; nextFlash = now + 6000 + Math.random() * 14000; if (Precip.onFlash) Precip.onFlash(); }
    if (flash > 0) { ctx.fillStyle = `rgba(220,228,255,${flash * 0.35})`; ctx.fillRect(0, 0, innerWidth, innerHeight); flash = Math.max(0, flash - dt / 260); }
    if (!drops.length) return;
    ctx.strokeStyle = night ? 'rgba(170,190,215,.32)' : 'rgba(225,235,245,.45)';
    ctx.lineWidth = 1; ctx.beginPath();
    const s = dt / 1000;
    for (const d of drops) {
      d.y += d.v * s; d.x -= d.v * s * 0.18;
      if (d.y > innerHeight) { d.y = -d.l; d.x = Math.random() * (innerWidth + 200); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
    }
    ctx.stroke();
  }
  return { init, set, step, storm: false };
})();

/* 車頭燈與尾燈的位置（貼地的光暈，遠看就是一列車的頭尾） */
function trainLights(trip, pos, out) {
  const len = trainLength(trip);
  if (elevAt(trip, pos.km) > 1 || elevAt(trip, pos.km - len) > 1) return; // 貼地的光暈畫不到高架上，乾脆不畫
  out.push({ type: 'Feature', properties: { c: '#FFF4D6', k: 1, idx: trip.idx }, geometry: { type: 'Point', coordinates: (p => unproj(p.x, p.y))(trackPoint(trip, pos.km + 0.004)) } });
  out.push({ type: 'Feature', properties: { c: '#FF3B30', k: 0.55, idx: trip.idx }, geometry: { type: 'Point', coordinates: (p => unproj(p.x, p.y))(trackPoint(trip, pos.km - len - 0.002)) } });
}
