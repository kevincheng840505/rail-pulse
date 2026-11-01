/* ===== 路網與班表推估引擎 ===== */
const LAT0 = 23.7, LON0 = 120.95;
const KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
const proj = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY];
const normName = s => (s || '').replace(/臺/g, '台').replace(/\s/g, '');

const NODES = [];          // {id, sys, name, lat, lon, x, y, lines:Set}
const NODE_BY = new Map(); // `${sys}:${name}` -> node
const ADJ = new Map();     // node.id -> [{to, d}]  (TRA / THSR 圖)

function addNode(sys, name, lat, lon) {
  const key = sys + ':' + name;
  if (NODE_BY.has(key)) return NODE_BY.get(key);
  const [x, y] = proj(lat, lon);
  const n = { id: NODES.length, sys, name, lat, lon, x, y, lines: new Set() };
  NODES.push(n); NODE_BY.set(key, n); ADJ.set(n.id, []);
  return n;
}
for (const sys in STATION_TEXT) {
  for (const row of STATION_TEXT[sys].trim().split('\n')) {
    const [name, lat, lon] = row.split(',');
    addNode(sys, name.trim(), +lat, +lon);
  }
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- 真實軌道線形（data/rail.json，由 tools/fetch_rail.py 產生） ---------- */
const SEG = new Map(); // `${sys}:${a}|${b}` -> {pts:[[x,y]], cum:[km], len}
const unproj = (x, y) => [x / KX + LON0, -y / KY + LAT0];
let SEG_GEN = 0; // 線形重新載入時加一，讓各站記住的查表結果失效
// 每格要對每列車查好幾次：結果記在起點站物件上，不用每次組字串查表
function segGeom(a, b) {
  let c = a._sg;
  if (!c || c.gen !== SEG_GEN) c = a._sg = { gen: SEG_GEN, m: new Map() };
  let v = c.m.get(b);
  if (v !== undefined) return v;
  const g = SEG.get(a.sys + ':' + a.name + '|' + b.name);
  if (g) v = { g, rev: false };
  else { const r = SEG.get(a.sys + ':' + b.name + '|' + a.name); v = r ? { g: r, rev: true } : null; }
  c.m.set(b, v);
  return v;
}
/* 兩站之間的軌道長度（公里）；沒有線形時用直線乘上彎曲係數 */
function segLen(a, b, curve = 1.12) {
  const s = segGeom(a, b);
  return s ? s.g.len : dist(a, b) * curve;
}
/* 兩站之間比例 p（0~1，依距離）的位置與方向 */
function segPoint(a, b, p) {
  const s = segGeom(a, b);
  if (!s) return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, heading: Math.atan2(b.y - a.y, b.x - a.x) };
  const { pts, cum, len } = s.g;
  let d = (s.rev ? 1 - p : p) * len;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const t = Math.min(1, Math.max(0, (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1)));
  const [x1, y1] = pts[lo], [x2, y2] = pts[hi];
  let hd = Math.atan2(y2 - y1, x2 - x1);
  if (s.rev) hd += Math.PI;
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, heading: hd };
}
function applyRailData(data) {
  for (const [key, [lon, lat]] of Object.entries(data.stations || {})) {
    const n = NODE_BY.get(key);
    if (!n) continue;
    n.lon = lon; n.lat = lat; [n.x, n.y] = proj(lat, lon);
  }
  SEG.clear(); SEG_GEN++;
  for (let [key, coords] of Object.entries(data.segments || {})) {
    // 資料裡的線形已被簡化成稀疏折線，轉角很尖：用 Chaikin 切角法修圓滑兩次，車廂過彎才不會折成 Z 字
    let pts = coords.map(([lon, lat]) => proj(lat, lon));
    for (let k = 0; k < 2 && pts.length > 2; k++) {
      const sm = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        if (i > 0) sm.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25]);
        if (i < pts.length - 2) sm.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
      }
      sm.push(pts[pts.length - 1]); pts = sm;
    }
    coords = pts.map(([x, y]) => unproj(x, y));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    SEG.set(key, { pts, cum, len: cum[cum.length - 1] || 0.001, coords });
  }
  SEG_GEN++;
  for (const [id, edges] of ADJ) for (const e of edges) e.d = segLen(NODES[id], NODES[e.to]);
  pathCache.clear();
  if (typeof LINES !== 'undefined') for (const L of LINES) delete L._pp;
}

