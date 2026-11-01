/* ===== 3D 沉浸式介面 ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('rp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rp.' + k, JSON.stringify(v)); } catch {} },
};
const TW = 8 * 3600e3;
const minOfDay = ms => { const d = new Date(ms + TW); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000; };
const dayStart = ms => { const d = new Date(ms + TW); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TW; };
const fmtHM = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const sysGroup = sys => SYSTEMS[sys].group;
const DEG = 180 / Math.PI;

/* ---------- 狀態 ---------- */
const S = {
  capOpen: store.get('capOpen', false),
  simMs: Date.now(), speed: 1, playing: true, live: true,
  positions: [], follow: null, followPaused: false, roam: false, roamAt: 0,
  view: store.get('view2', 'persp'), rel: null, trans: null, ts: null,
  flying: false, mapReady: false, P: null, lookKey: '',
  tod: store.get('tod', 'auto'), wx: store.get('wx', 'auto'), realWx: null, realWxAt: 0, realWxPos: null,
  pickGroup: 'all', terrain: store.get('terrain', true), buildings: store.get('buildings', true), labels: store.get('labels', true),
};
// 已移除的視角（例如舊的「車頭」）存在瀏覽器裡時，改回預設
if (!VIEWS.some(v => v.id === S.view)) S.view = 'persp';
const curMin = () => minOfDay(S.simMs);
const lookHour = () => S.tod === 'auto' ? curMin() / 60 : TOD_FIXED[S.tod];
const lookWx = () => S.wx === 'auto' ? (S.realWx ? S.realWx.wx : 'clear') : S.wx;

/* ---------- 地圖樣式 ---------- */
const COUNTIES_GEOJSON = {
  type: 'FeatureCollection',
  features: GEO.c.map(c => ({ type: 'Feature', properties: { name: c.n }, geometry: { type: 'MultiPolygon', coordinates: c.r.map(r => {
    const ring = []; let qx = r[0], qy = r[1];
    for (let i = 0; i < r.length; i += 2) { if (i) { qx += r[i]; qy += r[i + 1]; } ring.push([qx * GEO.q, qy * GEO.q]); }
    ring.push(ring[0]);
    return [ring];
  }) } })),
};
S.P = paletteAt(lookHour(), lookWx());
const P0 = S.P;
const NAME = ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name']];
const DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 13, encoding: 'terrarium' };
// 地形與山影只用在大範圍視野：手機上把每張高程圖當成 512 像素，同一個畫面只抓約四分之一張數（每張約 100 KB）
// 山影同理；只有電腦開「高」畫質時維持原本的精細度
const DEM_LITE = matchMedia('(pointer: coarse)').matches || store.get('quality', 'low') !== 'high';
const DEM_TERRAIN = { ...DEM, tileSize: DEM_LITE ? 512 : 256 };
const railColor = P => ['case', ['==', ['get', 'color'], ''], P.tra, ['get', 'color']];
const STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    dem: DEM_TERRAIN, demhs: { ...DEM, maxzoom: 11, tileSize: DEM_LITE ? 512 : 256 }, // 山影近看幾乎看不到：最多讀到 zoom 11，再近就放大使用，跟拍時不再一路下載高程圖
    land: { type: 'geojson', data: COUNTIES_GEOJSON },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': P0.sea } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': P0.land } },
    { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]], paint: { 'fill-color': P0.wood, 'fill-opacity': 0.6 } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 12, paint: { 'fill-color': P0.wood, 'fill-opacity': 0.55 } },
    { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 13, filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]], paint: { 'fill-color': P0.wood, 'fill-opacity': 0.35 } },
    { id: 'hills', type: 'hillshade', source: 'demhs', maxzoom: 12, paint: { 'hillshade-shadow-color': P0.hsShadow, 'hillshade-highlight-color': P0.hsHigh, 'hillshade-accent-color': P0.hsAccent, 'hillshade-exaggeration': 0.55 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': P0.water } },
    { id: 'county', type: 'line', source: 'land', paint: { 'line-color': P0.edge, 'line-width': 0.8, 'line-opacity': 0.6 } },
    { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: { 'line-color': P0.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.4, 14, 2.2, 18, 16], 'line-opacity': 0.8 } },
    { id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13.5,
      paint: { 'fill-extrusion-color': P0.bld, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.32, 'fill-extrusion-vertical-gradient': false } },
    // 透視感：半透明建築加上貼地的輪廓線
    { id: 'bld-edge', type: 'line', source: 'omt', 'source-layer': 'building', minzoom: 14,
      paint: { 'line-color': P0.bldEdge, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.4], 'line-opacity': 0.85 } },
    // 近看時的城市小細節：街道名稱與店家、廟宇、學校等地標
    { id: 'street-names', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 16,
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'symbol-placement': 'line', 'text-letter-spacing': 0.1 },
      paint: { 'text-color': P0.label, 'text-halo-color': P0.halo, 'text-halo-width': 1.2, 'text-opacity': 0.8 } },
    { id: 'poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16.5, filter: ['has', 'name'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-max-width': 7, 'symbol-sort-key': ['get', 'rank'] },
      paint: { 'text-color': P0.label, 'text-halo-color': P0.halo, 'text-halo-width': 1.2, 'text-opacity': 0.75 } },
    { id: 'places', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 15], 'text-letter-spacing': 0.15 },
      paint: { 'text-color': P0.label, 'text-halo-color': P0.halo, 'text-halo-width': 1.4, 'text-opacity': 0.75 } },
  ],
};

/* ---------- 路線與車站資料 ---------- */
function lineCoords(L) {
  const out = [], joints = [];
  for (let i = 1; i < L.nodes.length; i++) {
    const a = L.nodes[i - 1], b = L.nodes[i], s = segGeom(a, b);
    const seg = s ? (s.rev ? s.g.coords.slice().reverse() : s.g.coords) : [[a.lon, a.lat], [b.lon, b.lat]];
    if (out.length) joints.push(out.length - 1);
    out.push(...(out.length ? seg.slice(1) : seg));
  }
  return smoothJoints(out, joints);
}
/* 車站接點常有幾公尺的錯位：跟列車用一樣的前後 25 公尺三角加權平均，把接點附近重新取樣，軌道與列車才會疊在一起 */
function smoothJoints(coords, joints) {
  if (!joints.length) return coords;
  const pts = coords.map(([lon, lat]) => proj(lat, lon)), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = cum[cum.length - 1];
  const at = d => {
    d = Math.max(0, Math.min(tot, d));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const t = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
  };
  const sm = d => { let x = 0, y = 0; SMOOTH_W.forEach((w, i) => { const q = at(d + (i - 5) * SMOOTH_STEP); x += q[0] * w; y += q[1] * w; }); return [x / SMOOTH_SUM, y / SMOOTH_SUM]; };
  const W = 0.05, out = [], done = new Set();
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < joints.length && cum[joints[j]] + W <= cum[i]) j++;
    const dj = j < joints.length ? cum[joints[j]] : Infinity;
    if (cum[i] > dj - W) {
      if (!done.has(j)) { done.add(j); for (let d = dj - W; d <= dj + W + 1e-9; d += SMOOTH_STEP) out.push(unproj(...sm(d))); }
      continue;
    }
    out.push(coords[i]);
  }
  return out;
}
function railsGeoJSON() {
  return { type: 'FeatureCollection', features: LINES.filter(L => L.nodes && L.nodes.length > 1).map(L => ({ type: 'Feature',
    properties: { sys: L.sys, g: sysGroup(L.sys), color: L.sys === 'TRA' ? '' : L.color, name: L.name },
    geometry: { type: 'LineString', coordinates: lineCoords(L) } })) };
}
const MAJOR = new Set('基隆 台北 桃園 新竹 苗栗 台中 彰化 嘉義 台南 高雄 屏東 台東 花蓮 宜蘭 瑞芳 蘇澳新 新左營 斗六 玉里 枋寮 潮州'.split(' '));
function stationsGeoJSON() {
  return { type: 'FeatureCollection', features: NODES.map(n => ({ type: 'Feature', id: n.id,
    properties: { id: n.id, name: n.sys === 'THSR' ? '高鐵' + n.name : n.name, g: sysGroup(n.sys), rank: n.sys === 'THSR' ? 1 : n.sys === 'TRA' ? (MAJOR.has(n.name) ? 1 : TZE_STOPS.has(n.name) ? 2 : 3) : 3 },
    geometry: { type: 'Point', coordinates: [n.lon, n.lat] } })) };
}

