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
      const d = dist(nodes[i - 1], nodes[i]) * curve; // 軌道彎曲修正
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
  for (let i = 1; i < trip.nodes.length; i++) trip.cum.push(trip.cum[i - 1] + dist(trip.nodes[i - 1], trip.nodes[i]));
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
    const hd = i < n - 1 ? Math.atan2(b.y - a.y, b.x - a.x) : Math.atan2(a.y - pa.y, a.x - pa.x);
    return { x:a.x, y:a.y, heading:hd, seg:i, atStation:true, km:trip.cum[i] };
  }
  const b = trip.nodes[i + 1];
  const arr = effTime(trip, i + 1, 'arr');
  const f = Math.min(1, Math.max(0, (m - dep) / Math.max(0.01, arr - dep)));
  const aS = trip.times[i].stop ? 0.2 : 0, aE = trip.times[i + 1].stop ? 0.2 : 0;
  const p = easePos(f, aS, aE);
  return { x:a.x + (b.x - a.x) * p, y:a.y + (b.y - a.y) * p, heading:Math.atan2(b.y - a.y, b.x - a.x),
    seg:i, atStation:false, km:trip.cum[i] + (trip.cum[i + 1] - trip.cum[i]) * p, f };
}

/* 營運日：凌晨 0~3 點視為前一營運日的延續 */
function serviceMinute(min) { return min < 180 ? min + 1440 : min; }
function tripPos(trip, min) {
  return tripPosAt(trip, min) || (min < 240 ? tripPosAt(trip, min + 1440) : null);
}

/* ---------- TDX 即時資料（部署於自有網域時可用） ---------- */
const TDX = {
  token: null, exp: 0, status: '未連線', ok: false, lastDelay: null,
  async auth(id, secret) {
    if (this.token && Date.now() < this.exp) return this.token;
    const r = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method:'POST', headers:{ 'content-type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({ grant_type:'client_credentials', client_id:id, client_secret:secret })
    });
    if (!r.ok) throw new Error('金鑰驗證失敗（HTTP ' + r.status + '）');
    const j = await r.json();
    this.token = j.access_token; this.exp = Date.now() + (j.expires_in - 60) * 1000;
    return this.token;
  },
  async get(path, cred) {
    const tk = await this.auth(cred.id, cred.secret);
    const r = await fetch('https://tdx.transportdata.tw/api/basic/' + path + (path.includes('?') ? '&' : '?') + '$format=JSON', {
      headers:{ authorization:'Bearer ' + tk } });
    if (!r.ok) throw new Error('TDX 回應 HTTP ' + r.status);
    return r.json();
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
      for (let k = 1; k < seg.length; k++) { tot += dist(seg[k - 1], seg[k]); cum.push(tot); }
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
    const tra = await this.get('v3/Rail/TRA/DailyTrainTimetable/Today', cred);
    const thsr = await this.get('v2/Rail/THSR/DailyTimetable/Today', cred);
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
    resetTrips(t => t.sys !== 'TRA' && t.sys !== 'THSR');
    trips.forEach(registerTrip);
    return trips.length;
  },
  async loadDelays(cred) {
    const j = await this.get('v2/Rail/TRA/LiveTrainDelay', cred);
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