for (const L of LINES) {
  L.nodes = L.st.split(' ').map(nm => {
    const n = NODE_BY.get(L.sys + ':' + nm);
    if (!n) throw new Error('缺少車站 ' + L.sys + ' ' + nm);
    n.lines.add(L.label || L.name);
    return n;
  });
  for (let i = 1; i < L.nodes.length; i++) {
    const a = L.nodes[i - 1], b = L.nodes[i], d = dist(a, b);
    if (!ADJ.get(a.id).some(e => e.to === b.id)) { ADJ.get(a.id).push({ to: b.id, d }); ADJ.get(b.id).push({ to: a.id, d }); }
  }
}

function shortestPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const D = new Map([[fromId, 0]]), P = new Map(), done = new Set();
  const q = [[0, fromId]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, u] = q.shift();
    if (done.has(u)) continue; done.add(u);
    if (u === toId) break;
    for (const e of ADJ.get(u)) {
      const nd = d + e.d;
      if (nd < (D.get(e.to) ?? Infinity)) { D.set(e.to, nd); P.set(e.to, u); q.push([nd, e.to]); }
    }
  }
  if (!P.has(toId)) return null;
  const path = [toId];
  while (path[0] !== fromId) path.unshift(P.get(path[0]));
  return path;
}
const pathCache = new Map();
function cachedPath(a, b) {
  const k = a + '>' + b;
  if (!pathCache.has(k)) pathCache.set(k, shortestPath(a, b));
  return pathCache.get(k);
}
function routeThrough(sys, waypoints) {
  let ids = [];
  for (let i = 1; i < waypoints.length; i++) {
    const a = NODE_BY.get(sys + ':' + waypoints[i - 1]).id, b = NODE_BY.get(sys + ':' + waypoints[i]).id;
    const p = cachedPath(a, b);
    ids = ids.length ? ids.concat(p.slice(1)) : p.slice();
  }
  return ids.map(i => NODES[i]);
}

/* 簡易雜湊亂數，讓每天的推估結果穩定 */
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

const TRIPS = [];
const NODE_TRIPS = new Map(); // node.id -> [[trip, idx]]

/* 由車站序列與停站規則產生時刻
   nodes: 經過的車站；stopFn(node,i): 是否停靠；spd: km/h；dwell, acc: 分 */
function buildTimes(nodes, stopFn, t0, spd, dwell, acc, curve = 1.12) {
  const out = []; let t = t0;
  for (let i = 0; i < nodes.length; i++) {
    const stop = i === 0 || i === nodes.length - 1 || stopFn(nodes[i], i);
    if (i > 0) {
      const d = segLen(nodes[i - 1], nodes[i], curve); // 有真實線形時用軌道長度
      let rt = d / spd * 60;
      if (out[i - 1].stop) rt += acc;
      if (stop) rt += acc;
      t += rt;
    }
    const arr = t;
    const dep = (stop && i > 0 && i < nodes.length - 1) ? t + dwell : t;
    out.push({ arr, dep, stop });
    t = dep;
  }
  return out;
}

function registerTrip(trip) {
  trip.idx = TRIPS.length;
  trip.start = trip.times[0].dep;
  trip.end = trip.times[trip.times.length - 1].arr + (trip.delay || 0);
  trip.cum = [0];
  for (let i = 1; i < trip.nodes.length; i++) trip.cum.push(trip.cum[i - 1] + segLen(trip.nodes[i - 1], trip.nodes[i]));
  TRIPS.push(trip);
  trip.nodes.forEach((n, i) => {
    if (!trip.times[i].stop) return;
    if (!NODE_TRIPS.has(n.id)) NODE_TRIPS.set(n.id, []);
    NODE_TRIPS.get(n.id).push([trip, i]);
  });
}