/* ---------- 地圖 ---------- */
let map = null;
const TAIWAN = { center: [120.95, 23.65], zoom: 6.7, pitch: 35, bearing: -8 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const CAR_ZOOM = 14.5;
const COARSE = matchMedia('(pointer: coarse)').matches;
/* ---------- 畫質：省電（預設）／高 ----------
   省電：動畫手機每秒 30 格、電腦 60 格（120Hz 手機原本會畫到每秒 120 次）、像素比 1、不開地形與山影、
         背景車廂列數減半、不畫建築立面與月台旅客。
   高：完整效果、不限幀率，想看完整畫面的人自己在 ⚙ 打開。 */
const Quality = {
  pref: store.get('quality', 'low') === 'high' ? 'high' : 'low',
  get level() { return this.pref; },
  get low() { return this.pref === 'low'; },
  // 手機省電限每秒 30 格；電腦螢幕大、靠滑鼠操作，30 格看起來一頓一頓，所以電腦省電只限 60 格（擋掉 120／144Hz 螢幕多畫的格數）
  get fps() { return this.low ? (COARSE ? 30 : 60) : 0; },
  get pixelRatio() { return Math.min(window.devicePixelRatio || 1, this.low ? 1 : COARSE ? 1.5 : 2); },
};
const maxCarTrains = () => (COARSE ? 8 : 18) / (Quality.low ? 2 : 1); // 同時畫成車廂的列車上限（跟拍的列車另計）
const liveTrains = () => Quality.low ? 3 : COARSE ? 5 : 8; // 其中每一格都更新的列數
// 幀率上限：同一格（同一個時間戳）裡主迴圈與飛機共用一個判斷，被跳過的格什麼都不送給地圖，地圖也就不重畫
const Pace = { at: -1, ok: true, last: -1e9 };
function paceOk(now) {
  if (now !== Pace.at) {
    Pace.at = now;
    const fps = Quality.fps;
    Pace.ok = !fps || now - Pace.last >= 1000 / fps - 4;
    if (Pace.ok) Pace.last = now;
  }
  return Pace.ok;
}
const DOT = COARSE ? 1.35 : 1; // 手機上列車圓點放大 // 這個縮放以上把列車畫成一節節車廂
/* ---------- 列車 3D 圖層：車廂直接交給 WebGL 畫 ----------
   以前車廂是 GeoJSON 的 fill-extrusion 圖層：每次更新都要送到背景執行緒切圖磚、再傳回來，
   跟拍時幾乎每一格都這樣做，手機的主執行緒被佔滿，縮放就卡。
   現在把同樣的車廂方塊（carFeatures 產生的多邊形與高度）在這裡直接變成三角形，當格上傳、當格畫出，
   不經過背景執行緒，鏡頭和車身也一定是同一格的位置，不需要以前的雙緩衝與平移補償。
   光線算法照 MapLibre 的 fill-extrusion，看起來跟原本一樣。 */
const TrainGL = {
  // 每組各自一份三角形：背景車廂、跟拍的列車、附近的列車、月台旅客
  groups: {
    cars: { base: 'b3', minz: CAR_ZOOM }, focus: { base: 'b3', minz: CAR_ZOOM },
    near: { base: 'b3', minz: CAR_ZOOM }, people: { base: 'b', minz: 16 },
  },
  gl: null, prog: null, loc: null, colors: new Map(),
  set(name, feats) {
    const g = this.groups[name];
    if (!feats.length && !g.f) return; // 已經是空的：不用重畫
    g.f = feats.length ? feats : null; g.dirty = true;
    if (map) map.triggerRepaint();
  },
  has(name) { return !!this.groups[name].f; },
  rgb(c) {
    let v = this.colors.get(c);
    if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; this.colors.set(c, v); }
    return v;
  },
  // 多邊形（經緯度）＋底高、頂高（公尺）→ 以第一個點為原點、單位公尺的三角形（頂面與側面；底面看不到不畫）
  build(g) {
    const f = g.f, gl = this.gl;
    g.dirty = false; g.n = 0;
    if (!f || !gl) return;
    const c0 = f[0].geometry.coordinates[0][0], R = Math.PI / 180;
    const ox = (c0[0] + 180) / 360, oy = (1 - Math.log(Math.tan(Math.PI / 4 + c0[1] * R / 2)) / Math.PI) / 2;
    const mpu = 40075016.686 * Math.cos(c0[1] * R); // 這個緯度上，每個墨卡托單位是幾公尺
    let need = 0;
    for (const q of f) need += (q.geometry.coordinates[0].length - 1) * 9 * 3; // 頂面 (n-2)*3 + 側面 n*6 ≤ n*9 個頂點
    if (!g.P || g.P.length < need) { const cap = Math.ceil(need * 1.5); g.P = new Float32Array(cap); g.N = new Float32Array(cap); g.C = new Float32Array(cap); }
    const P = g.P, N = g.N, C = g.C, bk = g.base;
    let k = 0;
    const xs = [], ys = [];
    const vtx = (x, y, z, nx, ny, nz, col) => { P[k] = x; P[k + 1] = y; P[k + 2] = z; N[k] = nx; N[k + 1] = ny; N[k + 2] = nz; C[k] = col[0]; C[k + 1] = col[1]; C[k + 2] = col[2]; k += 3; };
    for (const q of f) {
      const pr = q.properties, lo = pr[bk] || 0, hi = pr.t;
      if (!(hi - lo > 1e-3)) continue;
      const ring = q.geometry.coordinates[0], n = ring.length - 1, col = this.rgb(pr.c);
      let area = 0;
      for (let i = 0; i < n; i++) {
        const [lon, lat] = ring[i];
        xs[i] = ((lon + 180) / 360 - ox) * mpu;
        ys[i] = ((1 - Math.log(Math.tan(Math.PI / 4 + lat * R / 2)) / Math.PI) / 2 - oy) * mpu;
      }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += xs[i] * ys[j] - xs[j] * ys[i]; }
      const sg = area >= 0 ? 1 : -1;
      // 頂面：扇形三角化（車廂零件都是凸多邊形）
      for (let i = 1; i < n - 1; i++) { vtx(xs[0], ys[0], hi, 0, 0, 1, col); vtx(xs[i], ys[i], hi, 0, 0, 1, col); vtx(xs[i + 1], ys[i + 1], hi, 0, 0, 1, col); }
      // 側面：法向量朝外
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i], l = Math.hypot(dx, dy) || 1, nx = sg * dy / l, ny = -sg * dx / l;
        vtx(xs[i], ys[i], lo, nx, ny, 0, col); vtx(xs[j], ys[j], lo, nx, ny, 0, col); vtx(xs[j], ys[j], hi, nx, ny, 0, col);
        vtx(xs[i], ys[i], lo, nx, ny, 0, col); vtx(xs[j], ys[j], hi, nx, ny, 0, col); vtx(xs[i], ys[i], hi, nx, ny, 0, col);
      }
    }
    g.n = k / 3;
    // 模型矩陣：公尺 → 墨卡托單位，再移到原點
    const s = 1 / mpu;
    g.model = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, ox, oy, 0, 1];
    if (!g.bufs) g.bufs = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    [P, N, C].forEach((arr, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, g.bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, k), gl.DYNAMIC_DRAW); });
  },
  // 點選：沿著畫出來的列車每節車廂取一點投到螢幕上，找最近的一列
  pick(pt) {
    if (!map || map.getZoom() < CAR_ZOOM) return null;
    const m = curMin(), list = [S.follow, ...(S.nearby || []), ...(this.bg || [])];
    let best = null, bd = 18;
    for (const t of list) {
      const pos = t && tripPos(t, m); if (!pos) continue;
      const L = liveryOf(t), step = (L.len + L.gap) / 1000;
      for (let i = 0; i < L.n; i++) {
        const p = trackPoint(t, pos.km - step * (i + 0.5)), q = map.project(unproj(p.x, p.y)), d = Math.hypot(q.x - pt.x, q.y - pt.y);
        if (d < bd) { bd = d; best = t; }
      }
    }
    return best;
  },
  layer: {
    id: 'trains3d', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      const T = TrainGL;
      T.gl = gl;
      for (const g of Object.values(T.groups)) { g.bufs = null; g.dirty = true; }
      const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      // 與 MapLibre fill-extrusion 相同的打光（vertical-gradient 關閉時）
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
        uniform mat4 u_pm; uniform vec3 u_lightpos; uniform vec3 u_lightcolor; uniform float u_lightintensity;
        attribute vec3 a_pos; attribute vec3 a_n; attribute vec3 a_c; varying vec3 v_c;
        void main() {
          float cv = a_c.r * 0.2126 + a_c.g * 0.7152 + a_c.b * 0.0722;
          float d = clamp(dot(a_n, u_lightpos), 0.0, 1.0);
          d = mix(1.0 - u_lightintensity, max(1.0 - cv + u_lightintensity, 1.0), d);
          v_c = clamp(a_c * d * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0));
          gl_Position = u_pm * vec4(a_pos, 1.0);
        }`));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec3 v_c; void main() { gl_FragColor = vec4(v_c, 1.0); }`));
      gl.linkProgram(prog);
      T.prog = prog;
      T.loc = { pm: gl.getUniformLocation(prog, 'u_pm'), lp: gl.getUniformLocation(prog, 'u_lightpos'), lc: gl.getUniformLocation(prog, 'u_lightcolor'), li: gl.getUniformLocation(prog, 'u_lightintensity'),
        attrs: ['a_pos', 'a_n', 'a_c'].map(a => gl.getAttribLocation(prog, a)) };
    },
    onRemove() { TrainGL.gl = null; TrainGL.prog = null; },
    render(gl, matrix) {
      const T = TrainGL; if (!T.prog) return;
      const z = map.getZoom();
      const live = Object.values(T.groups).filter(g => g.f && z >= g.minz);
      if (!live.length) return;
      const L = T.loc;
      gl.useProgram(T.prog);
      // 光線：跟地圖的 setLight 一樣（anchor: map），位置是 [半徑, 方位角, 仰角]
      let lc = [1, 1, 1], li = 0.5, lp = [0, 0, 1.2];
      try {
        const lt = map.getLight() || {};
        if (typeof lt.color === 'string' && lt.color[0] === '#') lc = T.rgb(lt.color);
        if (typeof lt.intensity === 'number') li = lt.intensity;
        if (Array.isArray(lt.position)) { const [r, a0, p0] = lt.position, a = (a0 + 90) * Math.PI / 180, pl = p0 * Math.PI / 180; lp = [r * Math.cos(a) * Math.sin(pl), r * Math.sin(a) * Math.sin(pl), r * Math.cos(pl)]; }
      } catch {}
      gl.uniform3fv(L.lp, lp); gl.uniform3fv(L.lc, lc); gl.uniform1f(L.li, li);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      for (const g of live) {
        if (g.dirty) T.build(g);
        if (!g.n) continue;
        gl.uniformMatrix4fv(L.pm, false, new Float32Array(PlaneGLmul(matrix, g.model)));
        g.bufs.forEach((b, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(L.attrs[i]); gl.vertexAttribPointer(L.attrs[i], 3, gl.FLOAT, false, 0, 0); });
        gl.drawArrays(gl.TRIANGLES, 0, g.n);
      }
    },
  },
};
// 4x4 矩陣相乘（雙精度，避免墨卡托座標在單精度下抖動）
function PlaneGLmul(a, b) { const o = new Float64Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = v; } return o; }
function initMap() {
  if (!window.maplibregl) { $('#intro p').textContent = '地圖元件載入失敗，請確認網路連線後重新整理。'; return; }
  map = new maplibregl.Map({
    container: 'map', style: STYLE, ...TAIWAN, maxPitch: 85, attributionControl: false,
    localIdeographFontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    fadeDuration: 0,
    pixelRatio: Quality.pixelRatio, // 手機 3 倍像素太耗效能
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap 貢獻者 · OpenFreeMap · 地形 Mapzen／AWS · 天氣 Open-Meteo' }), 'bottom-right');
  // 用 style.load 而非 load：外部圖磚失敗時 load 不會觸發，仍要畫出鐵道與列車
  map.once('style.load', () => {
    // 手機上版權列預設收起（點 ⓘ 可展開）
    if (matchMedia('(max-width: 640px)').matches) setTimeout(() => { const el = document.querySelector('.maplibregl-ctrl-attrib'); if (el) el.classList.remove('maplibregl-compact-show'); }, 300);
    syncTerrain(true);
    map.addSource('rails', { type: 'geojson', data: railsGeoJSON() });
    map.addLayer({ id: 'rail-glow', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 9, 16, 18], 'line-blur': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, P0.glow * 0.5, 16, 0] } });
    map.addLayer({ id: 'rail', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0),
        // 近看時畫成約 10 公尺寬的雙線道床，上下行列車各走一側
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 6, ['case', ['==', ['get', 'sys'], 'THSR'], 1.6, ['==', ['get', 'g'], 'mrt'], 1.1, 1], 12, 2.6, 15, 5, 16, 9, 22, 590],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 0.6, 19, 0.38] } });
    map.addSource('stations', { type: 'geojson', data: stationsGeoJSON() });
    map.addLayer({ id: 'st-dot', type: 'circle', source: 'stations',
      filter: ['any', ['<=', ['get', 'rank'], 1], ['all', ['<=', ['get', 'rank'], 2], ['>=', ['zoom'], 9]], ['>=', ['zoom'], 11.5]],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5], 'circle-color': '#0B1118', 'circle-stroke-color': '#EEF3F6', 'circle-stroke-width': 1.3, 'circle-pitch-alignment': 'map', 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 16, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 16, 0] } });
    map.addLayer({ id: 'st-label', type: 'symbol', source: 'stations',
      filter: ['any', ['all', ['<=', ['get', 'rank'], 1], ['>=', ['zoom'], 7.2]], ['all', ['<=', ['get', 'rank'], 2], ['>=', ['zoom'], 10]], ['>=', ['zoom'], 12.5]],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 12, 14, 15, 18, 20], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-letter-spacing': 0.1, visibility: S.labels ? 'visible' : 'none' },
      paint: { 'text-color': '#EEF3F6', 'text-halo-color': 'rgba(5,10,18,.85)', 'text-halo-width': 1.6 } });
    map.addSource('trains', { type: 'geojson', data: EMPTY });
    map.addSource('lights', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'train-halo', type: 'circle', source: 'trains', maxzoom: 15,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 14, 6], 13, ['case', ['get', 'sel'], 26, 14]], 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': P0.glow + 0.15, 'circle-pitch-alignment': 'map' } });
    // 車廂（背景、跟拍、附近）與月台旅客：自訂 WebGL 圖層，見 TrainGL
    map.addLayer(TrainGL.layer);
    // 車頭燈（暖白）與尾燈（紅）：照在地上的光暈，放在車廂與建築這些 3D 圖層底下，
    // 被車身、建築擋住的部分就看不到，不會浮在整個畫面最上層
    map.addLayer({ id: 'light-glow', type: 'circle', source: 'lights', minzoom: 11,
      paint: { 'circle-color': ['get', 'c'], 'circle-blur': 1, 'circle-pitch-alignment': 'map',
        'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['*', 4, ['get', 'k']], 15, ['*', 12, ['get', 'k']], 19, ['*', 60, ['get', 'k']]],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 0.9] } }, 'trains3d');
    // 亮點只在遠看（車廂還是圓點）時畫；近看時車頭本身就有燈
    map.addLayer({ id: 'light-core', type: 'circle', source: 'lights', minzoom: 12, maxzoom: CAR_ZOOM,
      paint: { 'circle-color': '#FFFFFF', 'circle-pitch-alignment': 'map', 'circle-blur': 0.4,
        'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 12, ['*', 1, ['get', 'k']], 16, ['*', 3, ['get', 'k']], 19, ['*', 10, ['get', 'k']]] } }, 'trains3d');
    // 半透明建築要畫在車廂之後：先畫的 3D 圖層會擋住後畫的，這樣隔著建築也看得到列車
    try { map.moveLayer('buildings'); } catch {}
    map.addSource('facade', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'facade', type: 'fill-extrusion', source: 'facade', minzoom: FACADE_ZOOM,
      paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.8, 'fill-extrusion-vertical-gradient': false } });
    const solid = { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false };
    map.addSource('platforms', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'platforms', type: 'fill-extrusion', source: 'platforms', minzoom: FACADE_ZOOM, paint: solid }, 'trains3d');
    map.addSource('lamps', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'lamp-glow', type: 'circle', source: 'lamps', minzoom: FACADE_ZOOM,
      paint: { 'circle-color': '#FFD48A', 'circle-blur': 1, 'circle-pitch-alignment': 'map', 'circle-opacity': 0,
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 16, 6, 20, 90] } }, 'buildings');
    map.on('moveend', () => Facade.soon());
    // 手機 GPU 撐不住時瀏覽器會收回 WebGL，畫面就停在最後一格；幾秒內沒恢復就重新載入頁面
    let glLost = null;
    map.on('webglcontextlost', () => { clearTimeout(glLost); glLost = setTimeout(() => location.reload(), 3000); });
    map.on('webglcontextrestored', () => { clearTimeout(glLost); glLost = null; });
    map.on('sourcedata', e => { if (e.sourceId === 'omt' && e.isSourceLoaded) { perfMark('底圖圖磚（OpenFreeMap）'); Facade.soon(true); } });
    map.once('idle', () => perfMark('地圖第一次全部畫完（idle）'));
    map.addLayer({ id: 'train', type: 'circle', source: 'trains', maxzoom: CAR_ZOOM + 0.5,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 6, ['==', ['get', 'g'], 'mrt'], 2.4 * DOT, 3 * DOT], 12, ['case', ['get', 'sel'], 9, 5.5]],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['case', ['get', 'sel'], 2, 0.6], 'circle-pitch-alignment': 'map' } });
    map.setLayoutProperty('buildings', 'visibility', S.buildings ? 'visible' : 'none');
    for (const l of ['facade', 'lamp-glow']) map.setLayoutProperty(l, 'visibility', S.buildings ? 'visible' : 'none');
    S.mapReady = true;
    perfMark('地圖樣式就緒');
    applyQuality();
    applyLook(true); pushTrains(true);
    map.on('click', onMapClick);
    for (const l of ['train', 'train-halo', 'st-dot']) {
      map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', l, () => map.getCanvas().style.cursor = '');
    }
    // 車廂畫在自訂圖層上，滑鼠游標改用 TrainGL.pick 判斷
    let pickAt = 0;
    if (!COARSE) map.on('mousemove', e => { if (map.getZoom() < CAR_ZOOM || performance.now() - pickAt < 100) return; pickAt = performance.now(); const hit = !!TrainGL.pick(e.point); if (hit !== TrainGL.hover) { TrainGL.hover = hit; map.getCanvas().style.cursor = hit ? 'pointer' : ''; } });
  });
  // 使用者自己拖曳、旋轉或縮放時，暫停跟車
  for (const ev of ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart']) {
    map.on(ev, e => { if (e.originalEvent && S.follow && !S.followPaused) unlockView(); });
  }
  map.on('zoomend', () => syncTerrain());
  // 手指一碰地圖就切到自由視角：跟拍時每一格的 jumpTo 會中斷 MapLibre 的手勢，必須在手勢開始前就停下鏡頭
  const box = map.getCanvasContainer();
  const down = e => { if (e.type === 'pointerdown' && e.button > 0 && e.pointerType === 'mouse') return; S.touching = true; if (S.follow && !S.followPaused) unlockView(); };
  const up = () => { S.touching = false; };
  box.addEventListener('pointerdown', down, true);
  box.addEventListener('wheel', e => { if (S.follow && !S.followPaused) unlockView(); }, { capture: true, passive: true });
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  map.on('error', e => console.warn('地圖資源載入失敗', e && e.error && e.error.message));
}

