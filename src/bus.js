/* ===== 國道客運：TDX 公路客運即時位置 =====
   需要 TDX 金鑰。每 30 秒讀一次全台公路客運的定位（v2/Bus/RealTimeByFrequency/InterCity），
   畫面附近或正在跟拍的路線再讀路線形狀（v2/Bus/Shape/InterCity），讓客運沿著道路平順移動，
   不會每 30 秒跳一格。只在即時模式（時間是現在）顯示。網址加上 ?busdemo 可用假資料預覽。 */

const BUS = { on: store.get('buses', true), list: new Map(), shapes: new Map(), routes: new Map(), ops: new Map(), queue: [], qBusy: false, retryAt: new Map(),
  live: false, status: '', loadAt: 0, gen: 0, follow: null, paused: false, view: store.get('busView', 'chase'), noSelect: false };
const BUS_DEMO = /[?&]busdemo\b/.test(location.search);

/* ---------- 讀取 ---------- */
const busCred = () => store.get('tdx', {});
const zh = v => (v && typeof v === 'object' ? v.Zh_tw || v.En || '' : String(v || ''));
async function busFetch(path) { return TDX.get(path, busCred()); }

async function loadBuses() {
  if (BUS_DEMO) return demoBuses();
  const cred = busCred();
  if (!cred.id || !cred.secret) { BUS.live = false; BUS.status = '需要 TDX 金鑰'; return; }
  if (!BUS.on || document.hidden) return;
  const gen = ++BUS.gen;
  const sel = '$select=PlateNumb,OperatorID,RouteUID,RouteName,SubRouteUID,SubRouteName,Direction,BusPosition,Speed,Azimuth,GPSTime';
  let j;
  try { j = await busFetch('v2/Bus/RealTimeByFrequency/InterCity?' + (BUS.noSelect ? '' : sel)); }
  catch (e) {
    // 欄位名稱不合時 TDX 會回 400：改成不指定欄位再試一次
    if (!BUS.noSelect && /400/.test(e.message)) { BUS.noSelect = true; return loadBuses(); }
    BUS.status = 'TDX 客運讀取失敗'; return;
  }
  if (gen !== BUS.gen || !Array.isArray(j)) return;
  BUS.loadAt = Date.now();
  if (!BUS.ops.size) loadOperators();
  const seen = new Set();
  for (const r of j) {
    const pos = r.BusPosition || {}, lat = +pos.PositionLat, lon = +pos.PositionLon, plate = r.PlateNumb;
    if (!plate || !isFinite(lat) || !isFinite(lon) || lat < 21.5 || lat > 25.5 || lon < 119 || lon > 122.2) continue;
    const t = Date.parse(r.GPSTime || '') || Date.now();
    seen.add(plate);
    let b = BUS.list.get(plate);
    if (!b) { b = { plate, fixes: [] }; BUS.list.set(plate, b); }
    b.route = r.RouteUID || ''; b.routeName = zh(r.RouteName); b.sub = r.SubRouteUID || b.route; b.subName = zh(r.SubRouteName);
    b.dir = +r.Direction || 0; b.op = r.OperatorID || ''; b.speed = Math.max(0, +r.Speed || 0); b.az = +r.Azimuth || 0;
    // 同一筆定位不要重複加
    const last = b.fixes[b.fixes.length - 1];
    if (!last || last.t !== t) { b.fixes.push({ lon, lat, t, speed: b.speed, az: b.az }); if (b.fixes.length > 3) b.fixes.shift(); b.s0 = null; }
    b.seenAt = Date.now();
  }
  // 超過 3 分鐘沒有新定位的車（收班、進站）拿掉
  for (const [k, b] of BUS.list) if (!seen.has(k) && Date.now() - b.seenAt > 180e3) { BUS.list.delete(k); if (BUS.follow === b) exitBusFollow(); }
  BUS.live = true; BUS.status = `${BUS.list.size} 輛行駛中`;
}
async function loadOperators() {
  try {
    const j = await busFetch('v2/Bus/Operator/InterCity?$select=OperatorID,OperatorName');
    if (Array.isArray(j)) for (const o of j) BUS.ops.set(o.OperatorID, zh(o.OperatorName));
  } catch {}
}
// 路線形狀與起訖站：只讀畫面附近與跟拍中的路線，排隊慢慢讀，不一次打爆額度
function wantRoute(uid) {
  if (!uid || BUS.shapes.has(uid) || BUS.queue.includes(uid) || BUS_DEMO) return;
  if ((BUS.retryAt.get(uid) || 0) > Date.now()) return; // 上次讀取失敗，稍後再試
  BUS.queue.push(uid); pumpQueue();
}
async function pumpQueue() {
  if (BUS.qBusy || !BUS.queue.length) return;
  BUS.qBusy = true;
  const uid = BUS.queue.shift();
  BUS.shapes.set(uid, null); // 讀取中
  const f = encodeURIComponent(`RouteUID eq '${uid.replace(/'/g, '')}'`);
  try {
    const j = await busFetch(`v2/Bus/Shape/InterCity?$filter=${f}`);
    const list = [];
    if (Array.isArray(j)) for (const r of j) { const line = parseWKT(r.Geometry || ''); if (line.length > 1) list.push({ sub: r.SubRouteUID || uid, dir: +r.Direction || 0, ...shapeOf(line) }); }
    BUS.shapes.set(uid, list); BUS.retryAt.delete(uid);
  } catch {
    // 暫時性失敗（斷線、429）不要永久快取成空的，60 秒後允許重讀
    BUS.shapes.delete(uid); BUS.retryAt.set(uid, Date.now() + 60e3);
  }
  try {
    const j = await busFetch(`v2/Bus/Route/InterCity?$filter=${f}&$select=RouteUID,DepartureStopNameZh,DestinationStopNameZh,Operators`);
    if (Array.isArray(j) && j[0]) BUS.routes.set(uid, { from: j[0].DepartureStopNameZh || '', to: j[0].DestinationStopNameZh || '', op: j[0].Operators && j[0].Operators[0] ? zh(j[0].Operators[0].OperatorName) : '' });
  } catch {}
  setTimeout(() => { BUS.qBusy = false; pumpQueue(); }, 1200);
}
// WKT：LINESTRING(lon lat, ...) 或 MULTILINESTRING((...),(...))，多段就接起來
function parseWKT(w) {
  const pts = [];
  for (const m of String(w).matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) pts.push([+m[1], +m[2]]);
  return pts;
}
// 形狀換成平面公尺座標並算累積距離，方便沿線找位置
const BKX = 111320 * Math.cos(23.7 / DEG), BKY = 110570;
const bxy = (lon, lat) => [(lon - 121) * BKX, (lat - 23.7) * BKY];
const bll = (x, y) => [x / BKX + 121, y / BKY + 23.7];
function shapeOf(line) {
  const xy = line.map(([lon, lat]) => bxy(lon, lat)), cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return { xy, cum, len: cum[cum.length - 1] };
}
// 點投影到形狀上：回傳沿線距離與離線距離；near 有值時偏好它附近（同一條路來回的路段才不會跳到對向）
function project(sh, x, y, near) {
  let best = null;
  for (let i = 1; i < sh.xy.length; i++) {
    const [ax, ay] = sh.xy[i - 1], [bx, by] = sh.xy[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    const px = ax + dx * k, py = ay + dy * k, d = Math.hypot(x - px, y - py), s = sh.cum[i - 1] + Math.sqrt(L2) * k;
    const score = d + (near != null ? Math.max(0, Math.abs(s - near) - 3000) * 0.05 : 0);
    if (!best || score < best.score) best = { s, d, score };
  }
  return best;
}
function along(sh, s) {
  s = Math.max(0, Math.min(sh.len, s));
  let lo = 1, hi = sh.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sh.cum[mid] < s) lo = mid + 1; else hi = mid; }
  const i = lo, a = sh.xy[i - 1], b = sh.xy[i], seg = sh.cum[i] - sh.cum[i - 1] || 1, k = (s - sh.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: (Math.atan2(b[0] - a[0], b[1] - a[1]) * DEG + 360) % 360 };
}
function shapeFor(b) {
  const list = BUS.shapes.get(b.route); if (!list || !list.length) return null;
  return list.find(x => x.sub === b.sub && x.dir === b.dir) || list.find(x => x.dir === b.dir) || list[0];
}

