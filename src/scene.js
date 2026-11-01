/* ===== 場景：3D 車廂模型、跟車視角、光線與天氣 ===== */

/* ---------- 車廂造型 ----------
   依實際車型的編組、車長、車寬與塗裝。單位公尺；寬高略為放大，遠看也認得出來。
   body 車身、stripe/stripe2 腰帶、roof 車頂、nose 車頭流線段長度、cab 車頭色（無則同車身） */
const EX = 1.3;
const LIFT = 0; // 近看時地形已攤平，車廂直接貼地
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
  TMRT:     { tipH: 0.62, hp: 1.1,  tipW: 0.6,  wp: 2.6 },
  KRTC:     { tipH: 0.84, hp: 1.0,  tipW: 0.8,  wp: 4.0 },
  LRT:      { tipH: 0.72, hp: 1.0,  tipW: 0.6,  wp: 2.4 },
};
// 每節車廂單側的車門數
const DOORS = { THSR: 1, TEMU2000: 1, TEMU1000: 1, EMU3000: 2, E1000: 2, CHUKUANG: 2, EMU900: 3, TRTC: 4, TRTC_BR: 2, TRTC_Y: 3, TYMC: 3, TMRT: 4, KRTC: 4, LRT: 1 };
const LIVERY = {
  THSR:     { n:12, len:25,   w:3.38, h:3.65, gap:0.5, nose:10,  body:'#F3F4F1', stripe:'#F07F1F', stripe2:'#1E3A6E', roof:'#D9DCDF', name:'700T' },
  TEMU2000: { n:8,  len:20,   w:2.9,  h:3.6,  gap:0.6, nose:4.5, body:'#F4F4F2', stripe:'#E8452C', stripe2:'#E8452C', roof:'#C9CDD1', cab:'#E8452C', name:'普悠瑪' },
  TEMU1000: { n:8,  len:20,   w:2.9,  h:3.6,  gap:0.6, nose:4,   body:'#F4F4F2', stripe:'#C8102E', stripe2:'#9AA3AD', roof:'#C9CDD1', cab:'#C8102E', name:'太魯閣' },
  EMU3000:  { n:12, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:3.5, body:'#F2F3F1', stripe:'#F26A21', stripe2:'#2B2F36', roof:'#C9CDD1', cab:'#2B2F36', name:'EMU3000' },
  E1000:    { n:12, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:3,   body:'#F2F3F1', stripe:'#E2752B', stripe2:'#E2752B', roof:'#B9BEC4', cab:'#E2752B', name:'推拉式' },
  CHUKUANG: { n:10, len:20,   w:2.9,  h:3.6,  gap:0.7, nose:0,   body:'#E8833A', stripe:'#FFFFFF', stripe2:'#FFFFFF', roof:'#8D8F93', name:'莒光' },
  EMU900:   { n:10, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:2,   body:'#E9ECEF', stripe:'#F2C230', stripe2:'#2D5BA8', roof:'#B9BEC4', cab:'#2D5BA8', name:'EMU900' },
  TRTC:     { n:6,  len:23.5, w:3.2,  h:3.6,  gap:0.5, nose:1.5, body:'#C9CED3', roof:'#A9AFB5', name:'高運量' },
  TRTC_BR:  { n:4,  len:13.7, w:2.5,  h:3.3,  gap:0.5, nose:1.5, body:'#E9EBEC', roof:'#B4BAC0', name:'中運量' },
  TRTC_Y:   { n:4,  len:22,   w:2.65, h:3.5,  gap:0.5, nose:2,   body:'#D9DDE0', roof:'#B4BAC0', name:'中運量' },
  TYMC:     { n:5,  len:22,   w:3.0,  h:3.6,  gap:0.5, nose:2.5, body:'#D3D7DB', roof:'#A9AFB5', name:'機捷' },
  TMRT:     { n:2,  len:22,   w:2.9,  h:3.6,  gap:0.5, nose:2.5, body:'#E4E8EB', roof:'#B4BAC0', name:'台中捷運' },
  KRTC:     { n:3,  len:23.5, w:3.2,  h:3.6,  gap:0.5, nose:1.5, body:'#C9CED3', roof:'#A9AFB5', name:'高雄捷運' },
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

/* 把一列車拆成多節車廂的 3D 方塊：車身、窗帶、腰帶、車頂，車頭做成流線收窄 */
function carFeatures(trip, pos, P, out, detail) {
  const L = liveryOf(trip), key = Object.keys(LIVERY).find(k => LIVERY[k] === L);
  const nDoor = DOORS[key] || 2, doorW = (L.len > 15 ? 1.4 : 1.1) / 1000;
  // 車門開合：停站一開始門向兩側滑開，快開車前關上（0 = 關、1 = 全開）
  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const doorOpen = pos.atStation ? sm((pos.dwell - 0.03) / 0.07) * sm((0.97 - pos.dwell) / 0.07) : 0;
  const doorColor = mixHex(L.body, '#2A3038', 0.16), under = '#24282E';
  const w = L.w * EX / 1000, h = L.h * EX;
  const winColor = '#141C26', paneColor = P.lit ? P.winLit : '#3A5068';
  const quad = (a, b, wa, wb) => {
    // 一節車廂是剛體：兩端都用車頭到車尾連線的方向，跨過彎道時不會扭成交叉的形狀
    const d = Math.hypot(b.x - a.x, b.y - a.y), h = d > 1e-6 ? Math.atan2(b.y - a.y, b.x - a.x) : a.heading;
    const ca = Math.cos(h), sa = Math.sin(h), cb = ca, sb = sa;
    // 前後兩端各自用當地的軌道方向算出左右兩點，彎道上車廂也貼著軌道
    const r = [unproj(a.x - sa * wa, a.y + ca * wa), unproj(b.x - sb * wb, b.y + cb * wb), unproj(b.x + sb * wb, b.y - cb * wb), unproj(a.x + sa * wa, a.y - ca * wa)];
    r.push(r[0]); return [r];
  };
  // 3D 方塊整體抬高 0.6 公尺，避免與地形表面深度衝突（手機上特別明顯）；b 仍記原始值，b=0 代表車身底面
  const add = (geom, base, top, color, e = 0) => out.push({ type: 'Feature', properties: { b: base, b3: base + LIFT + e, t: top + LIFT + e, c: color }, geometry: { type: 'Polygon', coordinates: geom } });
  // 上下坡：每個零件抬到它所在位置的軌道高度；長條的車身在坡上切成幾小段，看起來是斜的而不是一階一階
  const sloped = !!elevProfile(trip), E = k => sloped ? elevAt(trip, k) : 0;
  let km = pos.km;
  const total = trip.cum[trip.cum.length - 1];
  for (let i = 0; i < L.n; i++) {
    const front = km, back = km - L.len / 1000;
    km = back - L.gap / 1000;
    const lead = i === 0, tail = i === L.n - 1;
    const nose = L.nose / 1000;
    const f = trackPoint(trip, Math.min(front, total + 0.02)), bk = trackPoint(trip, back);
    // 整節車廂的零件（車門、車窗、轉向架、車頭）都放在車頭到車尾這條直線上，
    // 彎道上才不會有零件沿著弧線跑出車身之外
    const span0 = front - back, cp = k => { const t = (k - back) / span0; return { x: bk.x + (f.x - bk.x) * t, y: bk.y + (f.y - bk.y) * t, heading: f.heading }; };
    // 車身主體（去掉車頭流線段）
    const kF = lead && nose ? front - nose : front, kB = tail && nose ? back + nose : back;
    const band = (wd, base, top, color) => {
      const ef = E(kF), eb = E(kB), n = Math.abs(ef - eb) < 0.03 ? 1 : Math.min(12, Math.ceil(Math.abs(ef - eb) / 0.03));
      if (n === 1) return add(quad(cp(kF), cp(kB), wd, wd), base, top, color, (ef + eb) / 2);
      for (let j = 0; j < n; j++) { const k1 = kF + (kB - kF) * j / n, k2 = kF + (kB - kF) * (j + 1) / n; add(quad(cp(k1), cp(k2), wd, wd), base, top, color, E((k1 + k2) / 2)); }
    };
    // 車身底下留一段深色車底，看起來才像架在轉向架上
    band(w * 0.42, 0, h * 0.12, under);
    band(w / 2, h * 0.1, h, L.body);
    // 窗帶與腰帶：比車身寬一點點，蓋在側面
    const iw = w / 2 + 0.00008;
    band(iw, h * 0.56, h * 0.8, winColor);
    // 車門：跟拍的列車一定畫；其他列車停站時也畫，旅客上下車才是從門口進出，不會穿過車身
    const span = (front - back) - (lead && nose ? nose : 0) - (tail && nose ? nose : 0);
    const k0 = back + (tail && nose ? nose : 0);
    const doors = [];
    if (detail || pos.atStation) {
      // 一節平均分布（單門、雙門的車型放在兩端）
      for (let j = 0; j < nDoor; j++) doors.push(k0 + span * (nDoor === 1 ? 0.9 : nDoor === 2 ? (j ? 0.85 : 0.15) : (j + 0.5) / nDoor));
      for (const dc of doors) {
        const e = E(dc), half = doorW / 2, slide = doorOpen * half;
        // 門洞：門打開多少就露出多少車廂內部
        if (doorOpen > 0.02) add(quad(cp(dc - slide), cp(dc + slide), iw + 0.00004, iw + 0.00004), h * 0.12, h * 0.82, '#0B0F14', e);
        // 兩片門板沿著車身往左右滑開
        for (const sd of [-1, 1]) {
          const c0 = dc + sd * (half / 2 + slide), a = cp(c0 - half / 2), b = cp(c0 + half / 2);
          add(quad(a, b, iw + 0.00007, iw + 0.00007), h * 0.12, h * 0.82, doorColor, e);
          if (detail) { const a2 = cp(c0 - half * 0.28), b2 = cp(c0 + half * 0.28); add(quad(a2, b2, iw + 0.00009, iw + 0.00009), h * 0.56, h * 0.78, paneColor, e); }
        }
      }
    }
    // 近看時把窗帶切成一格格車窗，夜裡會亮
    if (detail) {
      // 車窗：避開車門的位置
      const nw = Math.max(2, Math.round(span * 1000 / 3.4));
      for (let k = 0; k < nw; k++) {
        const ka = k0 + span * (k + 0.18) / nw, kb = k0 + span * (k + 0.82) / nw;
        if (doors.some(dc => kb > dc - doorW * 0.7 && ka < dc + doorW * 0.7)) continue;
        add(quad(cp(kb), cp(ka), iw + 0.00003, iw + 0.00003), h * 0.6, h * 0.77, paneColor, E((ka + kb) / 2));
      }
      // 轉向架（車頂不放冷氣機方塊：從上面跟拍時看起來像一塊塊灰色色塊）
      for (const u of [0.13, 0.87]) {
        const c = back + (front - back) * u, a = cp(c - 0.0013), b = cp(c + 0.0013);
        add(quad(a, b, w * 0.47, w * 0.47), 0, h * 0.14, '#1A1D21', E(c));
      }
      // 車廂之間的貫通道
      if (!tail && L.gap > 0) {
        const a = cp(back - L.gap / 1000 - 0.0002), b = cp(back + 0.0002);
        add(quad(a, b, w * 0.4, w * 0.4), h * 0.15, h * 0.9, under, E(back - L.gap / 2000));
      }
    }
    if (L.stripe) band(iw + 0.00002, h * 0.4, h * 0.5, L.stripe);
    if (L.stripe2) band(iw + 0.00002, h * 0.33, h * 0.37, L.stripe2);
    band(w * 0.36, h, h * 1.07, L.roof);
    if (!L.stripe && trip.color) band(iw + 0.00002, h * 0.42, h * 0.52, trip.color);
    if (lead && nose) { const e = E(front - nose / 2); noseFeatures(trip, L, cp(front - nose), cp(front), nose, w, h, detail, (g, b, t, c) => add(g, b, t, c, e), winColor, trip.color, P.lit ? '#FFF6DC' : '#E9E4D2'); }
    if (tail && nose && L.n > 1) { const e = E(back + nose / 2); noseFeatures(trip, L, cp(back + nose), cp(back), nose, w, h, detail, (g, b, t, c) => add(g, b, t, c, e), winColor, trip.color, P.lit ? '#FF2D2D' : '#B3262A'); }
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
const sfeat = (ring, b, t, c) => ({ type: 'Feature', properties: { b, t, c }, geometry: { type: 'Polygon', coordinates: [ring] } });
const sngon = (x, y, r, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; o.push(unproj(x + Math.cos(a) * r / 1000, y + Math.sin(a) * r / 1000)); } return o; };
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
function personFig(out, x, y, base, hd, phase, walk) {
  const c = Math.cos(hd), s = Math.sin(hd), k = EX / 1000;
  // 以人為中心的橢圓柱：fwd 前後、lat 左右（公尺），rf/rl 兩個半徑，b/t 底與頂的高度
  const ell = (fwd, lat, rf, rl, b, t, n = 6) => {
    const cx = x + (c * fwd - s * lat) * k, cy = y + (s * fwd + c * lat) * k, r = [];
    for (let i = 0; i <= n; i++) { const a = (i % n) / n * Math.PI * 2 + Math.PI / n, u = Math.cos(a) * rf, v = Math.sin(a) * rl; r.push(unproj(cx + (c * u - s * v) * k, cy + (s * u + c * v) * k)); }
    out.push(sfeat(r, base + b * EX, base + t * EX, PERSON_COLOR));
  };
  const sw = Math.sin(phase) * walk, vel = Math.cos(phase) * walk;
  const bob = (1 - Math.abs(Math.cos(phase))) * walk * 0.035, lean = walk * 0.035;
  // 腿：L 是左腳（lat > 0）。腳往前移動的那一隻在擺盪，抬腳、膝蓋往後彎
  for (const [side, f, v] of [[1, sw, vel], [-1, -sw, -vel]]) {
    const foot = f * 0.21, swing = Math.max(0, v), lift = swing * 0.07;
    const lat = side * 0.085;
    ell(foot + 0.04, lat, 0.12, 0.05, lift, lift + 0.07);                              // 鞋子（前端比較長）
    ell(foot * 0.75 - swing * 0.06, lat, 0.05, 0.05, lift + 0.06, 0.47 + lift * 0.6);   // 小腿
    ell(foot * 0.38, lat * 0.95, 0.065, 0.065, 0.45 + lift * 0.6, 0.86 + bob);          // 大腿
  }
  ell(lean * 0.5, 0, 0.1, 0.16, 0.8 + bob, 0.97 + bob, 8);                              // 骨盆
  ell(lean, 0, 0.11, 0.17, 0.95 + bob, 1.22 + bob, 8);                                  // 胸腔
  ell(lean * 1.2, 0, 0.1, 0.205, 1.2 + bob, 1.34 + bob, 8);                             // 肩膀
  // 手臂：跟同側的腳反向擺
  for (const [side, a] of [[1, -sw], [-1, sw]]) {
    const lat = side * 0.235;
    ell(lean * 1.2 + a * 0.06, lat, 0.045, 0.045, 1.0 + bob, 1.33 + bob);               // 上臂
    ell(lean + a * 0.17, lat * 0.97, 0.04, 0.04, 0.74 + bob, 1.02 + bob);               // 前臂與手
  }
  ell(lean * 1.3, 0, 0.045, 0.045, 1.33 + bob, 1.44 + bob);                             // 脖子
  ell(lean * 1.4 + 0.01, 0, 0.115, 0.1, 1.42 + bob, 1.68 + bob, 8);                     // 頭
}
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
const walker = (out, pts, d, base) => { const p = alongPath(pts, d); personFig(out, p.x, p.y, base, p.hd, d / STRIDE * Math.PI, 1); };

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
// 高架橋：在軌道下面畫橋面（每 4 公尺一段，跟著坡度一段段升高）和橋墩
function viaductFeatures(trip, k0, k1, P, out, seen) {
  const o = Math.abs(sideOffset(trip)), w = liveryOf(trip).w * EX / 1000, half = o + w / 2 + 0.0007;
  const deck = mixHex('#A8ACAE', P.land, 0.3), pier = mixHex('#8E9397', P.land, 0.3), step = 0.004;
  for (let i = Math.floor(k0 / step); i * step < k1; i++) {
    const k = i * step, e = elevAt(trip, k + step / 2); if (e < 0.05) continue;
    const f = railFrame(trip, k + step / 2), key = levelKey(trip) + Math.round(f.x * 250) + ',' + Math.round(f.y * 250);
    if (seen.has(key)) continue; seen.add(key);
    out.push(sfeat(railBand(trip, k, k + step, -half, half), Math.max(0, e - 0.9), e - 0.02, deck));
    if (e > 2.5 && i % 6 === 0) out.push(sfeat(sngon(f.x, f.y, 0.9, 8), 0, e - 0.9, pier));
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
function stationFeatures(node, trip, idx, P, out, seen) {
  const spec = platformSpec(trip), sg = Math.sign(sideOffset(trip)) || 1, hub = isHub(node);
  const accent = spec.accent || trip.color || '#888888', concrete = mixHex('#B9B5AC', P.land, 0.3), roof = mixHex(spec.roof, P.bld, 0.15);
  for (const s of [sg, -sg]) {
    const G = platformGeom(node, trip, idx, s), { ka, kb, inner, outer, e } = G, H = spec.h;
    const F = (ring, b, t, c) => out.push(sfeat(ring, b + e, t + e, c));
    F(railBand(trip, ka, kb, s * inner, s * outer), e > 0 ? -0.6 : -e, H, concrete);
    F(railBand(trip, ka, kb, s * (inner + 0.0002), s * (inner + 0.0006)), H, H + 0.03, '#E8C547');
    // 高架的月台底下有一排柱子撐著
    if (e > 1) for (let k = ka + 0.004; k < kb; k += 0.012) { const [x, y] = G.at(k, (inner + outer) / 2); out.push(sfeat(sngon(x, y, 0.4, 8), 0, e - 0.6, mixHex('#9AA0A4', P.land, 0.3))); }
    // 樓梯口：月台靠外側的一個開口加上兩側扶手，旅客從這裡上下
    for (const k of G.stairs) {
      F(railBand(trip, k - 0.0035, k + 0.0035, s * (outer - 0.0022), s * (outer - 0.0003)), H, H + 0.04, '#2E3338');
      F(railBand(trip, k - 0.0035, k + 0.0035, s * (outer - 0.0023), s * (outer - 0.0021)), H, H + 1.0, '#8A9096');
      F(railBand(trip, k - 0.0035, k + 0.0035, s * (outer - 0.0004), s * (outer - 0.0002)), H, H + 1.0, '#8A9096');
      F(railBand(trip, k + 0.0033, k + 0.0036, s * (outer - 0.0023), s * (outer - 0.0002)), H, H + 1.0, '#8A9096');
    }
    // 雨棚只有多層的轉乘站才有，而且只蓋月台靠外側，從上面看得到停靠的列車
    if (hub) {
      const ca = ka + (kb - ka) * 0.12, cb = kb - (kb - ka) * 0.12, ci = inner + G.pw * 0.4;
      F(railBand(trip, ca, cb, s * ci, s * (outer + 0.0004)), H + 3.4, H + 3.65, roof);
      F(railBand(trip, ca, cb, s * ci, s * (ci + 0.0003)), H + 3.1, H + 3.65, accent);
      for (let k = ca; k <= cb; k += 0.016) { const [x, y] = G.at(k, outer - 0.0012); out.push(sfeat(sngon(x, y, 0.18, 6), H + e, H + 3.4 + e, '#7A8288')); }
    }
    // 站名牌：沿軌道方向的一塊線色看板，立在一根柱子上
    for (const u of [0.2, 0.8]) {
      const f = railFrame(trip, ka + (kb - ka) * u), lo = s * (outer - 0.0012), cx = f.x + f.nx * lo, cy = f.y + f.ny * lo;
      const r = [[1.8, 0.08], [-1.8, 0.08], [-1.8, -0.08], [1.8, -0.08], [1.8, 0.08]].map(([a, b]) => unproj(cx + (f.ux * a + f.nx * b) / 1000, cy + (f.uy * a + f.ny * b) / 1000));
      F(r, H + 2.0, H + 2.7, accent);
      out.push(sfeat(sngon(cx, cy, 0.07, 6), H + e, H + 2.0 + e, '#7A8288'));
    }
  }
  // 高架段的橋面與橋墩（坡道一路畫到落地）
  if (elevProfile(trip)) { const r = platHalf(trip) + 1.0; viaductFeatures(trip, trip.cum[idx] - r, trip.cum[idx] + r, P, out, seen); }
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
          const v = 1.15 + hash(key + 'v' + q) * 0.4, side = (hash(key + 's' + q) - 0.5) * 0.0012;
          const p1 = [dp.x + dp.nx * 0.0012 - dp.ny * side, dp.y + dp.ny * 0.0012 + dp.nx * side];
          const pts = [[dp.x, dp.y], p1, nearStair(dp.x, dp.y)], Lp = pathLen(pts);
          if (tau * v > Lp) continue;
          walker(out, pts, tau * v, base);
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
      const v = 1.1 + hash(seed + 'v' + q) * 0.4, path = [stair, spot], Lp = pathLen(path);
      const standAt = sec => Math.min(Lp, Math.max(0, sec - aq * 60) * v);
      // 上車：先等下車的人，再依到月台的先後走向最近的車門
      if (cur && doors.length) {
        const sb = cur.arr * 60 + D * (0.3 + 0.4 * q / Math.max(1, n)), d0 = standAt(sb), p0 = alongPath(path, d0);
        if (nowS >= sb) {
          let dp = doors[0], bd = 1e9; for (const o of doors) { const d = Math.hypot(o.x - spot[0], o.y - spot[1]); if (d < bd) { bd = d; dp = o; } }
          const pts = [[p0.x, p0.y], [dp.x + dp.nx * 0.0007, dp.y + dp.ny * 0.0007], [dp.x - dp.nx * 0.0005, dp.y - dp.ny * 0.0005]], L2 = pathLen(pts);
          const vb = Math.max(v, L2 / Math.max(1, cur.arr * 60 + D * 0.88 - sb)), d = (nowS - sb) * vb;
          if (d < L2) walker(out, pts, d, base);
          continue;
        }
      }
      const d = standAt(nowS);
      if (d < Lp) walker(out, path, d, base);
      else personFig(out, spot[0], spot[1], base, Math.atan2(face[1] - spot[1], face[0] - spot[0]), 0, 0);
    }
  }
}

/* 車頭：以平滑的俯視輪廓一層層往上疊。每一層的頂面高度越高、往前伸得越短，
   疊起來就是一個往前下斜的圓弧車鼻；腰帶、窗帶的顏色也跟著繞過車頭 */
function noseFeatures(trip, L, root, tip, nose, w, h, detail, add, winColor, lineColor, lamp) {
  const key = Object.keys(LIVERY).find(k => LIVERY[k] === L);
  const S = NOSE_SHAPE[key] || NOSE_SHAPE.EMU900;
  const len = Math.hypot(tip.x - root.x, tip.y - root.y) || nose;
  const ux = (tip.x - root.x) / len, uy = (tip.y - root.y) / len; // 往車頭方向
  const nx = -uy, ny = ux;                                           // 側向
  const pt = (s, y) => unproj(root.x + ux * s * len + nx * y, root.y + uy * s * len + ny * y);
  const halfW = s => (w / 2) * (S.tipW + (1 - S.tipW) * Math.pow(Math.max(0, 1 - Math.pow(s, S.wp)), 1 / S.wp));
  const reach = r => r <= S.tipH ? 1 : Math.pow((1 - r) / (1 - S.tipH), 1 / S.hp); // 高度比例 r 的那一層能伸到哪
  // 分層：顏色交界一定要切，上半部再多切幾層讓斜面更平滑
  const cuts = new Set([0, 0.1, 0.56, 0.8, 1]);
  if (L.stripe) { cuts.add(0.4); cuts.add(0.5); }
  if (L.stripe2) { cuts.add(0.33); cuts.add(0.37); }
  if (!L.stripe && lineColor) { cuts.add(0.42); cuts.add(0.52); }
  for (const r of detail ? [0.25, 0.66, 0.73, 0.87, 0.93, 0.97] : [0.68, 0.9]) cuts.add(r);
  const H = [...cuts].sort((a, b) => a - b);
  const nSide = detail ? 8 : 4, nFront = detail ? 7 : 3;
  const colorAt = m => m < 0.1 ? '#24282E'
    : L.stripe2 && m > 0.33 && m < 0.37 ? L.stripe2
    : L.stripe && m > 0.4 && m < 0.5 ? L.stripe
    : !L.stripe && lineColor && m > 0.42 && m < 0.52 ? lineColor
    : m > 0.56 && m < 0.8 ? winColor
    : m < 0.56 && L.cab ? L.cab : L.body;
  for (let i = 0; i < H.length - 1; i++) {
    const b0 = H[i], b1 = H[i + 1], m = (b0 + b1) / 2;
    const sk = reach(b1), Wk = halfW(sk);
    if (sk <= 0.001) continue;
    // 俯視輪廓：左側弧線 → 前端圓角 → 右側弧線
    const ring = [];
    for (let j = 0; j <= nSide; j++) { const s = sk * j / nSide; ring.push(pt(s, halfW(s))); }
    const bulge = Math.min(Wk * 0.45, (1 - sk) * len + Wk * 0.25);
    for (let j = 1; j < nFront; j++) { const a = Math.PI / 2 - Math.PI * j / nFront; ring.push(pt(sk + bulge * Math.cos(a) / len, Wk * Math.sin(a))); }
    for (let j = nSide; j >= 0; j--) { const s = sk * j / nSide; ring.push(pt(s, -halfW(s))); }
    ring.push(ring[0]);
    add([ring], h * b0, h * b1, colorAt(m));
  }
  // 車燈：車頭兩側各一顆小燈（車頭暖白、車尾紅），是車身的一部分，會被前面的東西擋住
  if (lamp) {
    const W = halfW(1), lo = 0.15, hi = Math.min(S.tipH, 0.34) - 0.03;
    const s0 = 1 - 0.3 / 1000 / len, s1 = 1 + (W * 0.22 + 0.00005) / len;
    for (const sd of [-1, 1]) {
      const y0 = sd * W * 0.4, y1 = sd * W * 0.72;
      add([[pt(s0, y0), pt(s1, y0), pt(s1, y1), pt(s0, y1), pt(s0, y0)]], h * lo, h * Math.max(lo + 0.05, hi), lamp);
    }
  }
}

/* ---------- 跟車視角 ---------- */
const VIEWS = [
  { id: 'persp', name: '透視' },
  { id: 'chase', name: '追車' },
  { id: 'cab', name: '車頭' },
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
    hsShadow:'#000000', hsHigh:'#3A4C60', hsAccent:'#0A121B', label:'#8FA0AE', halo:'#050A12',
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