/* 3D 地形只用在大範圍視野：近看與跟車時攤平，車廂才會整齊、鏡頭不會被地形推開，也省效能 */
let terrainOn = false;
function syncTerrain(force) {
  if (!map) return;
  const z = map.getZoom();
  // 手機上只要還在跟車（就算手動拉遠）就不開地形：地形加上斜角大範圍視野會把手機 GPU 拖垮
  // 手機的地形只留給看全台、看整個縣市的大範圍：拉近到十多公里寬時，斜看的山區要把很多地形圖磚畫到離屏畫面，
  // 加上進出地形時重新編譯著色器，手機 GPU 會整個卡住（電腦可以放寬到更近）
  const [zOn, zOff] = COARSE ? [9.6, 10.4] : [11.5, 12.5];
  const want = S.terrain && S.started && !Quality.low && !(S.follow && (COARSE || !S.followPaused)) && (terrainOn ? z < zOff : z < zOn);
  if (want === terrainOn && !force) return;
  terrainOn = want;
  try { map.setTerrain(want ? { source: 'dem', exaggeration: 1.5 } : null); } catch {}
}
/* 套用畫質：像素比、山影、建築立面與月台旅客、地形 */
function applyQuality() {
  if (!map || !S.mapReady) return;
  const low = Quality.low, vis = on => on ? 'visible' : 'none';
  try { if (map.getPixelRatio() !== Quality.pixelRatio) map.setPixelRatio(Quality.pixelRatio); } catch {}
  try { map.setLayoutProperty('hills', 'visibility', vis(!low)); } catch {}
  for (const l of ['facade', 'lamp-glow']) try { map.setLayoutProperty(l, 'visibility', vis(S.buildings && !low)); } catch {}
  syncTerrain(true); Facade.soon(true); pushTrains(true);
}
function renderQualityBtns() {
  for (const b of document.querySelectorAll('#qualityrow button')) b.setAttribute('aria-pressed', String(b.dataset.v === Quality.pref));
}
function setQuality(v) { Quality.pref = v === 'high' ? 'high' : 'low'; store.set('quality', Quality.pref); renderQualityBtns(); applyQuality(); }

/* ---------- 建築立面：近看時在附近建築外面貼上一層層窗帶與屋頂邊緣 ----------
   向量圖磚的建築只有外框與高度，這裡把鏡頭附近的建築外框往外推一點點，
   每層樓做一圈薄薄的窗帶（夜裡隨機亮燈），屋頂再加一圈收邊，城市才看得出樓層與細節 */