/* ---------- 位置推算 ----------
   定位約每 30~60 秒一筆：從最新一筆沿路線往前推（用回報的車速，最多推 2 分鐘），
   畫出來的位置再慢慢追上推算值，修正時不會瞬移。 */
function busPos(b, now, dt) {
  const f = b.fixes[b.fixes.length - 1]; if (!f) return null;
  const v = (f.speed || 0) / 3.6, ahead = Math.min(120, Math.max(0, (now - f.t) / 1000)) * v;
  const sh = shapeFor(b);
  let want;
  if (sh) {
    if (b.s0 == null || b.sh !== sh) { const [x, y] = bxy(f.lon, f.lat), pr = project(sh, x, y, b.sh === sh ? b.s : null); if (pr && pr.d < 400) { b.s0 = pr.s; b.sh = sh; } else b.s0 = -1; }
    if (b.s0 >= 0) {
      let s = b.s0 + ahead;
      if (b.s == null || Math.abs(s - b.s) > 3000) b.s = s;
      else if (s > b.s) b.s += (s - b.s) * Math.min(1, dt * 1.2);   // 只往前追，推算值落後時就停著等
      const q = along(sh, b.s);
      return { x: q.x, y: q.y, h: q.h };
    }
  }
  // 沒有路線形狀：沿回報的方位角直線推
  const [x0, y0] = bxy(f.lon, f.lat), h = f.az || b.az || 0;
  want = { x: x0 + Math.sin(h / DEG) * ahead, y: y0 + Math.cos(h / DEG) * ahead, h };
  if (!b.xy || Math.hypot(want.x - b.xy.x, want.y - b.xy.y) > 3000) b.xy = { ...want };
  else { const k = Math.min(1, dt * 1.2); b.xy.x += (want.x - b.xy.x) * k; b.xy.y += (want.y - b.xy.y) * k; b.xy.h = want.h; }
  return b.xy;
}

/* ---------- 3D 模型：國道客運遊覽車 ----------
   台灣國道客運多是 12 公尺級高地板遊覽車：Scania K 系列底盤配國內車體、
   統聯的金龍 KL6120、國光的大宇等。車頭擋風玻璃後傾、車頂圓弧、
   前門在右前方、前方垂掛「兔耳」後照鏡、擋風玻璃上緣有 LED 路線牌、
   下層是行李艙、引擎在車尾。尺寸取自各車型規格的約略值。 */