const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/* ---------- 台鐵班表推估 ---------- */
const TRA_SERVICES = [
  { type:'自強', wp:['七堵','台北','苗栗','台中','高雄','潮州'], from:'06:00', to:'20:00', hw:60, stops:TZE_STOPS, base:100 },
  { type:'自強', wp:['基隆','台北','大甲','彰化','台南','高雄'], from:'07:30', to:'17:30', hw:120, stops:TZE_STOPS, base:140 },
  { type:'普悠瑪', wp:['樹林','台北','八堵','宜蘭','花蓮','台東'], from:'06:10', to:'18:10', hw:120, stops:TZE_STOPS, base:270 },
  { type:'太魯閣', wp:['樹林','台北','八堵','宜蘭','花蓮'], from:'07:10', to:'20:10', hw:120, stops:TZE_STOPS, base:400 },
  { type:'自強', wp:['新左營','高雄','潮州','枋寮','台東'], from:'07:00', to:'18:00', hw:180, stops:TZE_STOPS, base:300 },
  { type:'自強', wp:['花蓮','台東'], from:'06:40', to:'19:40', hw:120, stops:TZE_STOPS, base:350 },
  { type:'莒光', wp:['基隆','台北','大甲','彰化','高雄'], from:'06:50', to:'18:50', hw:180, stops:CK_STOPS, base:500 },
  { type:'莒光', wp:['樹林','台北','八堵','花蓮'], from:'08:20', to:'16:20', hw:240, stops:CK_STOPS, base:600 },
  { type:'區間快', wp:['七堵','台北','新竹','苗栗'], from:'06:30', to:'21:30', hw:60, stops:QK_STOPS, base:2100 },
  { type:'區間', wp:['基隆','台北','新竹'], from:'05:20', to:'23:20', hw:20, base:1100 },
  { type:'區間', wp:['新竹','竹南','苗栗','台中'], from:'05:40', to:'22:40', hw:30, base:1500 },
  { type:'區間', wp:['豐原','台中','彰化','嘉義'], from:'05:30', to:'23:00', hw:30, base:2200 },
  { type:'區間', wp:['新竹','竹南','大甲','彰化'], from:'05:50', to:'21:50', hw:60, base:2400 },
  { type:'區間', wp:['嘉義','台南','高雄','屏東'], from:'05:10', to:'23:10', hw:20, base:3100 },
  { type:'區間', wp:['屏東','潮州','枋寮'], from:'05:40', to:'22:40', hw:60, base:3500 },
  { type:'區間', wp:['枋寮','大武','台東'], from:'06:00', to:'18:00', hw:240, base:3600 },
  { type:'區間', wp:['台東','玉里','花蓮'], from:'05:50', to:'20:50', hw:90, base:4300 },
  { type:'區間', wp:['花蓮','和平','蘇澳新','宜蘭'], from:'05:30', to:'21:30', hw:90, base:4100 },
  { type:'區間', wp:['蘇澳','蘇澳新','宜蘭','瑞芳','七堵'], from:'05:00', to:'22:30', hw:40, base:4200 },
  { type:'區間', wp:['瑞芳','三貂嶺','菁桐'], from:'06:00', to:'21:00', hw:60, base:4700 },
  { type:'區間', wp:['新竹','竹中','內灣'], from:'05:50', to:'22:20', hw:60, base:1200 },
  { type:'區間', wp:['新竹','竹中','六家'], from:'05:40', to:'23:40', hw:30, base:1250 },
  { type:'區間', wp:['二水','集集','車埕'], from:'06:00', to:'21:00', hw:90, base:2700 },
  { type:'區間', wp:['台南','中洲','沙崙'], from:'05:30', to:'23:30', hw:30, base:3300 },
];

function simDelay(no, type) {
  const r = hash('d' + no), r2 = hash('e' + no);
  const late = type === '區間' ? 0.30 : 0.42;
  if (r > late) return 0;
  if (r > late * 0.35) return 1 + Math.floor(r2 * 4);
  return 5 + Math.floor(r2 * 16);
}

function genTRA() {
  for (const s of TRA_SERVICES) {
    const T = TRA_TYPES[s.type];
    const fwd = routeThrough('TRA', s.wp), rev = fwd.slice().reverse();
    let k = 0;
    for (const nodes of [fwd, rev]) {
      // 南下（往高雄方向 / 順時針）用奇數車次
      const southbound = nodes[nodes.length - 1].lat < nodes[0].lat;
      const off = nodes === rev ? Math.round(s.hw / 2) : 0;
      let j = 0;
      for (let t = hm(s.from) + off; t <= hm(s.to) + off; t += s.hw, j++) {
        const no = String(s.base + j * 2 + (southbound ? 1 : 0));
        const times = buildTimes(nodes, n => s.stops ? s.stops.has(n.name) : true, t, T.spd, s.type === '區間' ? 0.5 : 1, s.type === '區間' ? 0.5 : 0.9);
        registerTrip({ sys:'TRA', no, type:s.type, color:T.color, car:T.car, nodes, times,
          origin:nodes[0].name, dest:nodes[nodes.length - 1].name, delay:simDelay(no, s.type), live:false });
        k++;
      }
    }
  }
}