const FACADE_ZOOM = 15.5;
const Facade = (() => {
  let timer = 0, last = null;
  const R = COARSE ? 0.3 : 0.45, FLOOR = 0.0034, MAX_FEAT = COARSE ? 2500 : 5000, MAX_TREES = COARSE ? 400 : 900;
  // 把外框往外推 d 公里（每個頂點沿兩條邊的外法線平均方向）
  function outset(pts, d) {
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    const sgn = a > 0 ? 1 : -1, n = pts.length - 1, out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q0 = pts[(i - 1 + n) % n], q1 = pts[i + 1];
      const e0 = Math.hypot(p[0] - q0[0], p[1] - q0[1]) || 1, e1 = Math.hypot(q1[0] - p[0], q1[1] - p[1]) || 1;
      let nx = (p[1] - q0[1]) / e0 + (q1[1] - p[1]) / e1, ny = -(p[0] - q0[0]) / e0 - (q1[0] - p[0]) / e1;
      const l = Math.hypot(nx, ny) || 1;
      const k = Math.min(3, 2 / l); // 尖角不要推太遠
      out.push(unproj(p[0] + sgn * nx / l * d * k, p[1] + sgn * ny / l * d * k));
    }
    out.push(out[0]);
    return out;
  }
  const poly = (ring, b, t, c) => ({ type: 'Feature', properties: { b, t, c }, geometry: { type: 'Polygon', coordinates: [ring] } });
  // 以 (x, y) 為中心的正多邊形（公里座標，半徑 r 公尺），用來做水塔、樹冠、樹幹、燈桿
  const ngon = (x, y, r, n, rot = 0) => { const out = []; for (let i = 0; i <= n; i++) { const a = rot + i / n * Math.PI * 2; out.push(unproj(x + Math.cos(a) * r / 1000, y + Math.sin(a) * r / 1000)); } return out; };
  // 以 (x, y) 為中心、沿 (ux, uy) 方向的長方形（公尺）
  const rect = (x, y, ux, uy, a, b) => { const vx = -uy, vy = ux, A = a / 2000, B = b / 2000; return [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]].map(([i, j]) => unproj(x + ux * A * i + vx * B * j, y + uy * A * i + vy * B * j)); };
  const SHEET = ['#4F7FA8', '#5E8F86', '#A8674A', '#C5CBD0', '#6E8FB0'];
  /* 台灣街景的屋頂：不鏽鋼水塔、頂樓鐵皮加蓋，外牆掛冷氣室外機 */
  function roofs(cand, out, P) {
    const steel = mixHex('#D9DEE3', P.bld, 0.25), legs = '#5A6068', acc = mixHex('#E4E6E8', P.bld, 0.2);
    for (const B of cand) {
      if (out.length > MAX_FEAT * 1.4) break;
      const seed = hash(B.key + 'r'), pts = B.pts, n = pts.length - 1;
      let gx = 0, gy = 0; for (let i = 0; i < n; i++) { gx += pts[i][0]; gy += pts[i][1]; } gx /= n; gy /= n;
      const top = B.h;
      // 鐵皮加蓋：中低樓層的建築才有，把外框往中心縮成一圈較小的棚子
      const shed = B.h < 40 && seed < 0.55;
      if (shed) {
        const k = 0.55 + seed * 0.4, ring = pts.map(([x, y]) => unproj(gx + (x - gx) * k, gy + (y - gy) * k));
        out.push(poly(ring, top, top + 2.6, mixHex(SHEET[Math.floor(seed * 100) % SHEET.length], P.bld, P.lit ? 0.5 : 0.15)));
      }
      // 水塔：架高的圓桶，靠在屋頂的一角
      if (B.h < 70) {
        const v = pts[Math.floor(seed * n)], tx = gx + (v[0] - gx) * 0.55, ty = gy + (v[1] - gy) * 0.55, h0 = top + (shed ? 2.6 : 0);
        out.push(poly(ngon(tx, ty, 0.9, 4, Math.PI / 4), h0, h0 + 1.0, legs));
        out.push(poly(ngon(tx, ty, 1.0, 10), h0 + 1.0, h0 + 2.9, steel));
        if (seed > 0.7) out.push(poly(ngon(tx + 0.0024, ty, 0.8, 10), h0 + 1.0, h0 + 2.5, steel));
      }
      // 冷氣室外機：隨機掛在幾面外牆的幾層樓
      const nF = Math.floor((B.h - B.b0) / 3.4);
      for (let j = 0; j < Math.min(6, nF); j++) {
        const r = hash(B.key + 'ac' + j), e = Math.floor(r * n), a = pts[e], b = pts[e + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.003) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, t = 0.2 + hash(B.key + 'at' + j) * 0.6;
        // 外法線方向：朝離開中心的那一側
        let nx = -uy, ny = ux; const mx = a[0] + (b[0] - a[0]) * t, my = a[1] + (b[1] - a[1]) * t;
        if ((mx - gx) * nx + (my - gy) * ny < 0) { nx = -nx; ny = -ny; }
        const fl = 1 + Math.floor(hash(B.key + 'af' + j) * Math.max(1, nF - 1)), z = B.b0 + fl * 3.4 + 0.2;
        out.push(poly(rect(mx + nx * 0.0006, my + ny * 0.0006, ux, uy, 0.9, 0.5), z, z + 0.65, acc));
      }
    }
  }
  /* 只取畫面中心附近已載入的圖磚裡的要素。querySourceFeatures 會把所有載入的圖磚都轉成 GeoJSON，
     鏡頭壓低、轉向時遠方圖磚一多，手機上會整個卡住好幾秒 */
  function nearTiles(c, r) {
    const sc = map.style && map.style.sourceCaches && map.style.sourceCaches.omt;
    if (!sc || !sc.getRenderableIds) return null;
    const dLat = r / 110.57, dLon = r / (111.32 * Math.cos(c.lat * Math.PI / 180));
    const W = c.lng - dLon, E = c.lng + dLon, Sb = c.lat - dLat, N = c.lat + dLat, seen = new Set(), out = [];
    for (const id of sc.getRenderableIds()) {
      const tile = sc.getTileByID(id); if (!tile || !tile.querySourceFeatures) continue;
      const { x, y, z, key } = tile.tileID.canonical, n = 2 ** z;
      if (seen.has(key)) continue;
      const lon0 = x / n * 360 - 180, lon1 = (x + 1) / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
      if (lon1 < W || lon0 > E || lat(y) < Sb || lat(y + 1) > N) continue;
      seen.add(key); out.push(tile);
    }
    return out;
  }
  function nearFeatures(tiles, sourceLayer, filter) {
    if (!tiles) return map.querySourceFeatures('omt', { sourceLayer, filter });
    const out = []; for (const t of tiles) t.querySourceFeatures(out, filter ? { sourceLayer, filter } : { sourceLayer }); return out;
  }
  /* 沿著街道種行道樹、立路燈；夜裡路燈在地面打出一圈暖光 */
  const ROAD_W = { primary: 11, secondary: 9, tertiary: 7, minor: 5 };
  function streets(cx, cy, out, P, tiles) {
    let roads;
    try { roads = nearFeatures(tiles, 'transportation', ['in', ['get', 'class'], ['literal', Object.keys(ROAD_W)]]); } catch { return []; }
    const lamps = [], seen = new Set(), RR = R * 0.8;
    // 軌道（含月台）兩側 14 公尺內不種樹、不立路燈
    const rails = [];
    for (const L of LINES) {
      if (!L.nodes || L.nodes.length < 2) continue;
      const pp = L._pp || (L._pp = lineCoords(L).map(([lon, lat]) => proj(lat, lon)));
      for (let i = 1; i < pp.length; i++) {
        const [ax, ay] = pp[i - 1], [bx, by] = pp[i];
        if (Math.min(ax, bx) > cx + RR + 0.02 || Math.max(ax, bx) < cx - RR - 0.02 || Math.min(ay, by) > cy + RR + 0.02 || Math.max(ay, by) < cy - RR - 0.02) continue;
        rails.push([ax, ay, bx, by]);
      }
    }
    const onRail = (x, y) => rails.some(([ax, ay, bx, by]) => {
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(ax + dx * t - x, ay + dy * t - y) < 0.014;
    });
    const trunk = mixHex('#5B4636', P.land, 0.2), pole = mixHex('#7B838C', P.bld, 0.3);
    const leaf = ['#4E7D4A', '#5F8F4E', '#3F6E47', '#6E9A55'].map(c => mixHex(c, P.wood, P.lit ? 0.35 : 0.2));
    let trees = 0;
    for (const f of roads) {
      const w = ROAD_W[f.properties.class], g = f.geometry;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const line of lines) {
        const pts = line.map(([lon, lat]) => proj(lat, lon));
        let run = 0; // 沿整條路累計的距離，路燈間距才不受折線切段影響
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], L = Math.hypot(x2 - x1, y2 - y1);
          if (L < 1e-6) continue;
          const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
          for (let d = (0.012 - run % 0.012) % 0.012; d < L; d += 0.012) {
            const x = x1 + ux * d, y = y1 + uy * d;
            if (Math.hypot(x - cx, y - cy) > RR) continue;
            const key = Math.round(x * 2e3) + ',' + Math.round(y * 2e3);
            if (seen.has(key)) continue; seen.add(key);
            const k = Math.round((run + d) / 0.012), hs = hash(key);
            for (const side of [-1, 1]) {
              const off = (w / 2 + 1.2) / 1000 * side, tx = x + nx * off, ty = y + ny * off;
              if (onRail(tx, ty)) continue;
              if (k % 3 === 1 && side > 0) {
                // 路燈：燈桿＋燈頭，夜裡地上一圈光
                out.push(poly(ngon(tx, ty, 0.12, 4), 0, 7, pole));
                out.push(poly(rect(tx - nx * 0.0006 * side, ty - ny * 0.0006 * side, nx, ny, 1.4, 0.35), 6.8, 7.1, P.lit ? '#FFE3A0' : pole));
                lamps.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: unproj(tx - nx * 0.0012 * side, ty - ny * 0.0012 * side) } });
                continue;
              }
              if (trees > MAX_TREES || hash(key + side) < 0.25) continue;
              const r = 1.5 + hash(key + 's' + side) * 1.0, h = 4 + hs * 2.5;
              out.push(poly(ngon(tx, ty, 0.18, 4), 0, h * 0.45, trunk));
              out.push(poly(ngon(tx, ty, r, 7, hs), h * 0.4, h, leaf[Math.floor(hs * 97) % leaf.length]));
              out.push(poly(ngon(tx, ty, r * 0.6, 7, hs + 0.3), h, h + 0.8, leaf[Math.floor(hs * 53) % leaf.length]));
              trees++;
            }
          }
          run += L;
        }
      }
    }
    return lamps;
  }
  // 鏡頭附近車站的月台、雨棚與候車旅客（尖峰時段人多、深夜人少）
  let lastPf = '';
  function platforms() {
    const src = map.getSource('platforms'); if (!src) return;
    const z = map.getZoom(), c = map.getCenter(), [cx, cy] = proj(c.lat, c.lng);
    const near = z < FACADE_ZOOM ? [] : NODES.filter(n => Math.hypot(n.x - cx, n.y - cy) < 0.8);
    // 跟拍的列車在高架上時，車子前後也要有橋（站與站中間的高架段不在任何車站附近）
    const f = z < FACADE_ZOOM ? null : S.follow, fp = f && elevProfile(f) && tripPos(f, curMin());
    const key = near.map(n => n.id).join() + '|' + S.P.lit + '|' + TRIPS.length + '|' + (fp ? f.idx + ':' + Math.round(fp.km * 4) : '');
    if (key === lastPf) return; lastPf = key;
    const out = [], seen = new Set();
    for (const n of near) for (const [trip, idx] of stationReps(n)) stationFeatures(n, trip, idx, S.P, out, seen);
    if (fp) viaductFeatures(f, fp.km - 1, fp.km + 1, S.P, out, seen);
    src.setData({ type: 'FeatureCollection', features: out });
  }
  function build(force) {
    timer = 0;
    if (!map || !S.mapReady || !map.getSource('facade')) return;
    const src = map.getSource('facade');
    platforms();
    if (!S.buildings || Quality.low || map.getZoom() < FACADE_ZOOM) { if (last) { src.setData(EMPTY); last = null; } return; }
    const c = map.getCenter(), [cx, cy] = proj(c.lat, c.lng);
    let tiles = null; try { tiles = nearTiles(c, R); } catch {}
    // 只有附近的圖磚有變（新載入）或移動夠遠才重建；遠方圖磚載入不用重算
    const tkey = tiles ? tiles.map(t => t.tileID.canonical.key).sort().join() : '';
    if (last && Math.hypot(cx - last.x, cy - last.y) < R * 0.3 && last.lit === S.P.lit && (tiles ? tkey === last.tkey : !force)) return;
    let feats;
    try { feats = nearFeatures(tiles, 'building'); } catch { return; }
    const P = S.P, seen = new Set(), cand = [];
    for (const f of feats) {
      const h = +f.properties.render_height || 0, b0 = +f.properties.render_min_height || 0;
      if (h - b0 < 6 || f.properties.hide_3d) continue;
      const g = f.geometry, ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
      if (!ring || ring.length < 4 || ring.length > 80) continue;
      const pts = ring.map(([lon, lat]) => proj(lat, lon));
      const d = Math.hypot(pts[0][0] - cx, pts[0][1] - cy);
      if (d > R) continue;
      const key = Math.round(pts[0][0] * 1e5) + ',' + Math.round(pts[0][1] * 1e5) + ',' + h;
      if (seen.has(key)) continue; seen.add(key);
      cand.push({ pts, h, b0, d, key });
    }
    cand.sort((a, b) => a.d - b.d);
    const out = [], glass = P.lit ? '#1A2330' : mixHex(P.bld, '#24384E', 0.65), lit = '#FFC25A', warm = '#FF9E45';
    const rim = mixHex(P.bldEdge, '#FFFFFF', P.lit ? 0 : 0.3), band = mixHex(P.bld, P.land, 0.4);
    for (const B of cand) {
      if (out.length > MAX_FEAT) break;
      const outer = outset(B.pts, 0.0003), inner = outset(B.pts, 0.00008), shell = [outer, inner.slice().reverse()];
      const nF = Math.min(45, Math.floor((B.h - B.b0) / (FLOOR * 1000)));
      const seed = hash(B.key);
      // 一樓店面：較高的一整圈玻璃
      if (B.b0 === 0) out.push({ type: 'Feature', properties: { b: 0.4, t: 2.9, c: P.lit ? (seed < 0.6 ? warm : glass) : glass }, geometry: { type: 'Polygon', coordinates: shell } });
      for (let k = 1; k < nF; k++) {
        const z = B.b0 + k * FLOOR * 1000, on = P.lit && hash(B.key + k) < 0.32 + seed * 0.25;
        out.push({ type: 'Feature', properties: { b: z + 1.0, t: z + 2.3, c: on ? (hash(k + B.key) < 0.25 ? warm : lit) : glass }, geometry: { type: 'Polygon', coordinates: shell } });
        // 每隔幾層加一道樓板線，讓立面有分段
        if (k % 4 === 0) out.push({ type: 'Feature', properties: { b: z - 0.25, t: z + 0.15, c: band }, geometry: { type: 'Polygon', coordinates: shell } });
      }
      out.push({ type: 'Feature', properties: { b: B.h - 0.1, t: B.h + 0.7, c: rim }, geometry: { type: 'Polygon', coordinates: shell } });
    }
    roofs(cand, out, P);
    const lamps = streets(cx, cy, out, P, tiles);
    src.setData({ type: 'FeatureCollection', features: out });
    const ls = map.getSource('lamps'); if (ls) ls.setData({ type: 'FeatureCollection', features: lamps });
    last = { x: cx, y: cy, lit: P.lit, tkey };
  }
  return { soon(force) { if (!timer) timer = setTimeout(() => build(force), 350); } };
})();

/* ---------- 光線與天氣 ---------- */
function applyLook(force) {
  if (!map || !S.mapReady) return;
  const hour = lookHour(), wx = lookWx();
  const key = Math.round(hour * 30) + wx;
  if (key === S.lookKey && !force) return;
  S.lookKey = key;
  const P = S.P = paletteAt(hour, wx), W = WEATHER[wx];
  const set = (l, k, v) => { try { map.setPaintProperty(l, k, v); } catch {} };
  set('bg', 'background-color', P.sea); set('land', 'fill-color', P.land); set('wood', 'fill-color', P.wood);
  set('water', 'fill-color', P.water); set('bld-edge', 'line-color', P.bldEdge); set('county', 'line-color', P.edge); set('roads', 'line-color', P.road); set('buildings', 'fill-extrusion-opacity', P.bldOp);
  set('hills', 'hillshade-shadow-color', P.hsShadow); set('hills', 'hillshade-highlight-color', P.hsHigh); set('hills', 'hillshade-accent-color', P.hsAccent);
  for (const l of ['places', 'street-names', 'poi']) { set(l, 'text-color', P.label); set(l, 'text-halo-color', P.halo); }
  set('park', 'fill-color', P.wood); set('grass', 'fill-color', P.wood);
  // 高樓顏色亮一點、矮房暗一點，整片街區才有層次
  set('buildings', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 4, mixHex(P.bld, P.land, 0.25), 30, P.bld, 120, mixHex(P.bld, P.bldEdge, 0.35)]);
  set('lamp-glow', 'circle-opacity', P.lit ? 0.55 : 0);
  Facade.soon(true);
  set('rail', 'line-color', railColor(P)); set('rail-glow', 'line-color', railColor(P));
  set('rail-glow', 'line-opacity', ['interpolate', ['linear'], ['zoom'], 13, P.glow * 0.5, 16, 0]);
  set('train-halo', 'circle-opacity', P.glow + 0.15);
  try { map.setSky({ 'sky-color': P.sky, 'horizon-color': P.horizon, 'fog-color': P.fog, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.4 + W.fog, 'fog-ground-blend': P.fogBlend, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 0.6, 16, 0.3] }); } catch {}
  try { map.setLight({ anchor: 'map', color: P.light, intensity: P.lightI, position: [1.2, hour * 15 + 90, 50] }); } catch {}
  Precip.set(W.rain, P.lit, !!W.flash);
  const fog = $('#fogveil'); fog.style.background = `radial-gradient(ellipse at 50% 70%, transparent 10%, ${P.fog} 95%)`; fog.style.opacity = W.fog;
  Music.setRain(W.rain, !!W.flash);
  renderSkyPanel();
  pushTrains(true);
}
let wxBusy = false;
async function updateRealWeather(force) {
  if (wxBusy || S.wx !== 'auto' && !force) return;
  const pos = S.follow && tripPos(S.follow, curMin());
  const ll = pos ? unproj(pos.x, pos.y) : map ? map.getCenter().toArray() : TAIWAN.center;
  const moved = !S.realWxPos || Math.hypot((ll[0] - S.realWxPos[0]) * 102, (ll[1] - S.realWxPos[1]) * 111) > 25;
  if (!force && !moved && Date.now() - S.realWxAt < 10 * 60e3) return;
  wxBusy = true; S.realWxAt = Date.now(); S.realWxPos = ll;
  try { S.realWx = await RealWeather.at(ll[0], ll[1]); applyLook(); renderSkyPanel(); }
  catch (e) { console.warn('天氣資料載入失敗', e); }
  finally { wxBusy = false; }
}