const COACH_TYPES = {
  // L 車長、W 車寬、H 車高、rake 擋風玻璃後傾量、nose 車頭平面圓角、fa/ra 前軸到車頭、後軸到車尾、win 側窗下緣、rr 車頂圓弧半徑
  scania:   { L: 12.2, W: 2.5,  H: 3.68, rake: 0.40, nose: 0.30, fa: 2.75, ra: 3.15, win: 1.74, rr: 0.32 },
  kinglong: { L: 12.0, W: 2.5,  H: 3.72, rake: 0.58, nose: 0.40, fa: 2.60, ra: 3.00, win: 1.70, rr: 0.44 },
  daewoo:   { L: 12.0, W: 2.49, H: 3.55, rake: 0.30, nose: 0.24, fa: 2.55, ra: 3.10, win: 1.64, rr: 0.28 },
};
/* 塗裝：body 車身底色、lower 下緣主色、stripe/stripe2 飾帶、style solid 單色或 wave 斜向色帶。
   統聯近年為單一青綠色（維基百科「統聯客運」）；其他家依常見外觀概略配色。 */
const BUS_LIVERY = [
  ['統聯', { type: 'kinglong', body: '#17A497', lower: '#0D7C73', stripe: '#F4F6F7', stripe2: '#0A5C55', style: 'solid' }],
  ['國光', { type: 'daewoo', body: '#F4F6F8', lower: '#183F8E', stripe: '#D9252E', stripe2: '#2F6FD6', style: 'wave' }],
  ['和欣', { type: 'scania', body: '#F1F1F4', lower: '#4A2A80', stripe: '#C9A23A', stripe2: '#7B52C2', style: 'wave' }],
  ['阿羅哈', { type: 'scania', body: '#F4F4F2', lower: '#C3122F', stripe: '#F29A1F', stripe2: '#7A0C1E', style: 'wave' }],
  ['葛瑪蘭', { type: 'scania', body: '#F3F6F7', lower: '#0E6C8A', stripe: '#3EC2CB', stripe2: '#F4A425', style: 'wave' }],
  ['首都', { type: 'scania', body: '#F2B705', lower: '#D9730D', stripe: '#FFFFFF', stripe2: '#9A4F06', style: 'solid' }],
  ['大有', { type: 'scania', body: '#F4F6F8', lower: '#1C4E9E', stripe: '#E53935', stripe2: '#5B8FE0', style: 'wave' }],
  ['豪泰', { type: 'scania', body: '#F4F4F4', lower: '#B31F2A', stripe: '#D4AF37', stripe2: '#6E1219', style: 'wave' }],
  ['飛狗', { type: 'scania', body: '#1F3060', lower: '#131E3E', stripe: '#E63B2E', stripe2: '#F4F6F8', style: 'solid' }],
  ['台西', { type: 'scania', body: '#F4F6F4', lower: '#2F7D5A', stripe: '#9BCB3B', stripe2: '#1D5A3F', style: 'wave' }],
  ['日統', { type: 'scania', body: '#F4F4F4', lower: '#8B1E3F', stripe: '#E0B23C', stripe2: '#5A1028', style: 'wave' }],
  ['建明', { type: 'scania', body: '#F4F6F8', lower: '#3E7CB1', stripe: '#F2C230', stripe2: '#24557F', style: 'wave' }],
  ['亞聯', { type: 'scania', body: '#F4F4F4', lower: '#D4573B', stripe: '#3A6EA5', stripe2: '#8E3522', style: 'wave' }],
  ['台聯', { type: 'scania', body: '#F4F6F4', lower: '#3A8D5C', stripe: '#F2C230', stripe2: '#22603C', style: 'wave' }],
];
const BUS_FALLBACK = ['#2E6FB5', '#E8742A', '#6B3FA0', '#2A8C82', '#C0392B'];
const opName = b => BUS.ops.get(b.op) || (BUS.routes.get(b.route) || {}).op || '';
// 回傳 [快取 key, 塗裝]
function busLivery(b) {
  const name = opName(b), hit = BUS_LIVERY.find(([k]) => name.includes(k));
  if (hit) return hit;
  const c = BUS_FALLBACK[Math.floor(hash(b.op || b.plate) * BUS_FALLBACK.length)];
  return ['_' + c, { type: 'scania', body: '#F2F4F6', lower: c, stripe: shade(c, 1.35), stripe2: shade(c, 0.6), style: 'wave' }];
}
const busColor = b => { const v = busLivery(b)[1]; return v.style === 'solid' ? v.body : v.lower; };
function shade(c, k) {
  const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
}
function busParts(V) {
  const T = COACH_TYPES[V.type] || COACH_TYPES.scania, { L, H, rake, nose, fa, ra, win, rr } = T;
  const f = L / 2, w = T.W / 2, zb = 0.42, ws0 = 1.2, ws1 = H - 0.34, out = [];
  const glass = '#18222C', wsg = '#26394A', mask = '#14181C', trim = '#C8CDD2', tyre = '#141518', ep = 0.014;
  const quad = (c, b, t, col) => { if (t - b > 1e-3) out.push({ c, b, t, col }); };
  const box = (x1, x2, y1, y2, b, t, col) => quad([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], b, t, col);
  const both = (x1, x2, yi, yo, b, t, col) => { box(x1, x2, yi, yo, b, t, col); box(x1, x2, -yo, -yi, b, t, col); };
  // 側面輪廓：高度 z 時的車頭、車尾位置與半寬
  const xf = z => { let x = f; if (z > ws0) x -= rake * Math.min(1, (z - ws0) / (ws1 - ws0)); const d = z - (H - rr); if (d > 0) x -= rr - Math.sqrt(Math.max(0, rr * rr - d * d)); return x; };
  const xr = z => { const d = z - (H - rr * 0.8); return -f + (d > 0 ? rr * 0.8 - Math.sqrt(Math.max(0, rr * rr * 0.64 - d * d)) : 0); };
  const hw = z => { const d = z - (H - rr); return d > 0 ? w - rr + Math.sqrt(Math.max(0, rr * rr - d * d)) : w; };
  const axles = [f - fa, -f + ra], AR = 0.62, AZ = 0.5; // 輪拱半徑、圓心高度
  // 高度切層
  const cuts = new Set([zb, 0.62, 0.74, ws0, win, H - 0.44, H]);
  for (let z = zb; z < AZ + AR; z += 0.1) cuts.add(+z.toFixed(3));
  cuts.add(AZ + AR);
  for (let z = ws0; z < H - 0.44; z += 0.2) cuts.add(+z.toFixed(3));
  for (let z = H - rr; z < H; z += 0.06) cuts.add(+z.toFixed(3));
  const zs = [...cuts].filter(z => z >= zb && z <= H).sort((a, b) => a - b);
  const paint = z => z < 0.62 ? shade(V.lower, 0.55) : z >= win && z < H - 0.44 ? glass : V.body;
  for (let i = 0; i + 1 < zs.length; i++) {
    const z0 = zs[i], z1 = zs[i + 1], zm = (z0 + z1) / 2, a = xf(zm), r = xr(zm), ww = hw(zm);
    const c = nose * (zm < ws0 ? 0.8 : 1), mid = a - c, rr0 = r + 0.25;
    const col = paint(zm), front = zm >= ws0 && zm < ws1 ? wsg : zm < 0.74 ? shade(V.lower, 0.45) : zm < ws0 ? mask : V.body;
    // 車身中段：輪拱處挖空
    let segs = [[rr0, mid]];
    if (zm < AZ + AR) for (const ax of axles) {
      const ha = Math.sqrt(Math.max(0, AR * AR - Math.max(0, zm - AZ) ** 2)), nx = [];
      for (const [s, e] of segs) { if (e <= ax - ha || s >= ax + ha) nx.push([s, e]); else { if (s < ax - ha) nx.push([s, ax - ha]); if (e > ax + ha) nx.push([ax + ha, e]); } }
      segs = nx;
    }
    for (const [s, e] of segs) box(s, e, -ww, ww, z0, z1, col);
    // 車頭兩段漸窄（平面圓角），車尾一段
    const m2 = a - c * 0.35, w1 = ww - c * 0.22, w2 = ww - c * 0.62;
    quad([[mid, -ww], [m2, -w1], [m2, w1], [mid, ww]], z0, z1, zm >= win && zm < H - 0.44 ? glass : front === wsg ? wsg : col);
    quad([[m2, -w1], [a, -w2], [a, w2], [m2, w1]], z0, z1, front);
    quad([[r, -ww + 0.14], [rr0, -ww], [rr0, ww], [r, ww - 0.14]], z0, z1, zm < 0.62 ? col : V.body);
  }
  // 車頂冷氣機與逃生口
  box(-2.2, 1.6, -0.82, 0.82, H - 0.01, H + 0.16, shade(V.body, 0.93));
  box(-2.0, 1.4, -0.7, 0.7, H + 0.16, H + 0.24, shade(V.body, 0.88));
  for (const x of [f - 2.6, -f + 2.4]) box(x - 0.4, x + 0.4, -0.38, 0.38, H - 0.01, H + 0.05, '#9AA1A8');
  // ---------- 側面塗裝與細節（貼在車身外側一點點）----------
  const sideY = w + ep, inY = w - 0.004;
  const xMin = -f + 0.28, xMax = f - nose - 0.02;
  if (V.style === 'wave') {
    // 下緣主色由車頭低處往車尾斜升，上方兩道平行飾帶
    const band = (gap, thick, col) => {
      for (let z = 0.62; z < win - 0.02; z += 0.025) {
        const t = (z + 0.0125 - 0.62) / (win - 0.62), x0 = xMax - 0.4 - t * L * 0.72;
        const xs = thick ? Math.max(xMin, x0 + gap) : xMin, x1 = thick ? Math.min(xMax, x0 + gap + thick) : x0;
        if (x1 > xs) both(xs, x1, inY, sideY, z, Math.min(win - 0.02, z + 0.025), col);
      }
    };
    band(0, 0, V.lower);
    band(0.2, 0.55, V.stripe);
    band(0.95, 0.3, V.stripe2);
    // 車窗以上車尾的延伸色帶
    both(xMin, xMin + 2.2, inY, sideY, H - 0.44, H - 0.3, V.lower);
  } else {
    both(xMin, xMax, inY, sideY, 0.62, 0.8, V.lower);
    both(xMin, xMax, inY, sideY, win - 0.2, win - 0.08, V.stripe);
    both(xMin, xMax, inY, sideY, win - 0.08, win - 0.02, V.stripe2);
  }
  both(xMin, xMax, inY, sideY + 0.004, win - 0.02, win + 0.03, trim); // 車窗下緣飾條
  // 窗柱
  const p0 = -f + 1.0, p1 = f - nose - 1.35;
  for (let x = p0; x < p1; x += 1.9) both(x, x + 0.1, inY, sideY, win, H - 0.44, '#0B0F13');
  // 右前門（台灣右駕，門在右側前方）
  box(f - nose - 1.25, f - nose - 0.25, w - 0.004, w + ep * 2, zb + 0.05, H - 0.46, glass);
  box(f - nose - 1.25, f - nose - 1.2, w, w + ep * 3, zb + 0.05, H - 0.46, '#0B0F13');
  box(f - nose - 0.3, f - nose - 0.25, w, w + ep * 3, zb + 0.05, H - 0.46, '#0B0F13');
  // 駕駛側窗（左前）
  box(f - nose - 1.3, f - nose - 0.1, -w - ep * 2, -w + 0.004, 1.35, H - 0.46, glass);
  // 行李艙門縫、側邊方向燈
  for (const x of [axles[0] - 1.15, -0.9, 0.9, axles[1] + 1.2]) both(x, x + 0.025, inY, sideY + 0.004, 0.66, win - 0.28, '#4A5057');
  for (const x of [axles[0] - 1.0, 0, axles[1] + 1.0]) both(x - 0.08, x + 0.08, inY, sideY + 0.006, 0.66, 0.74, '#F59A1B');
  // 車尾引擎散熱格柵
  both(-f + 0.5, -f + 1.6, inY, sideY + 0.004, 0.75, 1.35, '#24292E');
  // 輪拱內側與輪胎、輪圈
  for (const ax of axles) {
    box(ax - AR, ax + AR, -w + 0.34, w - 0.34, 0.06, AZ + AR - 0.02, '#0E1012');
    const R = 0.52;
    for (let k = 0; k < 8; k++) {
      const z0 = k * R * 2 / 8, z1 = (k + 1) * R * 2 / 8, d = (z0 + z1) / 2 - R, hc = Math.sqrt(R * R - d * d);
      both(ax - hc, ax + hc, w - 0.32, w - 0.03, z0, z1, tyre);
      const rr2 = 0.3, d2 = Math.abs(d);
      if (d2 < rr2) { const hr = Math.sqrt(rr2 * rr2 - d2 * d2); both(ax - hr, ax + hr, w - 0.03, w - 0.01, z0, z1, d2 < 0.09 ? '#6B7278' : '#BCC2C8'); }
    }
  }
  // ---------- 車頭 ----------
  const fz = z => xf(z), fw = ww => ww - nose * 0.62;
  // LED 路線牌（擋風玻璃上緣內側）
  { const z0 = ws1 - 0.3, z1 = ws1 - 0.06, x = fz(z1); box(x - 0.06, x + 0.006, -fw(w) + 0.2, fw(w) - 0.2, z0, z1, '#07090B'); box(x - 0.05, x + 0.012, -fw(w) + 0.45, fw(w) - 0.45, z0 + 0.05, z1 - 0.05, '#FFA51F'); }
  // 擋風玻璃上緣遮罩、下緣
  { const x = fz(ws1 + 0.02); box(x - 0.08, x + 0.01, -fw(w), fw(w), ws1, ws1 + 0.05, mask); }
  box(f - 0.04, f + 0.012, -fw(w), fw(w), ws0 - 0.04, ws0 + 0.04, mask);
  // 頭燈、霧燈、保險桿、車牌、品牌色飾
  for (const s of [-1, 1]) {
    const y1 = s * (fw(w) - 0.05), y2 = s * (fw(w) - 0.62);
    box(f - 0.02, f + 0.018, Math.min(y1, y2), Math.max(y1, y2), 0.84, 1.02, '#DDE7F0');
    box(f - 0.02, f + 0.024, Math.min(y1, y2) + (s > 0 ? 0.32 : 0.05), Math.max(y1, y2) - (s > 0 ? 0.05 : 0.32), 0.87, 0.99, '#FFFFFF');
    box(f - 0.02, f + 0.018, s > 0 ? fw(w) - 0.42 : -fw(w) + 0.12, s > 0 ? fw(w) - 0.12 : -fw(w) + 0.42, 0.52, 0.62, '#F3D27A');
  }
  box(f - 0.02, f + 0.02, -fw(w) + 0.05, fw(w) - 0.05, zb, 0.7, shade(V.lower, 0.5));
  box(f - 0.02, f + 0.03, -0.26, 0.26, 0.5, 0.66, '#F2F2EE');
  box(f - 0.02, f + 0.016, -0.7, 0.7, 1.06, 1.14, V.style === 'solid' ? V.stripe : V.lower);
  // 兔耳後照鏡：從車頂前緣伸出，垂在擋風玻璃前方兩側
  for (const s of [-1, 1]) {
    const yA = s * (w - 0.2), yO = s * (w + 0.1), xa = fz(H - 0.36);
    box(xa - 0.1, f + 0.42, Math.min(yA, yA + s * 0.06), Math.max(yA, yA + s * 0.06), H - 0.38, H - 0.32, '#1A1D21');
    box(f + 0.36, f + 0.42, Math.min(yA, yA + s * 0.06), Math.max(yA, yA + s * 0.06), 2.5, H - 0.32, '#1A1D21');
    box(f + 0.3, f + 0.46, Math.min(yA - s * 0.12, yO), Math.max(yA - s * 0.12, yO), 1.85, 2.55, '#1A1D21');
    box(f + 0.29, f + 0.3, Math.min(yA - s * 0.08, yO - s * 0.04), Math.max(yA - s * 0.08, yO - s * 0.04), 1.9, 2.5, '#6F8796');
  }
  // ---------- 車尾 ----------
  const rx = -f - 0.012;
  box(rx, -f + 0.01, -w + 0.3, w - 0.3, H - 1.15, H - 0.5, glass);         // 後窗
  box(rx, -f + 0.01, -w + 0.25, w - 0.25, 1.3, 1.9, V.style === 'solid' ? V.stripe : V.lower); // 品牌色帶
  box(rx, -f + 0.01, -0.9, 0.9, 0.62, 1.2, '#2A2F35');                   // 引擎蓋格柵
  box(rx - 0.01, -f + 0.01, -0.26, 0.26, 0.45, 0.6, '#F2F2EE');           // 車牌
  for (const s of [-1, 1]) {
    const y1 = s * (w - 0.16), y2 = s * (w - 0.34);
    box(rx, -f + 0.02, Math.min(y1, y2), Math.max(y1, y2), 0.75, 2.3, '#B8141B');
    box(rx - 0.004, -f + 0.02, Math.min(y1, y2), Math.max(y1, y2), 1.5, 1.7, '#F39A1E');
  }
  box(rx, -f + 0.01, -w + 0.05, w - 0.05, zb, 0.6, shade(V.lower, 0.5));   // 後保險桿
  return out;
}