/* ---------- 高鐵班表推估 ---------- */
function genTHSR() {
  const all = routeThrough('THSR', ['南港', '左營']);
  const pats = [
    { stops:new Set(['南港','台北','板橋','台中','左營']), off:0, base:100, from:'06:30', to:'21:30', hw:60 },
    { stops:new Set(['南港','台北','板橋','桃園','新竹','台中','嘉義','台南','左營']), off:20, base:600, from:'06:15', to:'22:15', hw:60 },
    { stops:null, off:40, base:500, from:'06:00', to:'22:00', hw:60 },
  ];
  for (const p of pats) {
    for (const nodes of [all, all.slice().reverse()]) {
      const south = nodes === all;
      let j = 0;
      for (let t = hm(p.from) + p.off + (south ? 0 : 7); t <= hm(p.to) + p.off; t += p.hw, j++) {
        const no = String(p.base + j * 2 + (south ? 1 : 0)).padStart(4, '0');
        const times = buildTimes(nodes, n => p.stops ? p.stops.has(n.name) : true, t, 250, 1.5, 1.3, 1.04);
        registerTrip({ sys:'THSR', no, type: p.stops && p.stops.size <= 5 ? '直達' : p.stops ? '跳停' : '每站停',
          color:'#F07F1F', car:'700T', nodes, times, origin:nodes[0].name, dest:nodes[nodes.length - 1].name, delay:0, live:false });
      }
    }
  }
}

/* ---------- 捷運 / 輕軌 ---------- */
function genMRT() {
  for (const L of LINES) {
    if (L.sys === 'TRA' || L.sys === 'THSR') continue;
    const [hwPeak, hwOff] = L.hw;
    for (const nodes of [L.nodes, L.nodes.slice().reverse()]) {
      const startOff = nodes === L.nodes ? 0 : 1.5;
      let t = hm('06:00') + startOff + hash(L.id) * 3, j = 0;
      while (t <= 24 * 60) {
        const h = t / 60;
        const peak = (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5);
        const times = buildTimes(nodes, () => true, t, L.spd, 0.35, 0.15, 1.03);
        registerTrip({ sys:L.sys, no:'', line:L, type:L.label || L.name, color:L.color, car:'', nodes, times,
          origin:nodes[0].name, dest:nodes[nodes.length - 1].name, delay:0, live:false, seq:j++ });
        t += peak ? hwPeak : hwOff;
      }
    }
  }
}

function resetTrips(keep) {
  // keep: 保留的系統（例如以 TDX 取代台鐵時保留其他系統）
  const kept = TRIPS.filter(t => keep && keep(t));
  TRIPS.length = 0; NODE_TRIPS.clear();
  kept.forEach(registerTrip);
}

function generateAll() {
  resetTrips();
  genTRA(); genTHSR(); genMRT();
}

/* ---------- 位置計算 ---------- */
function effTime(trip, i, which) {
  const t = trip.times[i][which];
  if (!trip.delay) return t;
  if (i === 0) return t + Math.round(trip.delay * 0.5);
  return t + trip.delay;
}
function easePos(f, aS, aE) {
  const v = 1 / (1 - (aS + aE) / 2);
  if (aS && f < aS) return v * f * f / (2 * aS);
  if (aE && f > 1 - aE) return 1 - v * (1 - f) * (1 - f) / (2 * aE);
  return v * (f - aS / 2);
}

/* 回傳 {x,y,heading,seg,atStation,nodeIdx} 或 null；m 為「營運日分鐘數」 */
function tripPosAt(trip, m) {
  if (trip.live && trip.liveDelay != null) trip.delay = trip.liveDelay;
  const n = trip.nodes.length;
  const first = effTime(trip, 0, 'dep'), last = effTime(trip, n - 1, 'arr');
  if (m < first || m > last) return null;
  // 二分搜尋所在區段
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (effTime(trip, mid, 'arr') <= m) lo = mid; else hi = mid - 1;
  }
  const i = lo, a = trip.nodes[i];
  const dep = effTime(trip, i, 'dep');
  if (m <= dep || i === n - 1) {
    const b = trip.nodes[Math.min(i + 1, n - 1)], pa = trip.nodes[Math.max(i - 1, 0)];
    const hd = i < n - 1 ? segPoint(a, b, 0.001).heading : segPoint(pa, a, 0.999).heading;
    // dwell：停靠時間的進度 0~1，用來開關車門、安排旅客上下車
    const arr = effTime(trip, i, 'arr'), dwell = dep > arr ? Math.min(1, Math.max(0, (m - arr) / (dep - arr))) : 1;
    return { x:a.x, y:a.y, heading:hd, seg:i, atStation:true, km:trip.cum[i], dwell };
  }
  const b = trip.nodes[i + 1];
  const arr = effTime(trip, i + 1, 'arr');
  const f = Math.min(1, Math.max(0, (m - dep) / Math.max(0.01, arr - dep)));
  const aS = trip.times[i].stop ? 0.2 : 0, aE = trip.times[i + 1].stop ? 0.2 : 0;
  const p = easePos(f, aS, aE);
  const pt = segPoint(a, b, p);
  return { x:pt.x, y:pt.y, heading:pt.heading,
    seg:i, atStation:false, km:trip.cum[i] + (trip.cum[i + 1] - trip.cum[i]) * p, f };
}