/* ---------- 列車位置 ---------- */
function updatePositions() {
  const m = curMin();
  S.positions = [];
  for (const trip of TRIPS) { const pos = tripPos(trip, m); if (pos) S.positions.push({ trip, pos }); }
}
let lastCars = 0, lastDots = 0, bgLights = [];
function pushTrains(force) {
  if (!S.mapReady) return;
  const sel = S.follow, z = map.getZoom();
  const pts = [], cars = [];
  const doLights = z >= 10.5;
  const doCars = z >= CAR_ZOOM - 0.3 && (force || performance.now() - lastCars > 90);
  // 只處理畫面附近的列車；車廂模型再限制為離畫面中心最近的幾列，手機上特別省
  const b = map.getBounds(), mx = (b.getEast() - b.getWest()) * 0.15, my = (b.getNorth() - b.getSouth()) * 0.15;
  const W = b.getWest() - mx, E = b.getEast() + mx, Sb = b.getSouth() - my, N = b.getNorth() + my;
  const c = map.getCenter(), near = [];
  bgLights = [];
  // 跟拍列車附近（會車、並排）的列車改成每一格更新，才不會一頓一頓
  const fp = sel && tripPos(sel, curMin()), fll = fp && unproj(fp.x, fp.y);
  S.nearby = [];
  for (const { trip, pos } of S.positions) {
    const isSel = trip === sel;
    const ll = unproj(pos.x, pos.y);
    pts.push({ type: 'Feature', properties: { idx: trip.idx, color: trip.color, sel: isSel, g: sysGroup(trip.sys) }, geometry: { type: 'Point', coordinates: ll } });
    if (isSel || ll[0] < W || ll[0] > E || ll[1] < Sb || ll[1] > N) continue;
    if (fll && S.nearby.length < 6 && Math.abs(ll[0] - fll[0]) < 0.008 && Math.abs(ll[1] - fll[1]) < 0.007) { S.nearby.push(trip); continue; }
    near.push({ trip, pos, d: (ll[0] - c.lng) ** 2 + (ll[1] - c.lat) ** 2 });
  }
  near.sort((p, q) => p.d - q.d);
  // 沒在跟車時，近看畫面中央最近的幾列每一格更新（自由瀏覽時才不會一頓一頓）
  if (!sel && z >= CAR_ZOOM - 0.3) S.nearby = near.splice(0, liveTrains()).map(n => n.trip);
  if (doLights) for (const { trip, pos } of near) trainLights(trip, pos, bgLights);
  if (doCars) {
    lastCars = performance.now();
    const bg = near.slice(0, maxCarTrains());
    for (const { trip, pos } of bg) carFeatures(trip, pos, S.P, cars, false); // 窗格細節只畫在跟拍的列車上
    TrainGL.set('cars', cars); TrainGL.bg = bg.map(n => n.trip);
  } else if (z < CAR_ZOOM - 0.3 && lastCars) { TrainGL.set('cars', []); TrainGL.bg = []; lastCars = 0; }
  // 圓點圖層近看時不顯示，降低更新頻率
  if (force || z < CAR_ZOOM + 0.6 || performance.now() - lastDots > 1000) { map.getSource('trains').setData({ type: 'FeatureCollection', features: pts }); lastDots = performance.now(); }
  if (!doLights) bgLights = [];
  if (doLights || S.hadLights) pushLights();
  S.hadLights = doLights;
  pushFocus();
}
function pushLights() {
  const out = bgLights.slice();
  if (map.getZoom() >= 10.5) for (const t of [S.follow, ...(S.nearby || [])]) { const pos = t && tripPos(t, curMin()); if (pos) trainLights(t, pos, out); }
  map.getSource('lights').setData({ type: 'FeatureCollection', features: out });
}
function pushFocus() {
  if (!S.mapReady) return;
  const t = S.follow, m = curMin();
  // 跟拍的列車：每一格重算車身，當格畫出（車廂離得夠近才畫，遠看時是圓點）
  const zf = map.getZoom() >= CAR_ZOOM - 0.3, out = [];
  const pos = zf && t && tripPos(t, m);
  if (pos) carFeatures(t, pos, S.P, out, true);
  TrainGL.set('focus', out);
  // 跟拍列車附近（或自由瀏覽時畫面中央）的列車，每一格更新
  const near = [];
  if (zf) for (const n of S.nearby || []) { const np = tripPos(n, m); if (np) carFeatures(n, np, S.P, near, false); }
  TrainGL.set('near', near);
  // 畫面附近車站月台上的旅客：候車、上車、下車
  const ppl = [];
  if (map.getZoom() >= 16 && !Quality.low) { // 省電畫質不畫旅客，也不計算（切到省電時下面送一次空資料清掉）
    const now = performance.now();
    if (!S.pplSt || now - S.pplSt.at > 1000) { const c = map.getCenter(), [cx, cy] = proj(c.lat, c.lng); S.pplSt = { at: now, list: NODES.filter(n => Math.hypot(n.x - cx, n.y - cy) < 0.5).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)) }; }
    const cap = (COARSE ? 140 : 260) * 6;
    for (const n of S.pplSt.list) for (const [R, idx] of stationReps(n)) stationPeople(n, R, idx, m, ppl, cap);
  }
  TrainGL.set('people', ppl);
}
function pushFocusFrame() { pushFocus(); if (S.hadLights) pushLights(); }

/* ---------- 跟車鏡頭 ---------- */
let flightId = 0;
const ground = ll => { if (!terrainOn) return 0; try { return map.queryTerrainElevation(ll) || 0; } catch { return 0; } };
const viewName = () => (VIEWS.find(v => v.id === S.view) || VIEWS[0]).name;
// 依視角算出攝影機位置（from）與注視點（to），回傳 MapLibre 的鏡頭參數
function viewCamera(trip, pos, now, dt) {
  const L = liveryOf(trip), H = L.h * EX, len = trainLength(trip);
  const near = Math.min(len, 0.12);
  let from, to, fa, ta, anchor = 'to';
  switch (S.view) {
    case 'persp': {
      // 斜上方透視：看得到整列車與周圍街區
      to = trackPoint(trip, pos.km - Math.min(len * 0.45, 0.12)); ta = 0;
      from = offsetPt(to, -190 * M, 150 * M); fa = 190; break;
    }
    case 'side': {
      // 以車頭為主：從斜前方側面看車頭與前兩三節
      const head = trackPoint(trip, pos.km - 3 * M);
      from = offsetPt(head, 34 * M, 38 * M); fa = 7; to = head; ta = H * 0.5; break;
    }
    case 'orbit': {
      // 繞著車頭轉
      const head = trackPoint(trip, pos.km - 2 * M), a = now * 0.00011;
      from = { x: head.x + Math.cos(a) * 55 * M, y: head.y + Math.sin(a) * 55 * M }; fa = 24; to = head; ta = H * 0.5; break;
    }
    case 'trackside': {
      // 站在前方軌道旁等列車經過，過了再換下一個點
      if (!S.ts || S.ts.trip !== trip || pos.km - S.ts.km > len + 0.05 || S.ts.km - pos.km > 0.6) {
        const km = pos.km + 0.22, p = trackPoint(trip, km), side = (Math.random() < 0.5 ? -1 : 1) * 24 * M;
        S.ts = { trip, km, pt: offsetPt(p, 0, side) };
      }
      from = S.ts.pt; fa = 5; to = trackPoint(trip, pos.km - Math.min(len * 0.2, 0.03)); ta = H * 0.5; anchor = null; break;
    }
    case 'aerial': {
      to = trackPoint(trip, pos.km - near * 0.5); from = offsetPt(to, -110 * M, 0); fa = 340; ta = 0; break;
    }
    default: { // chase：從列車後上方往前看，車頭落在畫面中間
      to = trackPoint(trip, pos.km + 12 * M); ta = H * 0.5;
      from = offsetPt(trackPoint(trip, pos.km - Math.min(80 * M, len * 0.9 + 25 * M)), 0, 4 * M); fa = H + 24;
    }
  }
  // 讓攝影機相對注視點的位置平滑變化（彎道時鏡頭慢慢轉，不會跳）
  if (anchor) {
    const rel = { x: from.x - to.x, y: from.y - to.y, z: fa - ta };
    if (!S.rel) S.rel = rel;
    else { const k = 1 - Math.exp(-dt / 450); for (const c of ['x', 'y', 'z']) S.rel[c] += (rel[c] - S.rel[c]) * k; }
    if (anchor === 'to') { from = { x: to.x + S.rel.x, y: to.y + S.rel.y }; fa = ta + S.rel.z; }
    else { to = { x: from.x - S.rel.x, y: from.y - S.rel.y }; ta = fa - S.rel.z; }
  }
  const fl = unproj(from.x, from.y), tl = unproj(to.x, to.y);
  // 地形圖磚換解析度時高度會跳一下，鏡頭的地面高度也做平滑
  const gf = ground(fl), gt = ground(tl);
  if (!S.gnd || dt > 900) S.gnd = { f: gf, t: gt };
  else { const k = 1 - Math.exp(-dt / 350); S.gnd.f += (gf - S.gnd.f) * k; S.gnd.t += (gt - S.gnd.t) * k; }
  // 高架段：MapLibre 的注視點只能在地面上，所以鏡頭升高後，把視線延長到碰到地面的那一點當作注視點，
  // 視線仍然穿過高架上的列車
  const el = elevAt(trip, pos.km);
  if (el > 0.01) {
    const dh = Math.hypot(to.x - from.x, to.y - from.y) * 1000, drop = Math.max(fa - ta, dh * 0.27, 1), k = (drop + el) / drop;
    const tl2 = unproj(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    return camFromTo(fl, drop + el + S.gnd.f, tl2, S.gnd.t);
  }
  return camFromTo(fl, fa + S.gnd.f, tl, ta + S.gnd.t);
}
/* 由攝影機位置與注視點（經緯度＋高度公尺）換算 MapLibre 的 center/zoom/pitch/bearing */
function camFromTo(fl, fa, tl, ta, maxPitch) {
  const lat = tl[1] * Math.PI / 180, mx = 111320 * Math.cos(lat), my = 110570;
  const dx = (tl[0] - fl[0]) * mx, dy = (tl[1] - fl[1]) * my, dz = fa - ta;
  const dh = Math.hypot(dx, dy), D = Math.max(8, Math.hypot(dh, dz));
  const fov = (map.transform && map.transform.fov) || 36.87;
  const ctcd = 0.5 / Math.tan(fov / 2 * Math.PI / 180) * map.getCanvas().clientHeight;
  return {
    center: { lng: tl[0], lat: tl[1] },
    bearing: dh > 0.5 ? Math.atan2(dx, dy) * DEG : map.getBearing(),
    pitch: Math.min(maxPitch || (COARSE ? 76 : 80), Math.atan2(dh, Math.max(0.5, dz)) * DEG), // 壓低最大俯仰角，遠方少載入很多圖磚
    zoom: Math.min(21, Math.log2(40075016.686 * Math.cos(lat) * ctcd / (512 * D))),
  };
}
function follow(trip, { fly = true } = {}) {
  const changed = trip !== S.follow;
  S.follow = trip; S.followPaused = false; S.rel = null; S.ts = null; S.gnd = null;
  closePicker();
  if (changed && S.wx === 'auto') S.realWxAt = 0;
  startCamera(fly);
  pushTrains(true); renderCaption(true); renderViewBtn();
}
function startCamera(fly) {
  const trip = S.follow; if (!trip || !map) return;
  syncTerrain();
  const pos = tripPos(trip, curMin()); if (!pos) return;
  const c = map.getCenter(), [lon, lat] = unproj(pos.x, pos.y);
  const far = map.getZoom() < 12 || Math.hypot((c.lng - lon) * 102, (c.lat - lat) * 111) > 4;
  map.stop();
  if (fly && far) {
    // 遠距離先用 flyTo 飛過去（目標是列車 3.5 秒後的位置），抵達後再接上即時跟拍
    const id = ++flightId, dur = 3500;
    const ahead = tripPos(trip, curMin() + dur * S.speed / 60000 * (S.playing ? 1 : 0)) || pos;
    S.flying = true; S.trans = null;
    const target = viewCamera(trip, ahead, performance.now(), 1e6);
    S.rel = null;
    map.once('moveend', () => { if (id === flightId) { S.flying = false; blendCamera(900); } });
    map.flyTo({ ...target, duration: dur, curve: 1.5, essential: true });
  } else {
    ++flightId; S.flying = false; blendCamera(1600);
  }
}
function blendCamera(dur) {
  S.trans = { c: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), t0: performance.now(), dur };
}
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function unfollow() { S.follow = null; S.followPaused = false; S.flying = false; S.trans = null; pushTrains(true); renderCaption(); renderViewBtn(); }
function stepCamera(now, dt) {
  if (!S.follow || S.flying || !map || !S.mapReady) return;
  S.camT = curMin();
  const pos = tripPos(S.follow, S.camT);
  if (!pos) return;
  if (S.followPaused) {
    // 自由視角：使用者自己控制角度與遠近，畫面只跟著列車平移，車子不會跑出畫面
    const ll = unproj(pos.x, pos.y), prev = S.freeLast; S.freeLast = ll;
    if (prev && !S.touching && !map.isMoving()) {
      const c = map.getCenter(), cam = { center: [c.lng + ll[0] - prev[0], c.lat + ll[1] - prev[1]] };
      // 傾斜按鈕：每一格往目標俯仰角靠近一點，跟平移一起做，車子不會在動畫中跑掉
      if (S.tiltTo != null) { const p0 = map.getPitch(); cam.pitch = p0 + (S.tiltTo - p0) * (1 - Math.exp(-dt / 110)); if (Math.abs(S.tiltTo - cam.pitch) < 0.2) { cam.pitch = S.tiltTo; S.tiltTo = null; } }
      map.jumpTo(cam);
    }
    return;
  }
  const cam = viewCamera(S.follow, pos, now, dt);
  if (S.trans) {
    const T = S.trans, k = ease(Math.min(1, (now - T.t0) / T.dur));
    cam.center = [T.c.lng + (cam.center.lng - T.c.lng) * k, T.c.lat + (cam.center.lat - T.c.lat) * k];
    cam.zoom = T.zoom + (cam.zoom - T.zoom) * k;
    cam.pitch = T.pitch + (cam.pitch - T.pitch) * k;
    cam.bearing = T.bearing + angDiff(T.bearing, cam.bearing) * k;
    if (k >= 1) S.trans = null;
  }
  map.jumpTo(cam);
}
function unlockView() {
  if (!S.follow) return;
  if (S.flying) {
    // 飛行途中被手指打斷：直接落到列車旁邊再交給使用者，不要停在半空中看不到車
    map.stop(); S.flying = false; ++flightId;
    const pos = tripPos(S.follow, curMin());
    if (pos) { S.rel = null; try { map.jumpTo(viewCamera(S.follow, pos, performance.now(), 1e6)); } catch {} }
  }
  S.followPaused = true; S.trans = null; S.freeLast = null; S.tiltTo = null;
  renderCaption(true); renderViewBtn();
}
function setView(id) {
  S.view = id; store.set('view2', id); S.rel = null; S.ts = null;
  if (S.follow) { S.followPaused = false; startCamera(false); }
  renderViewBtn(); renderCaption(true);
}
function cycleView() { if (S.follow && S.followPaused) return setView(S.view); /* 自由視角時先鎖回原視角 */ const i = VIEWS.findIndex(v => v.id === S.view); setView(VIEWS[(i + 1) % VIEWS.length].id); }
// 自由視角時右側的傾斜按鈕（手機上也可以兩指上下滑動，電腦可按住右鍵拖曳）
function tilt(d) { if (!S.follow || !S.followPaused) return; const base = S.tiltTo != null ? S.tiltTo : map.getPitch(); S.tiltTo = Math.max(0, Math.min(COARSE ? 76 : 80, base + d)); }
$('#tiltup').addEventListener('click', () => tilt(-12));
$('#tiltdown').addEventListener('click', () => tilt(12));
function renderViewBtn() {
  document.body.classList.toggle('free', !!(S.follow && S.followPaused));
  const b = $('#viewbtn'); b.textContent = S.follow && S.followPaused ? '◉ 回到' + viewName() : '視角・' + viewName(); b.disabled = !S.follow;
}