/* ---------- 每格更新 ---------- */
const busVisible = () => BUS.on && (BUS_DEMO || Math.abs(S.simMs - Date.now()) < 3 * 60e3);
let busLast = performance.now();
function stepBuses(now) {
  requestAnimationFrame(stepBuses);
  const dt = Math.min(0.5, (now - busLast) / 1000); busLast = now;
  if (!S.mapReady || !AIR.layers) return;
  const extra = [];
  const show = busVisible() && BUS.list.size;
  if (!show) { PlaneGL.extra = extra; if (BUS.follow) exitBusFollow(); return; }
  const z = map.getZoom(), t = Date.now(), bd = map.getBounds(), pad = 0.05;
  for (const b of BUS.list.values()) {
    const near = b === BUS.follow || (z >= 11 && b.fixes.length && (() => { const f = b.fixes[b.fixes.length - 1]; return f.lon > bd.getWest() - pad && f.lon < bd.getEast() + pad && f.lat > bd.getSouth() - pad && f.lat < bd.getNorth() + pad; })());
    if (!near) { b.drawn = null; continue; }
    wantRoute(b.route);
    const q = busPos(b, t, dt); if (!q) continue;
    const ll = bll(q.x, q.y), [lk, lv] = busLivery(b);
    b.drawn = { ll, h: q.h };
    extra.push({ p: { alt: 0, h: q.h, pitch: 0 }, ll, len: 12, mesh: () => PlaneGL.meshFor('bus|' + lk, () => busParts(lv)), onPick: () => followBus(b) });
  }
  PlaneGL.extra = extra;
  let cam = null;
  if (BUS.follow && BUS.follow.drawn && !BUS.paused) cam = busCamera(BUS.follow);
  if (cam) { try { map.jumpTo(cam); } catch {} }
  else PlaneGL.kick(now);
}
requestAnimationFrame(stepBuses);

