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
const railColor = P => ['case', ['==', ['get', 'color'], ''], P.tra, ['get', 'color']];
const STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    dem: DEM, demhs: { ...DEM },
    land: { type: 'geojson', data: COUNTIES_GEOJSON },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': P0.sea } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': P0.land } },
    { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]], paint: { 'fill-color': P0.wood, 'fill-opacity': 0.6 } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 12, paint: { 'fill-color': P0.wood, 'fill-opacity': 0.55 } },
    { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 13, filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]], paint: { 'fill-color': P0.wood, 'fill-opacity': 0.35 } },
    { id: 'hills', type: 'hillshade', source: 'demhs', paint: { 'hillshade-shadow-color': P0.hsShadow, 'hillshade-highlight-color': P0.hsHigh, 'hillshade-accent-color': P0.hsAccent, 'hillshade-exaggeration': 0.55 } },
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
const MAX_CAR_TRAINS = COARSE ? 8 : 18;
const LIVE_TRAINS = COARSE ? 5 : 8; // 其中每一格都更新的列數 // 同時畫成車廂的列車上限（跟拍的列車另計）
const DOT = COARSE ? 1.35 : 1; // 手機上列車圓點放大 // 這個縮放以上把列車畫成一節節車廂
function initMap() {
  if (!window.maplibregl) { $('#intro p').textContent = '地圖元件載入失敗，請確認網路連線後重新整理。'; return; }
  map = new maplibregl.Map({
    container: 'map', style: STYLE, ...TAIWAN, maxPitch: 85, attributionControl: false,
    localIdeographFontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    fadeDuration: 0,
    pixelRatio: Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2), // 手機 3 倍像素太耗效能
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
    map.addSource('cars', { type: 'geojson', data: EMPTY });
    map.addSource('focus', { type: 'geojson', data: EMPTY });
    map.addSource('focus2', { type: 'geojson', data: EMPTY });
    map.addSource('lights', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'train-halo', type: 'circle', source: 'trains', maxzoom: 15,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 14, 6], 13, ['case', ['get', 'sel'], 26, 14]], 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': P0.glow + 0.15, 'circle-pitch-alignment': 'map' } });
    const carPaint = { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b3'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false };
    map.addLayer({ id: 'cars', type: 'fill-extrusion', source: 'cars', minzoom: CAR_ZOOM, paint: carPaint });
    // 跟拍的列車用兩組圖層輪流：一組顯示，另一組在背後載入下一份車身，載好才換過來
    const focusPaint = { ...carPaint, 'fill-extrusion-translate-anchor': 'map', 'fill-extrusion-translate-transition': { duration: 0, delay: 0 }, 'fill-extrusion-opacity-transition': { duration: 0, delay: 0 } };
    map.addLayer({ id: 'focus-cars', type: 'fill-extrusion', source: 'focus', minzoom: CAR_ZOOM, paint: focusPaint });
    map.addLayer({ id: 'focus-cars2', type: 'fill-extrusion', source: 'focus2', minzoom: CAR_ZOOM, paint: { ...focusPaint, 'fill-extrusion-opacity': 0 } });
    map.addSource('near', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'near-cars', type: 'fill-extrusion', source: 'near', minzoom: CAR_ZOOM, paint: carPaint });
    // 車頭燈（暖白）與尾燈（紅）
    map.addLayer({ id: 'light-glow', type: 'circle', source: 'lights', minzoom: 11,
      paint: { 'circle-color': ['get', 'c'], 'circle-blur': 1, 'circle-pitch-alignment': 'map',
        'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['*', 4, ['get', 'k']], 15, ['*', 12, ['get', 'k']], 19, ['*', 60, ['get', 'k']]],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 0.9] } });
    map.addLayer({ id: 'light-core', type: 'circle', source: 'lights', minzoom: 12,
      paint: { 'circle-color': '#FFFFFF', 'circle-pitch-alignment': 'map', 'circle-blur': 0.4,
        'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 12, ['*', 1, ['get', 'k']], 16, ['*', 3, ['get', 'k']], 19, ['*', 10, ['get', 'k']]] } });
    // 半透明建築要畫在車廂之後：先畫的 3D 圖層會擋住後畫的，這樣隔著建築也看得到列車
    try { map.moveLayer('buildings', 'light-glow'); } catch {}
    map.addSource('facade', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'facade', type: 'fill-extrusion', source: 'facade', minzoom: FACADE_ZOOM,
      paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.8, 'fill-extrusion-vertical-gradient': false } }, 'light-glow');
    const solid = { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false };
    map.addSource('platforms', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'platforms', type: 'fill-extrusion', source: 'platforms', minzoom: FACADE_ZOOM, paint: solid }, 'focus-cars');
    map.addSource('people', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'people', type: 'fill-extrusion', source: 'people', minzoom: 16, paint: solid }, 'focus-cars');
    map.addSource('lamps', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'lamp-glow', type: 'circle', source: 'lamps', minzoom: FACADE_ZOOM,
      paint: { 'circle-color': '#FFD48A', 'circle-blur': 1, 'circle-pitch-alignment': 'map', 'circle-opacity': 0,
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 16, 6, 20, 90] } }, 'buildings');
    map.on('moveend', () => Facade.soon());
    map.on('sourcedata', e => { if (e.sourceId === 'omt' && e.isSourceLoaded) Facade.soon(true); });
    map.addLayer({ id: 'train', type: 'circle', source: 'trains', maxzoom: CAR_ZOOM + 0.5,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 6, ['==', ['get', 'g'], 'mrt'], 2.4 * DOT, 3 * DOT], 12, ['case', ['get', 'sel'], 9, 5.5]],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['case', ['get', 'sel'], 2, 0.6], 'circle-pitch-alignment': 'map' } });
    map.setLayoutProperty('buildings', 'visibility', S.buildings ? 'visible' : 'none');
    for (const l of ['facade', 'lamp-glow']) map.setLayoutProperty(l, 'visibility', S.buildings ? 'visible' : 'none');
    S.mapReady = true;
    applyLook(true); pushTrains(true);
    map.on('click', onMapClick);
    for (const l of ['train', 'train-halo', 'cars', 'st-dot']) {
      map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', l, () => map.getCanvas().style.cursor = '');
    }
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
  const want = S.terrain && !(S.follow && !S.followPaused) && (terrainOn ? z < 12.5 : z < 11.5);
  if (want === terrainOn && !force) return;
  terrainOn = want;
  try { map.setTerrain(want ? { source: 'dem', exaggeration: 1.5 } : null); } catch {}
}

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
    if (!S.buildings || map.getZoom() < FACADE_ZOOM) { if (last) { src.setData(EMPTY); last = null; } return; }
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
  Music.setRain(W.rain);
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
  if (!sel && z >= CAR_ZOOM - 0.3) S.nearby = near.splice(0, LIVE_TRAINS).map(n => n.trip);
  if (doLights) for (const { trip, pos } of near) trainLights(trip, pos, bgLights);
  if (doCars) {
    lastCars = performance.now();
    for (const { trip, pos } of near.slice(0, MAX_CAR_TRAINS)) {
      const start = cars.length;
      carFeatures(trip, pos, S.P, cars, false); // 窗格細節只畫在跟拍的列車上
      for (let i = start; i < cars.length; i++) cars[i].properties.idx = trip.idx;
    }
    map.getSource('cars').setData({ type: 'FeatureCollection', features: cars });
  } else if (z < CAR_ZOOM - 0.3 && lastCars) { map.getSource('cars').setData(EMPTY); lastCars = 0; }
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
// 跟拍的列車：GeoJSON 交給背景執行緒切圖磚，畫面上真正出現會晚幾格，而且新舊圖磚可能混在同一格畫出來。
// 所以用兩組圖層輪流：新車身先送進看不到的那一組，整組載完才在同一格換成顯示它；
// 每一格再用 fill-extrusion-translate 把顯示中的車身平移到現在該在的位置（改繪圖參數當格就生效）
const FOCUS_BUF = [{ src: 'focus', layer: 'focus-cars' }, { src: 'focus2', layer: 'focus-cars2' }];
function focusSwap() {
  const F = S.fb || (S.fb = { show: 0, t: null, trip: null, pend: null });
  if (!F.pend) return true;
  const B = FOCUS_BUF[F.pend.buf];
  if (!map.isSourceLoaded(B.src) && performance.now() - F.pend.at < 500) return false;
  map.setPaintProperty(B.layer, 'fill-extrusion-opacity', 1);
  map.setPaintProperty(FOCUS_BUF[F.show].layer, 'fill-extrusion-opacity', 0);
  F.show = F.pend.buf; F.t = F.pend.m; F.trip = F.pend.trip; F.pend = null; S.focusShift = null;
  return true;
}
function shiftFocus() {
  const F = S.fb; if (!F) return;
  let tr = [0, 0];
  const t = S.follow;
  if (t && F.trip === t && F.t != null) {
    const a = tripPos(t, F.t), b = tripPos(t, curMin());
    if (a && b) {
      const p0 = trackPoint(t, a.km), p1 = trackPoint(t, b.km), lat = map.getCenter().lat * Math.PI / 180;
      const mpp = 40075016.686 * Math.cos(lat) / (512 * Math.pow(2, map.getZoom()));
      tr = [(p1.x - p0.x) * 1000 / mpp, (p1.y - p0.y) * 1000 / mpp];
    }
  }
  if (!S.focusShift || Math.abs(tr[0] - S.focusShift[0]) + Math.abs(tr[1] - S.focusShift[1]) > 0.01) { map.setPaintProperty(FOCUS_BUF[F.show].layer, 'fill-extrusion-translate', tr); S.focusShift = tr; }
}
function pushFocus() {
  if (!S.mapReady) return;
  const t = S.follow, m = curMin();
  if (focusSwap()) {
    const pos = t && tripPos(t, m), out = [], buf = 1 - S.fb.show;
    if (pos) { carFeatures(t, pos, S.P, out, true); for (const f of out) f.properties.idx = t.idx; out[0].properties.ts = m; }
    map.getSource(FOCUS_BUF[buf].src).setData({ type: 'FeatureCollection', features: out });
    S.fb.pend = { buf, m, trip: t, at: performance.now() };
  }
  // 跟拍列車附近的列車另外一個圖層，每一格更新
  const near = [];
  for (const n of S.nearby || []) {
    const np = tripPos(n, m); if (!np) continue;
    const start = near.length; carFeatures(n, np, S.P, near, false);
    for (let i = start; i < near.length; i++) near[i].properties.idx = n.idx;
  }
  if (near.length || S.hadNear) { map.getSource('near').setData({ type: 'FeatureCollection', features: near }); S.hadNear = near.length > 0; }
  // 畫面附近車站月台上的旅客：候車、上車、下車
  const ppl = [];
  if (map.getZoom() >= 16) {
    const now = performance.now();
    if (!S.pplSt || now - S.pplSt.at > 1000) { const c = map.getCenter(), [cx, cy] = proj(c.lat, c.lng); S.pplSt = { at: now, list: NODES.filter(n => Math.hypot(n.x - cx, n.y - cy) < 0.5).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)) }; }
    const cap = (COARSE ? 140 : 260) * 6;
    for (const n of S.pplSt.list) for (const [R, idx] of stationReps(n)) stationPeople(n, R, idx, m, ppl, cap);
  }
  if (ppl.length || S.hadPeople) { map.getSource('people').setData({ type: 'FeatureCollection', features: ppl }); S.hadPeople = ppl.length > 0; }
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
    case 'cab': {
      // 站在車頭後上方往前看，畫面下緣看得到車鼻
      from = trackPoint(trip, pos.km - 9 * M); fa = H + 3.5;
      to = trackPoint(trip, pos.km + 140 * M); ta = 0; anchor = 'from'; break;
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
  if (S.flying) { map.stop(); S.flying = false; }
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

/* 漫遊：每隔一段時間換一列車，偏好行駛中、不同系統的列車，並換個視角 */
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
function roamNext() {
  const t = pickRoamTrip(); if (!t) return;
  const views = VIEWS.map(v => v.id).filter(v => v !== S.view);
  S.view = views[Math.floor(Math.random() * views.length)];
  follow(t);
}
function setRoam(on) {
  S.roam = on; const rb = $('#roambtn'); rb.setAttribute('aria-pressed', String(on)); rb.textContent = on ? '換一列 ›' : '漫遊';
  rb.title = on ? '漫遊中：按一下換下一列車' : '每隔一段時間自動換一列車';
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
function openPicker() { settings.hidden = true; picker.hidden = false; scrim.hidden = false; renderPicker(); setTimeout(() => pq.focus({ preventScroll: true }), 50); }
function closePicker() { picker.hidden = true; scrim.hidden = true; }
function renderPicker() {
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
  const hit = map.queryRenderedFeatures(box, { layers: ['train', 'train-halo', 'cars', 'focus-cars', 'focus-cars2', 'near-cars', 'st-dot'] });
  const tr = hit.find(f => f.layer.id !== 'st-dot');
  if (tr) { const t = TRIPS[tr.properties.idx]; if (t !== S.follow || S.followPaused) { setRoam(false); follow(t); } return; }
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
  $('#mode').textContent = TDX.ok ? 'TDX 即時' : '班表推估';
}

/* ---------- 工具列 ---------- */
// 漫遊中再按一下就直接換下一列車；按「離開」或自己選車才會停止漫遊
$('#roambtn').addEventListener('click', () => { if (S.roam) { S.roamAt = performance.now() + ROAM_SEC * 1000; roamNext(); } else setRoam(true); });
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
const musicBtn = $('#musicbtn');
function setMusic(on) {
  if (on) Music.start().catch(() => {}); else Music.stop();
  musicBtn.setAttribute('aria-pressed', String(on)); store.set('music', on);
}
musicBtn.addEventListener('click', () => setMusic(!Music.playing));
$('#setbtn').addEventListener('click', () => {
  settings.hidden = !settings.hidden;
  if (!settings.hidden) { closePicker(); sky.hidden = true; const c = store.get('tdx', {}); $('#tdxid').value = c.id || ''; $('#tdxsecret').value = c.secret || ''; }
});
function toggleBtn(id, key, apply) {
  const b = $(id); b.setAttribute('aria-pressed', String(S[key]));
  b.addEventListener('click', () => { S[key] = !S[key]; store.set(key, S[key]); b.setAttribute('aria-pressed', String(S[key])); if (S.mapReady) apply(S[key]); });
}
toggleBtn('#terrainbtn', 'terrain', () => syncTerrain(true));
toggleBtn('#buildbtn', 'buildings', on => { for (const l of ['buildings', 'facade', 'lamp-glow']) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'); });
toggleBtn('#labelbtn', 'labels', on => map.setLayoutProperty('st-label', 'visibility', on ? 'visible' : 'none'));

$('#viewbtn').addEventListener('click', cycleView);

/* ---------- 光線與天氣面板 ---------- */
const sky = $('#sky');
$('#skybtn').addEventListener('click', () => { sky.hidden = !sky.hidden; if (!sky.hidden) { settings.hidden = true; closePicker(); renderSkyPanel(); } });
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
  $('#wxbadge').textContent = r && S.wx === 'auto' ? ` · ${WEATHER[r.wx].name} ${r.temp}°` : S.wx !== 'auto' ? ' · ' + W.name : '';
}

/* ---------- TDX ---------- */
const tdxStatus = msg => { $('#tdxstatus').innerHTML = msg; };
let delayTimer = null, tdxGen = 0;
const twDate = ms => new Date(ms + TW).toISOString().slice(0, 10);
function afterTripsChanged() {
  // 班次重建後 TRIPS 內的物件已換新，跟車對象要找回同一車次
  if (S.follow) {
    const f = S.follow, same = TRIPS.includes(f) ? f : TRIPS.find(t => t.sys === f.sys && t.no && t.no === f.no && t.origin === f.origin);
    if (same) S.follow = same; else unfollow();
  }
  updatePositions(); pushTrains(); renderClock(); renderCaption(true);
}
async function connectTDX(cred, quiet) {
  const gen = ++tdxGen, isCurrent = () => gen === tdxGen;
  clearInterval(delayTimer);
  tdxStatus('連線中…');
  try {
    const trips = await TDX.loadTimetables(cred);
    if (!isCurrent()) return;
    TDX.applyTimetables(trips);
    TDX.ok = true; TDX.date = twDate(Date.now());
    let d = 0; try { d = await TDX.loadDelays(cred, isCurrent); } catch {}
    if (!isCurrent()) return;
    tdxStatus(`已載入 ${trips.length} 班台鐵與高鐵當日時刻，${d} 列台鐵即時誤點。`);
    delayTimer = setInterval(() => {
      const now = Date.now();
      if (twDate(now) !== TDX.date && minOfDay(now) >= 240) { connectTDX(cred, true); return; }
      TDX.loadDelays(cred, isCurrent).catch(() => {});
    }, 60000);
    afterTripsChanged();
  } catch (err) {
    if (!isCurrent()) return;
    TDX.ok = false;
    tdxStatus(err instanceof TypeError ? '無法連到 TDX，請確認網路連線。目前繼續使用班表推估。' : esc(err.message) + '。請確認金鑰正確；目前繼續使用班表推估。');
    if (!quiet) console.warn(err);
  }
}
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
  else if (e.key === 'Escape') { if (!picker.hidden) closePicker(); else if (!settings.hidden) settings.hidden = true; else if (!sky.hidden) sky.hidden = true; else { setRoam(false); unfollow(); } }
});

/* ---------- 主迴圈 ---------- */
let last = performance.now(), lastPush = 0, lastUi = 0;
function frame(now) {
  // 先排下一格：要排在地圖自己的重繪之前，下一格才會先輪到這裡
  requestAnimationFrame(frame);
  const dt = Math.min(1000, now - last); last = now;
  if (S.playing) { if (S.live && S.speed === 1) S.simMs = Date.now(); else S.simMs += dt * S.speed; }
  if (now - lastPush > 100) {
    updatePositions(); pushTrains(); lastPush = now;
    // 列車抵達終點：漫遊時換下一列
    if (S.roam && S.follow && !S.flying && !tripPos(S.follow, curMin())) roamNext();
  } else if (S.follow || (S.nearby && S.nearby.length)) pushFocusFrame();
  stepCamera(now, dt);
  if (S.mapReady) shiftFocus();
  Precip.step(dt, now);
  if (S.roam && now > S.roamAt && !S.flying) { S.roamAt = now + ROAM_SEC * 1000; roamNext(); }
  if (now - lastUi > 500) {
    lastUi = now; renderClock(); renderCaption(); applyLook();
    if (!picker.hidden && document.activeElement !== pq) renderPicker();
    if (S.mapReady) updateRealWeather();
  }
  // 跟車時當格同步重繪：鏡頭、車身平移和背景執行緒剛送回的列車圖磚一起畫，
  // 不讓地圖自己排的重繪拿到「新車身＋舊平移」而前後跳一下
  if (S.mapReady && S.follow && !S.flying) map.redraw();
}

/* ---------- 啟動 ---------- */
async function boot() {
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch('data/rail.json', { signal: ctl.signal });
    clearTimeout(tm);
    if (r.ok) applyRailData(await r.json());
  } catch (e) { console.warn('軌道線形載入失敗，改用站間直線', e); }
  generateAll();
  Precip.init();
  initMap();
  renderViewBtn(); renderSkyPanel();
  updatePositions(); renderClock();
  startBtns.forEach(b => { b.disabled = false; });
  requestAnimationFrame(t => { last = t; frame(t); });
  const cred = store.get('tdx', {});
  if (cred.id && cred.secret) connectTDX(cred, true);
}
boot();