/* 漫遊：每隔一段時間換一列車（偶爾換成機場起降的飛機），偏好行駛中、不同系統的列車，並換個視角 */
const ROAM_SEC = 60;
function pickRoamTrip() {
  const pool = S.positions.filter(p => !p.pos.atStation && p.trip !== S.follow);
  if (!pool.length) return null;
  const lastG = S.follow ? sysGroup(S.follow.sys) : null;
  const weight = p => (p.trip.sys === 'TRA' ? (p.trip.type === '區間' ? 2 : 5) : p.trip.sys === 'THSR' ? 4 : 2) * (sysGroup(p.trip.sys) === lastG ? 0.4 : 1);
  const total = pool.reduce((a, p) => a + weight(p), 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= weight(p); if (r <= 0) return p.trip; }
  return pool[0].trip;
}
// 漫遊也會去機場看飛機起降：大約每四次換一次飛機，剛看完飛機就換回列車
function pickRoamFlight() {
  if (typeof AIR === 'undefined' || !AIR.on || AIR.watch || !S.mapReady || Math.random() > 0.28) return null;
  const m = curMin(), c = [];
  for (const ap of WATCH_APS) { const f = pickWatchFlight(ap, m); if (f) c.push(f); }
  return c.length ? c[Math.floor(Math.random() * c.length)] : null;
}
function roamNext() {
  const f = pickRoamFlight();
  // 看飛機會先關掉漫遊，這裡要讓漫遊繼續計時
  if (f) { S.roamKeep = true; try { watchFlight(f); } finally { S.roamKeep = false; } return; }
  const t = pickRoamTrip(); if (!t) return;
  const views = VIEWS.map(v => v.id).filter(v => v !== S.view);
  S.view = views[Math.floor(Math.random() * views.length)];
  follow(t);
}
function setRoam(on) {
  if (!on && S.roamKeep) return;
  S.roam = on; const rb = $('#roambtn'); rb.setAttribute('aria-pressed', String(on)); rb.textContent = on ? '換下一個 ›' : '漫遊';
  rb.title = on ? '漫遊中：按一下換下一列車或飛機' : '每隔一段時間自動換一列車，偶爾去機場看飛機起降';
  if (on) { S.roamAt = performance.now() + ROAM_SEC * 1000; if (!S.follow || S.followPaused) roamNext(); }
}

/* ---------- 字卡 ---------- */
const cap = $('#caption');
function nextStopIdx(trip, m) {
  for (let i = 0; i < trip.nodes.length; i++) if (trip.times[i].stop && effTime(trip, i, 'dep') >= m) return i;
  return -1;
}
// 跨午夜的班次以前一營運日的分鐘數計
function tripMinute(trip) {
  const m = curMin();
  return m < 240 && !tripPosAt(trip, m) && tripPosAt(trip, m + 1440) ? m + 1440 : m;
}
function trainTitle(t) {
  if (t.sys === 'THSR') return `高鐵 ${t.no} 次`;
  if (t.no) return `${t.type} ${t.no} 次`;
  return t.type;
}
let capKey = '', capTimer = 0;
function renderCaption(force) {
  const t = S.follow;
  if (!t) { cap.classList.add('fade'); clearTimeout(capTimer); capTimer = setTimeout(() => { if (!S.follow) cap.hidden = true; }, 600); capKey = ''; return; }
  clearTimeout(capTimer);
  if (cap.hidden) { cap.hidden = false; requestAnimationFrame(() => cap.classList.remove('fade')); } else cap.classList.remove('fade');
  const m = tripMinute(t), pos = tripPos(t, curMin());
  const ni = nextStopIdx(t, m);
  const stops = t.times.filter(x => x.stop).length;
  const done = t.times.filter((x, i) => x.stop && effTime(t, i, 'dep') < m).length;
  let next = '', eta = '';
  if (!pos) next = effTime(t, 0, 'dep') > m ? '尚未發車' : '已抵達終點';
  else if (ni >= 0) {
    const at = pos.atStation && pos.seg === ni;
    next = (at ? '停靠 ' : '') + t.nodes[ni].name;
    const mins = Math.max(0, Math.round(effTime(t, ni, at ? 'dep' : 'arr') - m));
    eta = at ? (mins ? `${mins} 分後開車` : '即將開車') : (mins ? `${mins} 分後到站` : '即將到站');
  }
  const total = t.cum[t.cum.length - 1] || 1;
  const progress = pos ? Math.min(1, pos.km / total) : (next === '已抵達終點' ? 1 : 0);
  const delay = t.sys === 'TRA' ? (t.delay ? `<span class="late">晚 ${t.delay} 分</span>` : '<span class="ok">準點</span>') : '';
  const speed = pos && !pos.atStation ? Math.round((t.cum[pos.seg + 1] - t.cum[pos.seg]) / Math.max(0.1, effTime(t, pos.seg + 1, 'arr') - effTime(t, pos.seg, 'dep')) * 60) : 0;
  const key = [t.idx, next, eta, Math.round(progress * 200), S.followPaused, speed, t.delay].join('|');
  if (key === capKey && !force) return;
  capKey = key;
  cap.classList.toggle('mini', !S.capOpen);
  cap.setAttribute('role', 'button'); cap.tabIndex = 0; cap.setAttribute('aria-expanded', String(!!S.capOpen)); cap.setAttribute('aria-label', '列車資訊，按下可' + (S.capOpen ? '收起' : '展開'));
  cap.innerHTML = `
    <div class="strip"><span class="dot" style="background:${t.color};color:${t.color}"></span><b class="nm">${esc(trainTitle(t))}</b><span class="nx">${esc(next)}</span><span class="eta">${esc(eta.replace('分後到站', '分').replace('分後開車', '分開車'))}</span><button class="x" id="leave" aria-label="離開"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="kicker"><span class="dot" style="background:${t.color};color:${t.color}"></span>${esc(SYSTEMS[t.sys].name)}${t.car ? ' · ' + esc(t.car) : ''}${delay ? ' · ' + delay : ''}</div>
    <h2>${esc(trainTitle(t))}</h2>
    <div class="route">${esc(t.origin)} → ${esc(t.dest)}</div>
    <div class="next"><div><div class="lab">${pos && pos.atStation ? '此刻' : '下一站'}</div><b>${esc(next)}</b></div><span class="eta">${esc(eta)}</span></div>
    <div class="bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div>
    <div class="meta"><span>已過 ${done} / ${stops} 站</span><span>${speed ? '約 ' + speed + ' km/h' : ''}</span></div>
    <div class="caprow"><button class="pillbtn small" id="leave2">離開</button></div>`;
}
// 字卡預設是一條細長的列，點一下展開完整資訊，再點一下收起
cap.addEventListener('click', e => {
  const lv = e.target.closest && e.target.closest('#leave, #leave2'); if (lv) { setRoam(false); unfollow(); return; }
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderCaption(true);
});
cap.addEventListener('keydown', e => {
  if (e.target !== cap || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); e.stopPropagation(); // 空白鍵不要再觸發全域的播放／暫停
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderCaption(true);
});