/* ---------- 跟拍 ---------- */
const BUS_VIEWS = [{ id: 'auto', name: '自動' }, { id: 'chase', name: '追車' }, { id: 'side', name: '側拍' }, { id: 'front', name: '迎面' }, { id: 'top', name: '俯瞰' }, { id: 'orbit', name: '環繞' }];
const BUS_AUTO = ['chase', 'side', 'orbit', 'front', 'top'];
function curBusView() {
  if (BUS.view !== 'auto') return BUS.view;
  const now = performance.now();
  if (!BUS.auto || now - BUS.auto.t0 > 12000) { const i = BUS.auto ? (BUS_AUTO.indexOf(BUS.auto.v) + 1) % BUS_AUTO.length : 0; BUS.auto = { v: BUS_AUTO[i], t0: now }; busBlend(); renderBusCap(true); }
  return BUS.auto.v;
}
function busCamera(b) {
  const { ll, h } = b.drawn, [x, y] = bxy(ll[0], ll[1]), v = hdgVec(h), n = [v[1], -v[0]];
  let back = 38, right = 12, up = 14;
  const view = curBusView();
  if (view === 'side') { back = 4; right = -42; up = 9; }
  else if (view === 'front') { back = -48; right = 14; up = 11; }
  else if (view === 'top') { back = 25; right = 6; up = 110; }
  else if (view === 'orbit') { const th = performance.now() / 1000 * 0.15; back = Math.cos(th) * 55; right = Math.sin(th) * 55; up = 22; }
  const cx = x - v[0] * back + n[0] * right, cy = y - v[1] * back + n[1] * right;
  let cam = camFromTo(bll(cx, cy), up, ll, 1.5, COARSE ? 76 : 80);
  if (BUS.blend) {
    const T = BUS.blend, k = ease(Math.min(1, (performance.now() - T.t0) / 1800));
    cam.center = [T.from.c.lng + (cam.center.lng - T.from.c.lng) * k, T.from.c.lat + (cam.center.lat - T.from.c.lat) * k];
    cam.zoom = T.from.zoom + (cam.zoom - T.from.zoom) * k; cam.pitch = T.from.pitch + (cam.pitch - T.from.pitch) * k;
    cam.bearing = T.from.bearing + angDiff(T.from.bearing, cam.bearing) * k;
    if (k >= 1) BUS.blend = null;
  }
  return cam;
}
function busBlend() { BUS.blend = { t0: performance.now(), from: { c: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } }; }
function followBus(b) {
  if (typeof setRoam === 'function') setRoam(false);
  if (S.follow) unfollow();
  if (AIR.watch) exitWatch();
  BUS.follow = b; BUS.paused = false; BUS.auto = null; busBlend();
  wantRoute(b.route);
  renderBusCap(true);
}
function exitBusFollow() {
  if (!BUS.follow) return;
  BUS.follow = null; BUS.paused = false;
  renderBusCap(true);
}
// 選列車、漫遊、看飛機或回到全台時離開客運跟拍
{
  const _f = follow; follow = function () { exitBusFollow(); return _f.apply(this, arguments); };
  const _w = watchAirport; watchAirport = function () { exitBusFollow(); return _w.apply(this, arguments); };
  $('#overview').addEventListener('click', () => exitBusFollow(), { capture: true });
  const box = $('#map');
  const pause = () => { if (BUS.follow && !BUS.paused) { BUS.paused = true; renderBusCap(true); } };
  box.addEventListener('pointerdown', e => { if (e.button > 0 && e.pointerType === 'mouse') return; pause(); }, { capture: true });
  box.addEventListener('wheel', pause, { capture: true, passive: true });
}

