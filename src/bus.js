/* ===== 國道客運：TDX 公路客運即時位置 =====
   需要 TDX 金鑰。每 30 秒讀一次全台公路客運的定位（v2/Bus/RealTimeByFrequency/InterCity），
   畫面附近或正在跟拍的路線再讀路線形狀（v2/Bus/Shape/InterCity），讓客運沿著道路平順移動，
   不會每 30 秒跳一格。只在即時模式（時間是現在）顯示。網址加上 ?busdemo 可用假資料預覽。 */

const BUS = { on: store.get('buses', true), list: new Map(), shapes: new Map(), routes: new Map(), ops: new Map(), queue: [], qBusy: false,
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
    BUS.shapes.set(uid, list);
  } catch { BUS.shapes.set(uid, []); }
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

/* ---------- 3D 模型：遊覽車 ---------- */
const BUS_COLORS = [['國光', '#1F5FAF'], ['統聯', '#E8742A'], ['和欣', '#6B3FA0'], ['阿羅哈', '#1B76C2'], ['葛瑪蘭', '#2A8C82'], ['首都', '#2E6FB5'],
  ['大有', '#D33A3A'], ['豪泰', '#C9A227'], ['日統', '#8B1E3F'], ['台西', '#2F7D5A'], ['飛狗', '#C0392B'], ['建明', '#3E7CB1'], ['亞聯', '#D4573B'], ['台聯', '#3A8D5C']];
function busColor(b) {
  const name = BUS.ops.get(b.op) || (BUS.routes.get(b.route) || {}).op || '';
  const hit = BUS_COLORS.find(([k]) => name.includes(k));
  return hit ? hit[1] : ['#2E6FB5', '#E8742A', '#6B3FA0', '#2A8C82', '#C0392B'][Math.floor(hash(b.op || b.plate) * 5)];
}
const opName = b => BUS.ops.get(b.op) || (BUS.routes.get(b.route) || {}).op || '';
function busParts(col) {
  const L = 12.2, W = 2.5, out = [], body = '#EEF1F4', glass = '#26313C', dark = '#1E2329';
  const box = (f1, f2, r1, r2, b, t, c) => out.push({ c: [[f1, r1], [f2, r1], [f2, r2], [f1, r2]], b, t, col: c });
  const f = L / 2, w = W / 2;
  for (const a of [f - 2.6, -f + 3.4, -f + 2.1]) for (const s of [-1, 1]) box(a - 0.5, a + 0.5, s > 0 ? w - 0.3 : -w - 0.05, s > 0 ? w + 0.05 : -w + 0.3, 0, 1.0, dark); // 輪子
  box(-f, f, -w, w, 0.35, 1.25, body);                 // 車身下半
  box(-f + 0.2, f - 0.2, -w - 0.02, w + 0.02, 0.95, 1.2, col); // 腰線
  box(-f, f - 0.15, -w, w, 1.25, 2.95, glass);          // 車窗
  for (let a = -f + 1.2; a < f - 1; a += 1.6) box(a, a + 0.18, -w - 0.01, w + 0.01, 1.3, 2.9, body); // 窗柱
  box(f - 0.15, f, -w, w, 0.35, 2.95, glass);            // 擋風玻璃
  box(-f, f, -w, w, 2.95, 3.45, body);                   // 車頂
  box(-f + 0.4, f - 0.6, -w + 0.15, w - 0.15, 3.45, 3.6, body);
  box(-f + 0.3, f - 1.2, -w - 0.02, w + 0.02, 2.95, 3.2, col); // 車頂色帶
  box(-f, -f + 0.1, -w + 0.2, w - 0.2, 1.4, 3.2, col);   // 車尾
  for (const s of [-1, 1]) box(f - 0.2, f + 0.15, s * (w + 0.25) - 0.06, s * (w + 0.25) + 0.06, 2.0, 2.7, dark); // 後照鏡
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
    const ll = bll(q.x, q.y), col = busColor(b);
    b.drawn = { ll, h: q.h };
    extra.push({ p: { alt: 0, h: q.h, pitch: 0 }, ll, len: 12, mesh: () => PlaneGL.meshFor('bus|' + col, () => busParts(col)), onPick: () => followBus(b) });
  }
  PlaneGL.extra = extra;
  let cam = null;
  if (BUS.follow && BUS.follow.drawn && !BUS.paused) cam = busCamera(BUS.follow);
  if (cam) { try { map.jumpTo(cam); } catch {} }
  else if (extra.length) map.triggerRepaint();
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
    BUS.ops.set('DEMO', '國光客運');
  }
  const now = Date.now(), list = BUS.shapes.get('DEMO');
  for (let i = 0; i < 24; i++) {
    const plate = 'DEMO-' + (100 + i), dir = i % 2, sh = list[dir];
    const speed = 85 + (i % 5) * 4, s = ((i * 0.083 * sh.len) + (now / 1000) * speed / 3.6) % sh.len, q = along(sh, s), [lon, lat] = bll(q.x, q.y);
    let b = BUS.list.get(plate);
    if (!b) { b = { plate, fixes: [] }; BUS.list.set(plate, b); }
    Object.assign(b, { route: 'DEMO', routeName: '1610', sub: 'DEMO', subName: '', dir, op: 'DEMO', speed, az: q.h, seenAt: now });
    // 假裝定位延遲 20 秒，測試往前推算
    b.fixes = [{ lon, lat, t: now - 20000, speed, az: q.h }]; b.s0 = null;
    const back = along(sh, s - speed / 3.6 * 20), [l2, a2] = bll(back.x, back.y); b.fixes = [{ lon: l2, lat: a2, t: now - 20000, speed, az: q.h }];
  }
  BUS.live = true; BUS.status = '示範資料';
}