/* ---------- 選車 ---------- */
const picker = $('#picker'), scrim = $('#scrim'), pq = $('#pq'), plist = $('#plist'), settings = $('#settings');
const TYPE_ORDER = { '普悠瑪': 0, '太魯閣': 1, '自強': 2, '莒光': 3, '區間快': 4, '區間': 5 };
function openPicker() { settings.hidden = true; sky.hidden = true; musicPanel.hidden = true; picker.hidden = false; scrim.hidden = false; renderPicker(); setTimeout(() => pq.focus({ preventScroll: true }), 50); }
function closePicker() { picker.hidden = true; scrim.hidden = true; }
function renderPicker() {
  if (S.pickGroup === 'air' && typeof renderAirPick === 'function') return renderAirPick(); // 飛機分頁在 air.js
  const q = normName(pq.value.trim());
  let rows = S.positions.filter(p => S.pickGroup === 'all' || sysGroup(p.trip.sys) === S.pickGroup);
  if (q) {
    const qn = q.replace(/^0+/, '');
    rows = rows.filter(({ trip: t }) => (t.no && (t.no.replace(/^0+/, '') === qn || t.no.startsWith(q))) || t.type.includes(q)
      || (t.car && t.car.toUpperCase().includes(q.toUpperCase())) || t.dest.includes(q) || t.origin.includes(q)
      || t.nodes.some((n, i) => t.times[i].stop && n.name === q) || (q === '高鐵' && t.sys === 'THSR'));
  }
  const grp = t => t.sys === 'TRA' ? 0 : t.sys === 'THSR' ? 1 : 2;
  rows.sort((a, b) => grp(a.trip) - grp(b.trip) || (TYPE_ORDER[a.trip.type] ?? 9) - (TYPE_ORDER[b.trip.type] ?? 9)
    || (+a.trip.no || 0) - (+b.trip.no || 0) || a.trip.type.localeCompare(b.trip.type));
  const shown = rows.slice(0, 160);
  plist.innerHTML = shown.length ? shown.map(({ trip: t, pos }) => {
    const ni = nextStopIdx(t, tripMinute(t));
    const where = ni >= 0 ? (pos.atStation && pos.seg === ni ? '停靠 ' : '往 ') + t.nodes[ni].name : '';
    return `<button data-i="${t.idx}"><span class="c" style="background:${t.color}"></span><span class="n">${esc(trainTitle(t))}</span><span class="d">${esc(t.origin)} → ${esc(t.dest)}</span><span class="s">${esc(where)}</span></button>`;
  }).join('') + (rows.length > shown.length ? `<div class="empty">另有 ${rows.length - shown.length} 列，請用搜尋縮小範圍</div>` : '')
    : `<div class="empty">${q ? '目前沒有符合的行駛中列車' : '這個時間沒有行駛中的列車'}</div>`;
}
$('#pickbtn').addEventListener('click', openPicker);
$('#pclose').addEventListener('click', closePicker);
scrim.addEventListener('click', closePicker);
pq.addEventListener('input', renderPicker);
pq.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = plist.querySelector('button[data-i]'); if (b) b.click(); } if (e.key === 'Escape') closePicker(); e.stopPropagation(); });
$('#ptabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.pickGroup = b.dataset.g;
  document.querySelectorAll('#ptabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderPicker();
});
plist.addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  setRoam(false); follow(TRIPS[+b.dataset.i]);
});

/* ---------- 點地圖 ---------- */
let popup = null;
function onMapClick(e) {
  const box = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
  const hit = map.queryRenderedFeatures(box, { layers: ['train', 'train-halo', 'st-dot'] });
  const tr = hit.find(f => f.layer.id !== 'st-dot'), t = tr ? TRIPS[tr.properties.idx] : TrainGL.pick(e.point);
  if (t) { if (t !== S.follow || S.followPaused) { setRoam(false); follow(t); } return; }
  const st = hit.find(f => f.layer.id === 'st-dot');
  if (st) showStation(NODES[st.properties.id]);
}
function showStation(n) {
  const m = curMin(), rows = [];
  for (const [trip, i] of (NODE_TRIPS.get(n.id) || [])) {
    if (i === trip.nodes.length - 1) continue;
    for (const off of [0, 1440]) {
      const dep = effTime(trip, i, 'dep') - off;
      if (dep >= m - 0.5 && dep <= m + 120) rows.push({ trip, dep, sched: trip.times[i].dep - off });
    }
  }
  rows.sort((a, b) => a.dep - b.dep);
  const html = `<div class="pop"><h5>${esc(n.sys === 'THSR' ? '高鐵' + n.name + '站' : n.name)}</h5><div class="sys">${esc(SYSTEMS[n.sys].name)} · ${esc([...n.lines].join('、'))}</div>
    ${rows.slice(0, 6).map(r => { const cd = Math.round(r.dep - m); return `<button data-i="${r.trip.idx}"><span class="c" style="background:${r.trip.color}"></span><span class="t">${fmtHM(r.sched)}</span><span>${esc(r.trip.no ? (r.trip.sys === 'THSR' ? '高鐵 ' : r.trip.type + ' ') + r.trip.no : r.trip.type)} 往${esc(r.trip.dest)}</span><span class="cd">${cd > 0 ? cd + ' 分' : '進站'}</span></button>`; }).join('') || '<div class="sys">接下來 2 小時沒有班次</div>'}</div>`;
  if (popup) popup.remove();
  popup = new maplibregl.Popup({ offset: 12, maxWidth: '300px' }).setLngLat([n.lon, n.lat]).setHTML(html).addTo(map);
  popup.getElement().addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const t = TRIPS[+b.dataset.i]; popup.remove();
    if (tripPos(t, curMin())) { setRoam(false); follow(t); }
  });
}

/* ---------- 時間 ---------- */
// 只顯示現在的時間：不提供倒轉或加速
function renderClock() {
  const d = new Date(S.simMs + TW);
  $('#clock').textContent = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(x => String(x).padStart(2, '0')).join(':');
}

/* ---------- 工具列 ---------- */
// 漫遊中再按一下就直接換下一列車；按「離開」或自己選車才會停止漫遊
$('#roambtn').addEventListener('click', () => { if (S.roam) { S.roamAt = performance.now() + ROAM_SEC * 1000; roamNext(); } else setRoam(true); });
// 漫遊時正在看飛機：按飛機字卡的「離開」或 Esc 也一併停止漫遊
window.addEventListener('click', e => { if (S.roam && e.target.closest && e.target.closest('#airexit, #airexit2')) setRoam(false); }, true);
window.addEventListener('keydown', e => { if (S.roam && e.key === 'Escape' && typeof AIR !== 'undefined' && AIR.watch && !e.target.matches('input, textarea')) setRoam(false); }, true);
$('#overview').addEventListener('click', () => { setRoam(false); unfollow(); if (map) map.flyTo({ ...TAIWAN, duration: 2500 }); });
// 隱藏介面：手機瀏覽器多半不支援全螢幕 API，改成把畫面上的按鈕全部收起來；支援的瀏覽器順便進入全螢幕
function toggleClean(on = !document.body.classList.contains('clean')) {
  document.body.classList.toggle('clean', on); $('#cleanbtn').setAttribute('aria-pressed', String(on));
  // 地圖上的文字（站名、地名、路名、店家）也一起收起來
  if (map && S.mapReady) for (const l of map.getStyle().layers) if (l.type === 'symbol') map.setLayoutProperty(l.id, 'visibility', on || (l.id === 'st-label' && !S.labels) ? 'none' : 'visible');
  try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch {}
}
$('#cleanbtn').addEventListener('click', () => toggleClean(true));
$('#unclean').addEventListener('click', () => toggleClean(false));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('clean')) toggleClean(false); });
const musicBtn = $('#musicbtn'), musicPanel = $('#music');
function setMusic(on) {
  if (on) Music.start().catch(() => {}); else Music.stop();
  store.set('music', on);
}
/* 音樂面板：曲目清單、播放／暫停、上下首、可拖曳的進度條 */
const PLAY_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>';
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
let seeking = false;
function renderMusic() {
  const T = Music.tracks[Music.index];
  musicBtn.setAttribute('aria-pressed', String(Music.playing));
  $('#ambbtn').setAttribute('aria-pressed', String(Music.ambient));
  if (musicPanel.hidden) return;
  $('#mtitle').textContent = T.title; $('#mmood').textContent = T.mood; $('#mdur').textContent = mmss(T.dur);
  const pb = $('#mplay'); pb.innerHTML = Music.playing ? PAUSE_SVG : PLAY_SVG; pb.setAttribute('aria-label', Music.playing ? '暫停' : '播放');
  $('#mlist').innerHTML = Music.tracks.map((t, i) => `<button data-i="${i}" aria-current="${i === Music.index}"><span class="n">${i === Music.index && Music.playing ? '♪' : i + 1}</span><span class="t">${esc(t.title)}</span><span class="m">${esc(t.mood)}</span><span class="d">${mmss(t.dur)}</span></button>`).join('');
  renderMusicPos();
}
function renderMusicPos() {
  if (musicPanel.hidden || seeking) return;
  const T = Music.tracks[Music.index], pos = Music.position();
  $('#mseek').value = String(Math.round(pos / T.dur * 1000)); $('#mcur').textContent = mmss(pos);
}
Music.onChange(renderMusic);
Precip.onFlash = () => Music.thunder();
$('#ambbtn').addEventListener('click', () => Music.setAmbient(!Music.ambient));
document.addEventListener('pointerdown', () => Music.unlock(), { once: true, capture: true });
setInterval(renderMusicPos, 500);
musicBtn.addEventListener('click', () => {
  musicPanel.hidden = !musicPanel.hidden;
  if (!musicPanel.hidden) { settings.hidden = true; sky.hidden = true; closePicker(); renderMusic(); }
});
$('#mplay').addEventListener('click', () => setMusic(!Music.playing));
$('#mprev').addEventListener('click', () => { Music.prev(); store.set('music', true); });
$('#mnext').addEventListener('click', () => { Music.next(); store.set('music', true); });
$('#mlist').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  const i = +b.dataset.i;
  if (i === Music.index && Music.playing) return;
  Music.play(i, i === Music.index ? Music.position() : 0); store.set('music', true);
});
const mseek = $('#mseek');
mseek.addEventListener('input', () => { seeking = true; $('#mcur').textContent = mmss(mseek.value / 1000 * Music.tracks[Music.index].dur); });
mseek.addEventListener('change', () => { seeking = false; Music.seek(mseek.value / 1000 * Music.tracks[Music.index].dur); });
$('#setbtn').addEventListener('click', () => {
  settings.hidden = !settings.hidden;
  if (!settings.hidden) { closePicker(); sky.hidden = true; musicPanel.hidden = true; const c = store.get('tdx', {}); $('#tdxid').value = c.id || ''; $('#tdxsecret').value = c.secret || ''; }
});
function toggleBtn(id, key, apply) {
  const b = $(id); b.setAttribute('aria-pressed', String(S[key]));
  b.addEventListener('click', () => { S[key] = !S[key]; store.set(key, S[key]); b.setAttribute('aria-pressed', String(S[key])); if (S.mapReady) apply(S[key]); });
}
toggleBtn('#terrainbtn', 'terrain', () => syncTerrain(true));
$('#qualityrow').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) setQuality(b.dataset.v); });
renderQualityBtns();
toggleBtn('#buildbtn', 'buildings', on => { for (const l of ['buildings', 'facade', 'lamp-glow']) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'); });
toggleBtn('#labelbtn', 'labels', on => map.setLayoutProperty('st-label', 'visibility', on ? 'visible' : 'none'));

$('#viewbtn').addEventListener('click', cycleView);

/* ---------- 光線與天氣面板 ---------- */
const sky = $('#sky');
$('#skybtn').addEventListener('click', () => { sky.hidden = !sky.hidden; if (!sky.hidden) { settings.hidden = true; musicPanel.hidden = true; closePicker(); renderSkyPanel(); } });
$('#todrow').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  S.tod = b.dataset.v; store.set('tod', S.tod); applyLook(true);
});
$('#wxrow').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  S.wx = b.dataset.v; store.set('wx', S.wx);
  if (S.wx === 'auto') updateRealWeather(true);
  applyLook(true);
});
// 天氣圖示用內嵌 SVG：手機上部分天氣 emoji（如霧）會顯示成方塊
const WX_SVG = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CLOUD = '<path d="M7 17h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 10 3.5 3.5 0 0 0 7 17z"/>';
const WX_ICON = {
  clear: WX_SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  cloudy: WX_SVG(CLOUD.replace('17h', '18h').replace('0 0 7 17z', '0 0 7 18z')),
  rain: WX_SVG('<path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 7 3.5 3.5 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  storm: WX_SVG('<path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 7 3.5 3.5 0 0 0 7 14z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>'),
  fog: WX_SVG('<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>'),
};
function renderSkyPanel() {
  document.querySelectorAll('#todrow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.tod)));
  document.querySelectorAll('#wxrow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.wx)));
  const W = WEATHER[lookWx()];
  $('#skybtn').innerHTML = WX_ICON[lookWx()] || WX_ICON.clear;
  const r = S.realWx;
  $('#wxnote').textContent = r ? `所在位置即時天氣：${WEATHER[r.wx].name} ${r.temp}°C（Open-Meteo，每 10 分鐘更新）` : '即時天氣讀取中，或目前無法取得（先顯示晴天）。';
}

/* ---------- TDX ---------- */
const tdxStatus = msg => { $('#tdxstatus').innerHTML = msg; };
let delayTimer = null, tdxGen = 0;
const twDate = ms => new Date(ms + TW).toISOString().slice(0, 10);
function afterTripsChanged() {
  // 班次重建後 TRIPS 內的物件已換新，跟車對象要找回同一車次
  if (S.follow) {
    const f = S.follow;
    let same = TRIPS.includes(f) ? f : TRIPS.find(t => t.sys === f.sys && t.no && t.no === f.no && t.origin === f.origin);
    // 捷運沒有車次號：改找同一路線、同方向、此刻離原本位置最近的一班，鏡頭才不會被丟回全台
    if (!same && !f.no) {
      const m = curMin(), p0 = tripPos(f, m);
      if (p0) {
        let bd = 2;
        for (const t of TRIPS) {
          if (t.sys !== f.sys || t.dest !== f.dest) continue;
          const p = tripPos(t, m); if (!p) continue;
          const dd = Math.hypot(p.x - p0.x, p.y - p0.y);
          if (dd < bd) { bd = dd; same = t; }
        }
      }
    }
    if (same) S.follow = same; else unfollow();
  }
  updatePositions(); pushTrains(); renderClock(); renderCaption(true);
}
async function connectTDX(cred, quiet) {
  const gen = ++tdxGen, isCurrent = () => gen === tdxGen;
  clearInterval(delayTimer);
  tdxStatus('連線中…');
  try {
    // 時刻表先排進 TDX 佇列，捷運資料緊接著排（以前要等時刻表、誤點都讀完才開始讀捷運）
    const ttP = TDX.loadTimetables(cred);
    const delayP = TDX.get('v2/Rail/TRA/LiveTrainDelay', cred, 4); delayP.catch(() => {});
    const metroP = TDX.loadMetro(cred).catch(e => { console.warn(e); return null; });
    const trips = await ttP;
    if (!isCurrent()) return;
    TDX.applyTimetables(trips);
    TDX.ok = true; TDX.date = twDate(Date.now());
    perfMark('台鐵高鐵當日時刻表套用');
    afterTripsChanged(); // 官方時刻表一到就換上，不等捷運
    tdxStatus(`已載入 ${trips.length} 班台鐵與高鐵當日時刻，正在讀即時誤點與捷運資料…`);
    let d = 0; try { d = await TDX.loadDelays(cred, isCurrent, delayP); } catch {}
    if (!isCurrent()) return;
    perfMark('台鐵即時誤點套用');
    const metro = await metroP;
    if (!isCurrent()) return;
    if (metro && metro.trips.length) TDX.applyMetro(metro);
    perfMark('捷運官方資料套用');
    const ml = metro ? metro.covered.size : 0;
    tdxStatus(`已載入 ${trips.length} 班台鐵與高鐵當日時刻，${d} 列台鐵即時誤點` + (ml ? `；${ml} 條捷運／輕軌改用官方行駛時間與班距（${metro.trips.length} 班）。` : metro && metro.trips.length ? `；捷運依官方資料加開 ${metro.trips.length} 班區間車，全線仍用班表推估。` : '；捷運與輕軌沿用班表推估。'));
    delayTimer = setInterval(() => {
      if (document.hidden) return; // 分頁在背景時不讀誤點，回到前景立刻補讀（見下方 visibilitychange）
      const now = Date.now();
      if (twDate(now) !== TDX.date && minOfDay(now) >= 240) { connectTDX(cred, true); return; }
      delayAt = now; TDX.loadDelays(cred, isCurrent).catch(() => {});
    }, 60000);
    afterTripsChanged();
  } catch (err) {
    if (!isCurrent()) return;
    TDX.ok = false;
    tdxStatus(err instanceof TypeError ? '無法連到 TDX，請確認網路連線。目前繼續使用班表推估。' : esc(err.message) + '。請確認金鑰正確；目前繼續使用班表推估。');
    if (!quiet) console.warn(err);
  }
}
// 回到前景：誤點超過一分鐘沒更新就馬上讀，跨日就重新載入當日時刻
let delayAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !TDX.ok) return;
  const cred = store.get('tdx', {}); if (!cred.id || !cred.secret) return;
  const now = Date.now();
  if (twDate(now) !== TDX.date && minOfDay(now) >= 240) connectTDX(cred, true);
  else if (now - delayAt > 60e3) { delayAt = now; const g = tdxGen; TDX.loadDelays(cred, () => g === tdxGen).catch(() => {}); }
});
$('#tdxgo').addEventListener('click', () => {
  const cred = { id: $('#tdxid').value.trim(), secret: $('#tdxsecret').value.trim() };
  if (!cred.id || !cred.secret) { tdxStatus('請填入 Client ID 與 Client Secret。'); return; }
  store.set('tdx', cred); connectTDX(cred);
});
$('#tdxclear').addEventListener('click', () => {
  tdxGen++; store.set('tdx', {}); TDX.ok = false; clearInterval(delayTimer);
  generateAll(); afterTripsChanged(); tdxStatus('已改回班表推估。');
});