/* ---------- 字卡（和飛機、列車一樣可收合）與視角按鈕 ---------- */
const busCap = document.createElement('section');
busCap.id = 'buscap'; busCap.className = 'glass'; busCap.hidden = true; busCap.setAttribute('aria-live', 'polite');
document.body.appendChild(busCap);
function busTitle(b) { return `${b.routeName || b.route} ${opName(b)}`.trim(); }
function busRoute(b) { const r = BUS.routes.get(b.route); if (!r || !r.from) return b.subName && b.subName !== b.routeName ? b.subName : ''; return b.dir ? `${r.to} → ${r.from}` : `${r.from} → ${r.to}`; }
function renderBusCap() {
  const b = BUS.follow;
  document.body.classList.toggle('buswatch', !!b);
  if (!b) { busCap.hidden = true; if (!AIR.watch && typeof renderViewBtn === 'function') renderViewBtn(); return; }
  const f = b.fixes[b.fixes.length - 1], age = f ? Math.max(0, Math.round((Date.now() - f.t) / 1000)) : 0;
  const status = `${Math.round(b.speed)} km/h · ${age < 90 ? age + ' 秒前定位' : Math.round(age / 60) + ' 分前定位'}`;
  if (!busCap.querySelector('#busexit')) {
    busCap.setAttribute('role', 'button'); busCap.tabIndex = 0;
    busCap.innerHTML = `<div class="strip"><span class="dot"></span><b class="nm"></b><span class="nx"></span><button class="x" id="busexit2" aria-label="離開"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="kicker"><span class="dot"></span><span class="kt">國道客運 · 即時定位</span></div><h2></h2><div class="route"></div><div class="st"></div>
      <div class="caprow"><button class="pillbtn small" id="busnext">換一輛</button><button class="pillbtn small" id="busexit">離開</button></div>`;
  }
  busCap.hidden = false;
  busCap.classList.toggle('mini', !S.capOpen);
  busCap.setAttribute('aria-expanded', String(!!S.capOpen)); busCap.setAttribute('aria-label', '客運資訊，按下可' + (S.capOpen ? '收起' : '展開'));
  const set = (sel, t) => { const el = busCap.querySelector(sel); if (el.textContent !== t) el.textContent = t; };
  const route = busRoute(b);
  set('h2', busTitle(b)); set('.route', route + (route ? ' · ' : '') + b.plate); set('.st', status);
  set('.strip .nm', busTitle(b)); set('.strip .nx', Math.round(b.speed) + ' km/h');
  for (const d of busCap.querySelectorAll('.dot')) d.style.background = busColor(b);
  renderBusViewBtn();
}
function busViewName() { const v = BUS_VIEWS.find(v => v.id === BUS.view) || BUS_VIEWS[1]; return v.id === 'auto' && BUS.auto ? '自動（' + BUS_VIEWS.find(x => x.id === BUS.auto.v).name + '）' : v.name; }
function renderBusViewBtn() {
  const btn = $('#viewbtn'); if (!btn || !BUS.follow) return;
  btn.disabled = false;
  btn.textContent = BUS.paused ? '◉ 回到客運' : '視角・' + busViewName();
}
if (typeof renderViewBtn === 'function') { const _r = renderViewBtn; renderViewBtn = function () { if (BUS.follow) return renderBusViewBtn(); return _r.apply(this, arguments); }; }
function cycleBusView() {
  if (BUS.paused) { BUS.paused = false; busBlend(); renderBusCap(true); return; }
  const i = BUS_VIEWS.findIndex(v => v.id === BUS.view);
  BUS.view = BUS_VIEWS[(i + 1) % BUS_VIEWS.length].id; store.set('busView', BUS.view); BUS.auto = null; busBlend(); renderBusCap(true);
}
$('#viewbtn').addEventListener('click', e => { if (!BUS.follow) return; e.stopImmediatePropagation(); cycleBusView(); }, { capture: true });
function nextBus() {
  const cur = BUS.follow; if (!cur || !cur.drawn) return;
  // 換到附近另一輛：離目前位置最近、還沒看過的
  BUS.seen = BUS.seen || new Set(); BUS.seen.add(cur.plate);
  const [x, y] = bxy(...cur.drawn.ll);
  let best = null, bd = Infinity;
  for (const b of BUS.list.values()) {
    if (b === cur || BUS.seen.has(b.plate) || !b.fixes.length) continue;
    const f = b.fixes[b.fixes.length - 1], [bx, by] = bxy(f.lon, f.lat), d = Math.hypot(bx - x, by - y);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) { BUS.seen.clear(); return; }
  followBus(best);
}
busCap.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn && (btn.id === 'busexit' || btn.id === 'busexit2')) return exitBusFollow();
  if (btn && btn.id === 'busnext') return nextBus();
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderBusCap(true);
});
busCap.addEventListener('keydown', e => {
  if (e.target !== busCap || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); e.stopPropagation();
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderBusCap(true);
});
document.addEventListener('keydown', e => {
  if (!BUS.follow || e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') { exitBusFollow(); e.stopImmediatePropagation(); }
  else if (e.key === 'v' || e.key === 'V') { cycleBusView(); e.stopImmediatePropagation(); }
});
setInterval(() => { if (BUS.follow) renderBusCap(); }, 1000);

/* ---------- 「選一列車」裡的「國道客運」分頁 ---------- */
{
  const tab = document.createElement('button');
  tab.dataset.g = 'bus'; tab.setAttribute('aria-pressed', 'false'); tab.textContent = '國道客運';
  $('#ptabs').appendChild(tab);
}
let busPickHtml = '';
function renderBusPick(force) {
  const q = $('#pq').value.trim();
  let html = '<i data-buslist hidden></i>';
  if (!busVisible() || !BUS.list.size) {
    html += `<div class="empty">${!BUS_DEMO && !busCred().id ? '國道客運需要 TDX 金鑰：到設定填入後就會出現全台公路客運的即時位置。' : !BUS.on ? '國道客運已在設定中關閉。' : Math.abs(S.simMs - Date.now()) >= 3 * 60e3 ? '國道客運只在即時模式顯示（時間要是現在）。' : '正在讀取客運位置…'}</div>`;
  } else {
    const rows = [...BUS.list.values()].filter(b => !q || (b.routeName || '').includes(q) || opName(b).includes(q) || busRoute(b).includes(q) || b.plate.includes(q.toUpperCase()));
    rows.sort((a, b) => (a.routeName || '').localeCompare(b.routeName || '', 'zh-Hant', { numeric: true }) || a.plate.localeCompare(b.plate));
    html += rows.slice(0, 160).map(b => `<button data-bus="${esc(b.plate)}"><span class="c" style="background:${busColor(b)}"></span><span class="n">${esc(b.routeName || b.route)}</span><span class="d">${esc([opName(b), busRoute(b)].filter(Boolean).join(' · '))}</span><span class="s">${Math.round(b.speed)} km/h</span></button>`).join('');
    if (rows.length > 160) html += `<div class="empty">另有 ${rows.length - 160} 輛，請用搜尋縮小範圍（路線號、客運公司或地名）</div>`;
    if (!rows.length) html += '<div class="empty">沒有符合的客運</div>';
    html += `<div class="empty">TDX 公路客運即時定位，約 30 秒更新一次；客運會沿路線形狀推算位置，所以和實際可能差幾百公尺。</div>`;
  }
  if (!force && html === busPickHtml && $('#plist').querySelector('[data-buslist]')) return;
  busPickHtml = html; $('#plist').innerHTML = html;
}
$('#plist').addEventListener('click', e => {
  const btn = e.target.closest('button[data-bus]'); if (!btn) return;
  const b = BUS.list.get(btn.dataset.bus); if (b) followBus(b);
  if (typeof closePicker === 'function') closePicker();
});
setInterval(() => { if (S.pickGroup === 'bus' && !$('#picker').hidden) renderBusPick(); }, 2000);

/* ---------- 開關與排程 ---------- */
{
  const row = $('#planebtn') && $('#planebtn').parentNode;
  if (row) {
    const b = document.createElement('button');
    b.id = 'busbtn'; b.title = '需要 TDX 金鑰；全台公路客運的即時位置，只在即時模式顯示'; b.textContent = '國道客運';
    b.setAttribute('aria-pressed', String(BUS.on));
    row.insertBefore(b, $('#alertbtn'));
    b.addEventListener('click', () => { BUS.on = !BUS.on; store.set('buses', BUS.on); b.setAttribute('aria-pressed', String(BUS.on)); if (BUS.on) loadBuses(); else exitBusFollow(); });
  }
}
function reloadBuses() { loadBuses().catch(e => console.warn(e)); }
setTimeout(reloadBuses, 7000);
setInterval(reloadBuses, 30e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - BUS.loadAt > 30e3) reloadBuses(); });
$('#tdxgo').addEventListener('click', () => setTimeout(reloadBuses, 3000));