/* 營運日：凌晨 0~3 點視為前一營運日的延續 */
function serviceMinute(min) { return min < 180 ? min + 1440 : min; }
function tripPos(trip, min) {
  const p = tripPosAt(trip, min) || (min < 240 ? tripPosAt(trip, min + 1440) : null);
  // 從起點站發車時，整列車要停在月台與軌道上：車頭至少在一個車長之外，車尾才不會伸出路線終點
  if (p && typeof trainLength === 'function') {
    if (trip.trainLen == null) trip.trainLen = Math.min(trainLength(trip), trip.cum[trip.cum.length - 1] * 0.5);
    if (p.km < trip.trainLen) p.km = trip.trainLen;
  }
  return p;
}

/* ---------- 載入計時（網址加 ?perf 時在畫面左下角列出每個東西花多久） ---------- */
const PERF = /[?&]perf\b/.test(location.search) ? { marks: [], tdx: [] } : null;
function perfMark(name) { if (PERF && !PERF.marks.some(m => m[0] === name)) PERF.marks.push([name, performance.now()]); }

/* ---------- TDX 即時資料（部署於自有網域時可用） ---------- */
const TDX = {
  token: null, exp: 0, status: '未連線', ok: false, lastDelay: null,
  async auth(id, secret) {
    if (this.token && Date.now() < this.exp) return this.token;
    // 同時有好幾個請求要金鑰時共用同一次驗證，不要一次送好幾個（驗證端也有頻率限制）
    if (this.authing) return this.authing;
    this.authing = this.auth2(id, secret).finally(() => { this.authing = null; });
    return this.authing;
  },
  async auth2(id, secret) {
    const r = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method:'POST', headers:{ 'content-type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({ grant_type:'client_credentials', client_id:id, client_secret:secret })
    });
    if (!r.ok) throw new Error('金鑰驗證失敗（HTTP ' + r.status + '）');
    const j = await r.json();
    this.token = j.access_token; this.exp = Date.now() + (j.expires_in - 60) * 1000;
    return this.token;
  },
  /* TDX 每把金鑰每秒只收幾次請求，超過就回 429。列車、捷運、航班、客運、路線形狀全部排進同一個佇列：
     - 每 260 毫秒最多送出一個（約每秒 4 次）
     - pri 大的先送：使用者正在看的（客運即時位置、點選的車）排在背景讀路線形狀之前
     - 遇到 429 整個佇列暫停一下再重送，最多重試 4 次，呼叫端多半不會看到失敗 */
  q: [], qTimer: 0, nextAt: 0, holdUntil: 0, hold: 0,
  get(path, cred, pri = 1) {
    return new Promise((res, rej) => {
      const job = { path, cred, pri, res, rej, tries: 0, q0: performance.now() };
      if (PERF) { job.perf = { path: path.split('?')[0], q: job.q0 }; PERF.tdx.push(job.perf); }
      let i = this.q.length; while (i > 0 && this.q[i - 1].pri < pri) i--;
      this.q.splice(i, 0, job);
      this.pump();
    });
  },
  pump() {
    if (this.qTimer || this.qAuth || !this.q.length) return;
    const wait = Math.max(this.nextAt, this.holdUntil) - Date.now();
    if (wait > 0) { this.qTimer = setTimeout(() => { this.qTimer = 0; this.pump(); }, wait); return; }
    // 金鑰還沒拿到（開頁、過期）：先驗證完再放行，不然驗證期間排出去的請求會在驗證完同一瞬間一起送出
    if (!this.token || Date.now() >= this.exp) {
      const c = this.q[0].cred;
      this.qAuth = true;
      this.auth(c.id, c.secret)
        .catch(e => { for (const j of this.q.splice(0)) j.rej(e); })
        .finally(() => { this.qAuth = false; this.pump(); });
      return;
    }
    const job = this.q.shift();
    this.nextAt = Date.now() + 260;
    this.send(job);
    this.pump();
  },
  async send(job) {
    try {
      const tk = await this.auth(job.cred.id, job.cred.secret);
      if (job.perf) job.perf.sent = performance.now();
      const r = await fetch('https://tdx.transportdata.tw/api/basic/' + job.path + (job.path.includes('?') ? '&' : '?') + '$format=JSON', {
        headers:{ authorization:'Bearer ' + tk } });
      if (r.status === 429 && job.tries < 4) {
        job.tries++;
        const ra = +r.headers.get('retry-after');
        this.hold = Math.min(8000, Math.max(1500, this.hold * 2));
        this.holdUntil = Math.max(this.holdUntil, Date.now() + (ra > 0 ? ra * 1000 : this.hold));
        this.q.unshift(job); this.pump();
        return;
      }
      if (!r.ok) throw new Error('TDX 回應 HTTP ' + r.status);
      if (Date.now() > this.holdUntil + 10e3) this.hold = 0;
      const body = await r.json();
      if (job.perf) { job.perf.done = performance.now(); job.perf.n = Array.isArray(body) ? body.length : body && body.TrainTimetables ? body.TrainTimetables.length : ''; }
      job.res(body);
    } catch (e) { if (job.perf) { job.perf.done = performance.now(); job.perf.err = String(e.message || e).slice(0, 40); } job.rej(e); }
  },
  /* 把官方時刻表的停靠站補上中間通過站，轉成引擎用的車次 */
  toTrip(sys, no, typeName, stops) {
    const known = [];
    let prev = -1;
    for (const s of stops) {
      const n = NODE_BY.get(sys + ':' + normName(s.name));
      if (!n) continue;
      let arr = hm(s.arr || s.dep), dep = hm(s.dep || s.arr);
      while (prev >= 0 && arr < prev - 600) arr += 1440;
      while (dep < arr) dep += 1440;
      known.push({ n, arr, dep }); prev = dep;
    }
    if (known.length < 2) return null;
    const nodes = [known[0].n], times = [{ arr:known[0].arr, dep:known[0].dep, stop:true }];
    for (let i = 1; i < known.length; i++) {
      const p = cachedPath(known[i - 1].n.id, known[i].n.id);
      if (!p) return null;
      const seg = p.map(id => NODES[id]);
      let tot = 0; const cum = [0];
      for (let k = 1; k < seg.length; k++) { tot += segLen(seg[k - 1], seg[k]); cum.push(tot); }
      const t0 = known[i - 1].dep, t1 = known[i].arr;
      for (let k = 1; k < seg.length - 1; k++) {
        const t = t0 + (t1 - t0) * (cum[k] / (tot || 1));
        nodes.push(seg[k]); times.push({ arr:t, dep:t, stop:false });
      }
      nodes.push(known[i].n); times.push({ arr:known[i].arr, dep:known[i].dep, stop:true });
    }
    let type = '區間', color, car = '';
    if (sys === 'THSR') { type = '高鐵'; color = '#F07F1F'; car = '700T'; }
    else {
      for (const k of ['普悠瑪','太魯閣','自強','莒光','區間快','區間']) if (typeName.includes(k)) { type = k; break; }
      if (typeName.includes('復興')) type = '莒光';
      color = TRA_TYPES[type].color; car = TRA_TYPES[type].car;
      if (typeName.includes('3000')) car = 'EMU3000';
    }
    return { sys, no, type, typeName, color, car, nodes, times, origin:nodes[0].name, dest:nodes[nodes.length - 1].name,
      delay:0, live:true, liveDelay:null };
  },
  async loadTimetables(cred) {
    // 台鐵與高鐵同時讀：以前要等台鐵整份（好幾 MB）下載完才開始讀高鐵
    const [tra, thsr] = await Promise.all([this.get('v3/Rail/TRA/DailyTrainTimetable/Today', cred), this.get('v2/Rail/THSR/DailyTimetable/Today', cred)]);
    const trips = [];
    for (const t of (tra.TrainTimetables || [])) {
      const info = t.TrainInfo;
      const trip = this.toTrip('TRA', info.TrainNo, (info.TrainTypeName && info.TrainTypeName.Zh_tw) || '',
        t.StopTimes.map(s => ({ name:s.StationName.Zh_tw, arr:s.ArrivalTime, dep:s.DepartureTime })));
      if (trip) trips.push(trip);
    }
    for (const t of (thsr || [])) {
      const info = t.DailyTrainInfo;
      const trip = this.toTrip('THSR', info.TrainNo, '',
        t.StopTimes.map(s => ({ name:s.StationName.Zh_tw, arr:s.ArrivalTime || s.DepartureTime, dep:s.DepartureTime || s.ArrivalTime })));
      if (trip) trips.push(trip);
    }
    if (!trips.length) throw new Error('沒有取得任何班次');
    return trips;
  },
  /* 以官方班次取代台鐵與高鐵的推估班次 */
  applyTimetables(trips) {
    resetTrips(t => t.sys !== 'TRA' && t.sys !== 'THSR');
    trips.forEach(registerTrip);
  },
  /* ---------- 捷運與輕軌：TDX 站間行駛時間、班距、首末班車 ---------- */
  METRO_OPS: [['TRTC', 'TRTC'], ['TYMC', 'TYMC'], ['TMRT', 'TMRT'], ['KRTC', 'KRTC'], ['KLRT', 'KRTC']],
  async loadMetro(cred) {
    const all = await Promise.all(this.METRO_OPS.map(async ([op, sys]) => {
      const get = path => this.get(`v2/Rail/Metro/${path}/${op}`, cred).catch(() => null);
      const [s2s, freq, fl] = await Promise.all([get('S2STravelTime'), get('Frequency'), get('FirstLastTimetable')]);
      return { op, sys, s2s: Array.isArray(s2s) ? s2s : [], freq: Array.isArray(freq) ? freq : [], fl: Array.isArray(fl) ? fl : [] };
    }));
    const trips = [], covered = new Set();
    const zh = v => normName(typeof v === 'string' ? v : v && (v.Zh_tw || v.zh_tw) || '');
    const wd = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(Date.now() + 8 * 3600e3).getUTCDay()];
    const tod = s => { if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null; let m = hm(s); if (m < 180) m += 1440; return m; };
    for (const D of all) {
      // 站間時間：不分方向，以站名對當鍵
      const run = new Map(), dwell = new Map();
      for (const r of D.s2s) for (const x of (r.TravelTimes || [])) {
        const a = zh(x.FromStationName), b = zh(x.ToStationName);
        if (!a || !b || !(x.RunTime > 0)) continue;
        run.set(a + '>' + b, x.RunTime / 60); if (!run.has(b + '>' + a)) run.set(b + '>' + a, x.RunTime / 60);
        if (x.StopTime > 0) { dwell.set(a, x.StopTime / 60); if (!dwell.has(b)) dwell.set(b, x.StopTime / 60); }
      }
      // 今天適用的班距
      const freqOf = (routeId, lineId) => {
        // 回傳今天適用的那筆；有資料但今天都不開行時回傳 false，完全沒資料才回傳 null
        const pick = list => list.length ? (list.find(f => !f.ServiceDay || f.ServiceDay[wd] !== false) || false) : null;
        for (const list of [D.freq.filter(f => f.RouteID === routeId), D.freq.filter(f => f.LineID === lineId && !f.RouteID)]) {
          const f = pick(list); if (f !== null) return f;
        }
        return null;
      };
      const firstLast = (from, to) => {
        const list = D.fl.filter(f => zh(f.StationName) === from && (!f.ServiceDay || f.ServiceDay[wd] !== false));
        return list.find(f => zh(f.DestinationStationName) === to) || null;
      };
      for (const r of D.s2s) {
        const tt = (r.TravelTimes || []).slice().sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
        if (!tt.length) continue;
        const names = [zh(tt[0].FromStationName), ...tt.map(x => zh(x.ToStationName))];
        // 找出包含這條路線全部車站、且順序連續的本站路線
        let L = null, i0 = -1, rev = false;
        for (const C of LINES) {
          if (C.sys !== D.sys) continue;
          const nm = C.nodes.map(n => normName(n.name));
          for (const [seq, flip] of [[names, false], [names.slice().reverse(), true]]) {
            const k = nm.indexOf(seq[0]);
            if (k >= 0 && seq.every((x, j) => nm[k + j] === x) && (!L || C.nodes.length < L.nodes.length)) { L = C; i0 = k; rev = flip; }
          }
        }
        if (!L) continue;
        const F = freqOf(r.RouteID, r.LineID);
        if (F === false) continue; // 今天不開行
        // 只有跑完整條路線的資料才取代推估班次；只對到區間車時保留原本的全線推估
        if (names.length === L.nodes.length) covered.add(L);
        const seg = L.nodes.slice(i0, i0 + names.length);
        const dirs = [rev ? seg.slice().reverse() : seg, rev ? seg : seg.slice().reverse()];
        const heads = ((F && F.Headways) || []).map(h => ({ a: tod(h.StartTime), b: tod(h.EndTime), hw: ((+h.MinHeadwayMins || +h.MaxHeadwayMins) + (+h.MaxHeadwayMins || +h.MinHeadwayMins)) / 2 }))
          .filter(h => h.a != null && h.b != null && h.hw > 0).map(h => (h.b <= h.a ? { ...h, b: h.b + 1440 } : h));
        const hwAt = t => { const h = heads.find(h => t >= h.a && t < h.b) || heads.find(h => t + 1440 >= h.a && t + 1440 < h.b); return h ? h.hw : null; };
        const [hwPeak, hwOff] = L.hw;
        dirs.forEach((nodes, d) => {
          const o = normName(nodes[0].name), z = normName(nodes[nodes.length - 1].name);
          const fl = firstLast(o, z);
          let t0 = fl && tod(fl.FirstTrainTime), t1 = fl && tod(fl.LastTrainTime);
          if (t0 == null) t0 = heads.length ? Math.min(...heads.map(h => h.a)) + d * 1.5 : hm('06:00') + d * 1.5;
          if (t1 == null) t1 = heads.length ? Math.max(...heads.map(h => h.b)) : 24 * 60;
          if (t1 <= t0) t1 += 1440;
          // 頭尾不完整的路段（區間車）班距由同一路線的資料決定；全線車都沒有時才用原本的估計
          let j = 0;
          for (let t = t0; t <= t1 + 0.01 && j < 400; j++) {
            const times = []; let c = t;
            for (let k = 0; k < nodes.length; k++) {
              if (k) {
                const a = normName(nodes[k - 1].name), b = normName(nodes[k].name);
                c += run.get(a + '>' + b) || segLen(nodes[k - 1], nodes[k], 1.03) / L.spd * 60 + 0.3;
              }
              const dw = k && k < nodes.length - 1 ? (dwell.get(normName(nodes[k].name)) || 0.35) : 0;
              times.push({ arr: c, dep: c + dw, stop: true }); c += dw;
            }
            trips.push({ sys: L.sys, no: '', line: L, type: L.label || L.name, color: L.color, car: '', nodes, times,
              origin: nodes[0].name, dest: nodes[nodes.length - 1].name, delay: 0, live: true, tdxMetro: true, seq: j });
            const h = t / 60, peak = (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5);
            const hw = hwAt(t);
            if (hw) t += hw;
            else if (heads.length) {
              // 有班距資料但此刻不在任何時段內：跳到下一個時段開始，沒有就收班
              const nx = heads.map(x => x.a).filter(a => a > t).sort((a, b) => a - b)[0];
              if (nx != null) t = nx;
              // 官方末班車比最後一個班距時段晚時，用最後時段的班距開到末班車
              else if (fl && fl.LastTrainTime) t += heads.reduce((x, y) => (y.b > x.b ? y : x)).hw;
              else break;
            } else t += peak ? hwPeak : hwOff;
          }
        });
      }
    }
    return { trips, covered };
  },
  /* 以 TDX 資料產生的捷運班次取代同一路線的推估班次 */
  applyMetro({ trips, covered }) {
    // 舊的 TDX 捷運班次與被取代路線的推估班次一起移除
    resetTrips(t => !t.tdxMetro && !(t.line && covered.has(t.line)));
    trips.forEach(registerTrip);
  },
  async loadDelays(cred, isCurrent = () => true) {
    const j = await this.get('v2/Rail/TRA/LiveTrainDelay', cred);
    if (!isCurrent()) return 0;
    const map = new Map();
    for (const d of j) map.set(String(d.TrainNo), d.DelayTime);
    for (const t of TRIPS) if (t.sys === 'TRA' && t.live) {
      t.liveDelay = map.has(t.no) ? map.get(t.no) : 0;
      t.delay = t.liveDelay;
      t.end = t.times[t.times.length - 1].arr + t.delay;
    }
    this.lastDelay = Date.now();
    return map.size;
  }
};