/* ---------- 開場 ---------- */
function closeIntro(then) {
  const intro = $('#intro');
  intro.classList.add('out');
  S.started = true; syncTerrain(true); // 開場畫面後面只畫平面，按下開始才開 3D 地形
  setTimeout(() => { intro.hidden = true; }, 1300);
  if (store.get('music', true)) setMusic(true);
  then();
}
// 班次與軌道載入完成前先停用開場按鈕，避免漫遊或選車時還沒有列車
const startBtns = [$('#startroam'), $('#startpick')];
startBtns.forEach(b => { b.disabled = true; });
$('#startroam').addEventListener('click', () => closeIntro(() => setRoam(true)));
$('#startpick').addEventListener('click', () => closeIntro(openPicker));

/* ---------- 鍵盤 ---------- */
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea') || !$('#intro').hidden && !$('#intro').classList.contains('out')) return;
  if (e.key === 'r' || e.key === 'R') setRoam(!S.roam);
  else if (e.key === 'm' || e.key === 'M') setMusic(!Music.playing);
  else if ((e.key === 'v' || e.key === 'V') && S.follow) cycleView();
  else if (e.key === 'f' || e.key === 'F') toggleClean();
  else if (e.key === 'Escape' && document.body.classList.contains('clean')) toggleClean(false);
  else if (e.key === 'Escape') { if (!picker.hidden) closePicker(); else if (!settings.hidden) settings.hidden = true; else if (!sky.hidden) sky.hidden = true; else if (!musicPanel.hidden) musicPanel.hidden = true; else { setRoam(false); unfollow(); } }
});

/* ---------- 主迴圈 ---------- */
let last = performance.now(), lastPush = 0, lastUi = 0;
function frame(now) {
  // 先排下一格：要排在地圖自己的重繪之前，下一格才會先輪到這裡
  requestAnimationFrame(frame);
  if (!paceOk(now)) return; // 畫質限幀：這一格跳過
  const dt = Math.min(1000, now - last); last = now;
  if (S.playing) { if (S.live && S.speed === 1) S.simMs = Date.now(); else S.simMs += dt * S.speed; }
  // 拉遠時列車一秒只移動不到一個像素：每 0.1 秒重送一次列車資料，整張地圖就得一直重畫，手機很吃力。
  // 依縮放放慢更新頻率；跟車時維持每 0.1 秒
  const zNow = S.mapReady ? map.getZoom() : 0;
  const pushGap = S.follow ? 100 : zNow < 9 ? 1000 : zNow < 12 ? 500 : zNow < 13.5 ? 200 : 100;
  if (now - lastPush > pushGap) {
    updatePositions(); pushTrains(); lastPush = now;
    // 列車抵達終點：漫遊時換下一列
    if (S.roam && S.follow && !S.flying && !tripPos(S.follow, curMin())) roamNext();
  } else if (S.follow || (S.nearby && S.nearby.length)) pushFocusFrame();
  stepCamera(now, dt);
  Precip.step(dt, now);
  if (S.roam && now > S.roamAt && !S.flying) { S.roamAt = now + ROAM_SEC * 1000; roamNext(); }
  if (now - lastUi > 500) {
    lastUi = now; renderClock(); renderCaption(); applyLook();
    if (!picker.hidden && document.activeElement !== pq) renderPicker();
    if (S.mapReady) updateRealWeather();
  }
  // 跟車時當格同步重繪：鏡頭、車身平移和背景執行緒剛送回的列車圖磚一起畫，
  // 不讓地圖自己排的重繪拿到「新車身＋舊平移」而前後跳一下
  if (S.mapReady && S.follow && !S.followPaused && !S.flying) map.redraw();
}

/* ---------- ?perf：載入計時面板 ----------
   列出開頁後每個東西在第幾秒就緒，以及每個 TDX 請求的排隊、下載時間，方便在自己的手機或電腦上找出哪裡慢 */
if (PERF) {
  // 精簡摘要：連線狀態一行、各項就緒秒數、TDX 請求只列沒完成、失敗與最慢的幾個；「複製」可把完整紀錄貼給別人
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;max-width:min(420px,calc(100% - 16px));border-radius:10px;background:rgba(0,0,0,.8);color:#E8F0F2;font:11px/1.45 ui-monospace,Menlo,monospace;opacity:.94';
  box.innerHTML = '<div style="display:flex;gap:6px;padding:6px 8px 0"><b style="flex:1">載入計時</b><button data-a="copy">複製</button><button data-a="fold">收合</button></div><pre style="margin:0;padding:4px 10px 8px;white-space:pre-wrap;max-height:40vh;overflow:auto"></pre>';
  for (const b of box.querySelectorAll('button')) b.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,.15);border:0;border-radius:6px;padding:2px 8px;cursor:pointer';
  document.body.appendChild(box);
  const el = box.querySelector('pre');
  if (document.fonts) document.fonts.ready.then(() => perfMark('字型載入完成'));
  const sec = ms => (ms / 1000).toFixed(1) + 's';
  const name = j => j.path.replace(/^v\d\//, '').replace(/^(Rail|Bus|Air)\//, '');
  const line = j => (j.done ? sec(j.done - j.q) : j.sent ? '下載中 ' + sec(performance.now() - j.sent) : '排隊 ' + sec(performance.now() - j.q)) + '  ' + name(j) + (j.n !== undefined && j.n !== '' ? ' ×' + j.n : '') + (j.err ? ' ✗' + j.err : '');
  const text = full => {
    const rows = ['TDX 狀態：' + ($('#tdxstatus') ? $('#tdxstatus').textContent.trim().slice(0, 60) : '')];
    for (const [n, t] of PERF.marks.slice().sort((a, b) => a[1] - b[1])) rows.push(sec(t).padStart(6) + '  ' + n);
    const T = PERF.tdx;
    if (T.length) {
      const wait = T.filter(j => !j.sent && !j.done), dl = T.filter(j => j.sent && !j.done), err = T.filter(j => j.err), ok = T.filter(j => j.done && !j.err);
      rows.push('', `TDX 請求 ${T.length} 個：完成 ${ok.length}、下載中 ${dl.length}、排隊 ${wait.length}、失敗 ${err.length}`);
      const pick = full ? T : [...dl, ...err, ...wait.slice(0, 3), ...ok.slice().sort((a, b) => (b.done - b.q) - (a.done - a.q)).slice(0, 5)];
      for (const j of pick) rows.push('  ' + line(j));
    }
    return rows.join('\n');
  };
  let fold = false;
  box.addEventListener('click', e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'fold') { fold = !fold; el.hidden = fold; e.target.textContent = fold ? '展開' : '收合'; }
    if (a === 'copy') {
      const t = text(true), done = () => { e.target.textContent = '已複製'; setTimeout(() => { e.target.textContent = '複製'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => prompt('請手動複製', t)); else prompt('請手動複製', t);
    }
  });
  const draw = () => { if (!fold) el.textContent = text(false); };
  setInterval(draw, 1000); draw();
}

/* ---------- 啟動 ---------- */
async function boot() {
  perfMark('程式開始執行（地圖元件已下載）');
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch('data/rail.json', { signal: ctl.signal });
    clearTimeout(tm);
    if (r.ok) applyRailData(await r.json());
  } catch (e) { console.warn('軌道線形載入失敗，改用站間直線', e); }
  perfMark('軌道線形 rail.json');
  generateAll();
  Precip.init();
  initMap();
  renderViewBtn(); renderSkyPanel();
  updatePositions(); renderClock();
  startBtns.forEach(b => { b.disabled = false; });
  perfMark('開場按鈕可按');
  requestAnimationFrame(t => { last = t; frame(t); });
  const cred = store.get('tdx', {});
  if (cred.id && cred.secret) connectTDX(cred, true);
}
boot();