/* ---------- ?busdemo：沒有金鑰時用假資料預覽（國道一號台北—台中的大略路線） ---------- */
function demoBuses() {
  const line = [[121.517, 25.049], [121.47, 25.06], [121.40, 25.04], [121.30, 25.01], [121.21, 24.95], [121.13, 24.88], [121.02, 24.80], [120.93, 24.70], [120.86, 24.59], [120.79, 24.47], [120.72, 24.30], [120.68, 24.17]];
  if (!BUS.shapes.has('DEMO')) {
    const sh = shapeOf(line);
    BUS.shapes.set('DEMO', [{ sub: 'DEMO', dir: 0, ...sh }, { sub: 'DEMO', dir: 1, ...shapeOf(line.slice().reverse()) }]);
    BUS.routes.set('DEMO', { from: '臺北轉運站', to: '朝馬轉運站', op: '示範客運' });
    ['國光客運', '統聯客運', '和欣客運', '葛瑪蘭客運', '阿羅哈客運', '首都客運'].forEach((n, i) => BUS.ops.set('DEMO' + i, n));
  }
  const now = Date.now(), list = BUS.shapes.get('DEMO');
  for (let i = 0; i < 24; i++) {
    const plate = 'DEMO-' + (100 + i), dir = i % 2, sh = list[dir];
    const speed = 85 + (i % 5) * 4, s = ((i * 0.083 * sh.len) + (now / 1000) * speed / 3.6) % sh.len, q = along(sh, s), [lon, lat] = bll(q.x, q.y);
    let b = BUS.list.get(plate);
    if (!b) { b = { plate, fixes: [] }; BUS.list.set(plate, b); }
    Object.assign(b, { route: 'DEMO', routeName: '1610', sub: 'DEMO', subName: '', dir, op: 'DEMO' + (i % 6), speed, az: q.h, seenAt: now });
    // 假裝定位延遲 20 秒，測試往前推算
    b.fixes = [{ lon, lat, t: now - 20000, speed, az: q.h }]; b.s0 = null;
    const back = along(sh, s - speed / 3.6 * 20), [l2, a2] = bll(back.x, back.y); b.fixes = [{ lon: l2, lat: a2, t: now - 20000, speed, az: q.h }];
  }
  BUS.live = true; BUS.status = '示範資料';
}
