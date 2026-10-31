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
  simMs: Date.now(), speed: 1, playing: true, live: true,
  positions: [], follow: null, followPaused: false, roam: false, roamAt: 0,
  view: store.get('view', 'chase'), rel: null, trans: null, ts: null,
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
    { id: 'hills', type: 'hillshade', source: 'demhs', paint: { 'hillshade-shadow-color': P0.hsShadow, 'hillshade-highlight-color': P0.hsHigh, 'hillshade-accent-color': P0.hsAccent, 'hillshade-exaggeration': 0.55 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': P0.water } },
    { id: 'county', type: 'line', source: 'land', paint: { 'line-color': P0.edge, 'line-width': 0.8, 'line-opacity': 0.6 } },
    { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: { 'line-color': P0.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.4, 14, 2.2, 18, 16], 'line-opacity': 0.8 } },
    { id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13.5,
      paint: { 'fill-extrusion-color': P0.bld, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.8 } },
    { id: 'places', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 15], 'text-letter-spacing': 0.15 },
      paint: { 'text-color': P0.label, 'text-halo-color': P0.halo, 'text-halo-width': 1.4, 'text-opacity': 0.75 } },
  ],
};

/* ---------- 路線與車站資料 ---------- */
function lineCoords(L) {
  const out = [];
  for (let i = 1; i < L.nodes.length; i++) {
    const a = L.nodes[i - 1], b = L.nodes[i], s = segGeom(a, b);
    const seg = s ? (s.rev ? s.g.coords.slice().reverse() : s.g.coords) : [[a.lon, a.lat], [b.lon, b.lat]];
    out.push(...(out.length ? seg.slice(1) : seg));
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
const CAR_ZOOM = 13.5; // 這個縮放以上把列車畫成一節節車廂
function initMap() {
  if (!window.maplibregl) { $('#intro p').textContent = '地圖元件載入失敗，請確認網路連線後重新整理。'; return; }
  map = new maplibregl.Map({
    container: 'map', style: STYLE, ...TAIWAN, maxPitch: 85, attributionControl: false,
    localIdeographFontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    fadeDuration: 0,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap 貢獻者 · OpenFreeMap · 地形 Mapzen／AWS · 天氣 Open-Meteo' }), 'bottom-right');
  // 用 style.load 而非 load：外部圖磚失敗時 load 不會觸發，仍要畫出鐵道與列車
  map.once('style.load', () => {
    try { if (S.terrain) map.setTerrain({ source: 'dem', exaggeration: 1.5 }); } catch {}
    map.addSource('rails', { type: 'geojson', data: railsGeoJSON() });
    map.addLayer({ id: 'rail-glow', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 9, 16, 18], 'line-blur': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, P0.glow * 0.5, 16, 0] } });
    map.addLayer({ id: 'rail', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0),
        'line-width': ['interpolate', ['exponential', 1.7], ['zoom'], 6, ['case', ['==', ['get', 'sys'], 'THSR'], 1.6, ['==', ['get', 'g'], 'mrt'], 1.1, 1], 12, 2.6, 16, 6, 19, 22],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 0.75] } });
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
    map.addLayer({ id: 'train-halo', type: 'circle', source: 'trains', maxzoom: 15,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 14, 6], 13, ['case', ['get', 'sel'], 26, 14]], 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': P0.glow + 0.15, 'circle-pitch-alignment': 'map' } });
    const carPaint = { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false };
    map.addLayer({ id: 'cars', type: 'fill-extrusion', source: 'cars', minzoom: CAR_ZOOM, paint: carPaint });
    map.addLayer({ id: 'focus-cars', type: 'fill-extrusion', source: 'focus', minzoom: CAR_ZOOM, paint: carPaint });
    map.addLayer({ id: 'train', type: 'circle', source: 'trains', maxzoom: CAR_ZOOM + 0.5,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 5, ['==', ['get', 'g'], 'mrt'], 1.8, 2.6], 12, ['case', ['get', 'sel'], 8, 5]],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['case', ['get', 'sel'], 2, 0.6], 'circle-pitch-alignment': 'map' } });
    map.setLayoutProperty('buildings', 'visibility', S.buildings ? 'visible' : 'none');
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
    map.on(ev, e => { if (e.originalEvent && S.follow) { S.followPaused = true; S.flying = false; S.trans = null; renderCaption(true); } });
  }
  map.on('error', e => console.warn('地圖資源載入失敗', e && e.error && e.error.message));
}

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
  set('water', 'fill-color', P.water); set('county', 'line-color', P.edge); set('roads', 'line-color', P.road); set('buildings', 'fill-extrusion-color', P.bld);
  set('hills', 'hillshade-shadow-color', P.hsShadow); set('hills', 'hillshade-highlight-color', P.hsHigh); set('hills', 'hillshade-accent-color', P.hsAccent);
  set('places', 'text-color', P.label); set('places', 'text-halo-color', P.halo);
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
let lastCars = 0;
function pushTrains(force) {
  if (!S.mapReady) return;
  const sel = S.follow, z = map.getZoom();
  const pts = [], cars = [];
  // 近看時只替畫面內的列車建車廂模型
  let bounds = null;
  const doCars = z >= CAR_ZOOM - 0.3 && (force || performance.now() - lastCars > 110);
  if (doCars) { const b = map.getBounds(); bounds = [b.getWest() - 0.01, b.getSouth() - 0.01, b.getEast() + 0.01, b.getNorth() + 0.01]; lastCars = performance.now(); }
  for (const { trip, pos } of S.positions) {
    const isSel = trip === sel;
    const ll = unproj(pos.x, pos.y);
    pts.push({ type: 'Feature', properties: { idx: trip.idx, color: trip.color, sel: isSel, g: sysGroup(trip.sys) }, geometry: { type: 'Point', coordinates: ll } });
    if (doCars && !isSel && ll[0] > bounds[0] && ll[0] < bounds[2] && ll[1] > bounds[1] && ll[1] < bounds[3]) {
      const start = cars.length;
      carFeatures(trip, pos, S.P, cars, false);
      for (let i = start; i < cars.length; i++) cars[i].properties.idx = trip.idx;
    }
  }
  map.getSource('trains').setData({ type: 'FeatureCollection', features: pts });
  if (doCars) map.getSource('cars').setData({ type: 'FeatureCollection', features: cars });
  else if (z < CAR_ZOOM - 0.3 && lastCars) { map.getSource('cars').setData(EMPTY); lastCars = 0; }
  pushFocus();
}
// 跟拍的列車每一格都更新，畫面上才不會抖
function pushFocus() {
  if (!S.mapReady) return;
  const t = S.follow, pos = t && tripPos(t, curMin());
  const out = [];
  if (pos) { carFeatures(t, pos, S.P, out, false); for (const f of out) f.properties.idx = t.idx; }
  map.getSource('focus').setData({ type: 'FeatureCollection', features: out });
}

/* ---------- 跟車鏡頭 ---------- */
let flightId = 0;
const ground = ll => { try { return map.queryTerrainElevation(ll) || 0; } catch { return 0; } };
const viewName = () => (VIEWS.find(v => v.id === S.view) || VIEWS[0]).name;
// 依視角算出攝影機位置（from）與注視點（to），回傳 MapLibre 的鏡頭參數
function viewCamera(trip, pos, now, dt) {
  const L = liveryOf(trip), H = L.h * EX, len = trainLength(trip);
  const near = Math.min(len, 0.12);
  let from, to, fa, ta, anchor = 'to';
  switch (S.view) {
    case 'cab': {
      // 站在車頭後上方往前看，畫面下緣看得到車鼻
      from = trackPoint(trip, pos.km - 9 * M); fa = H + 3.5;
      to = trackPoint(trip, pos.km + 140 * M); ta = 0; anchor = 'from'; break;
    }
    case 'side': {
      const mid = trackPoint(trip, pos.km - near * 0.45);
      from = offsetPt(mid, 10 * M, 68 * M); fa = 13; to = mid; ta = H * 0.5; break;
    }
    case 'orbit': {
      const mid = trackPoint(trip, pos.km - near * 0.35), a = now * 0.00011;
      from = { x: mid.x + Math.cos(a) * 75 * M, y: mid.y + Math.sin(a) * 75 * M }; fa = 34; to = mid; ta = H * 0.5; break;
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
  return camFromTo(fl, fa + ground(fl), tl, ta + ground(tl));
}
/* 由攝影機位置與注視點（經緯度＋高度公尺）換算 MapLibre 的 center/zoom/pitch/bearing */
function camFromTo(fl, fa, tl, ta) {
  const lat = tl[1] * Math.PI / 180, mx = 111320 * Math.cos(lat), my = 110570;
  const dx = (tl[0] - fl[0]) * mx, dy = (tl[1] - fl[1]) * my, dz = fa - ta;
  const dh = Math.hypot(dx, dy), D = Math.max(8, Math.hypot(dh, dz));
  const fov = (map.transform && map.transform.fov) || 36.87;
  const ctcd = 0.5 / Math.tan(fov / 2 * Math.PI / 180) * map.getCanvas().clientHeight;
  return {
    center: { lng: tl[0], lat: tl[1] },
    bearing: dh > 0.5 ? Math.atan2(dx, dy) * DEG : map.getBearing(),
    pitch: Math.min(84, Math.atan2(dh, Math.max(0.5, dz)) * DEG),
    zoom: Math.min(21, Math.log2(40075016.686 * Math.cos(lat) * ctcd / (512 * D))),
  };
}
function follow(trip, { fly = true } = {}) {
  const changed = trip !== S.follow;
  S.follow = trip; S.followPaused = false; S.rel = null; S.ts = null;
  closePicker();
  if (changed && S.wx === 'auto') S.realWxAt = 0;
  startCamera(fly);
  pushTrains(true); renderCaption(true); renderViewBtn();
}
function startCamera(fly) {
  const trip = S.follow; if (!trip || !map) return;
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
  if (!S.follow || S.followPaused || S.flying || !map || !S.mapReady) return;
  const pos = tripPos(S.follow, curMin());
  if (!pos) return;
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
function setView(id) {
  S.view = id; store.set('view', id); S.rel = null; S.ts = null;
  if (S.follow) { S.followPaused = false; startCamera(false); }
  renderViewBtn(); renderCaption(true);
}
function cycleView() { const i = VIEWS.findIndex(v => v.id === S.view); setView(VIEWS[(i + 1) % VIEWS.length].id); }
function renderViewBtn() { const b = $('#viewbtn'); b.textContent = '視角・' + viewName(); b.disabled = !S.follow; }

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
  S.roam = on; $('#roambtn').setAttribute('aria-pressed', String(on));
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
  cap.innerHTML = `
    <div class="kicker"><span class="dot" style="background:${t.color};color:${t.color}"></span>${esc(SYSTEMS[t.sys].name)}${t.car ? ' · ' + esc(t.car) : ''}${delay ? ' · ' + delay : ''}</div>
    <h2>${esc(trainTitle(t))}</h2>
    <div class="route">${esc(t.origin)} → ${esc(t.dest)}</div>
    <div class="next"><div><div class="lab">${pos && pos.atStation ? '此刻' : '下一站'}</div><b>${esc(next)}</b></div><span class="eta">${esc(eta)}</span></div>
    <div class="bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div>
    <div class="meta"><span>已過 ${done} / ${stops} 站</span><span>${speed ? '約 ' + speed + ' km/h' : ''}</span></div>
    ${S.followPaused ? '<div class="caprow"><button class="pillbtn small" id="refollow">◉ 回到列車</button><button class="pillbtn small" id="leave">離開</button></div>' : ''}`;
}
cap.addEventListener('click', e => {
  if (e.target.id === 'refollow' && S.follow) follow(S.follow);
  if (e.target.id === 'leave') { setRoam(false); unfollow(); }
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
  const hit = map.queryRenderedFeatures(box, { layers: ['train', 'train-halo', 'cars', 'focus-cars', 'st-dot'] });
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
const SPEEDS = [1, 10, 30, 60];
function setSpeed(sp) { S.speed = sp; if (sp !== 1) S.live = false; S.playing = true; $('#speedbtn').textContent = sp + '×'; renderClock(); }
$('#speedbtn').addEventListener('click', () => setSpeed(SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]));
function setSimMinute(min) { S.simMs = dayStart(Date.now()) + ((min % 1440) + 1440) % 1440 * 60000; S.live = false; updatePositions(); pushTrains(); renderClock(); renderCaption(true); }
function goNow() { S.simMs = Date.now(); S.live = true; setSpeed(1); updatePositions(); pushTrains(); }
function togglePlay() { S.playing = !S.playing; if (!S.playing) S.live = false; renderClock(); }
$('#slider').addEventListener('input', e => setSimMinute(+e.target.value));
$('#playbtn').addEventListener('click', togglePlay);
$('#nowbtn').addEventListener('click', goNow);
function renderClock() {
  const d = new Date(S.simMs + TW);
  $('#clock').textContent = [d.getUTCHours(), d.getUTCMinutes()].map(x => String(x).padStart(2, '0')).join(':') + (S.speed === 1 ? ':' + String(d.getUTCSeconds()).padStart(2, '0') : '');
  $('#mode').textContent = (TDX.ok ? 'TDX 即時' : '班表推估') + (S.live && S.speed === 1 && S.playing ? '' : S.playing ? ` · ${S.speed}× 播放` : ' · 已暫停');
  $('#playbtn').textContent = S.playing ? '暫停' : '播放';
  if (document.activeElement !== $('#slider')) $('#slider').value = Math.floor(curMin());
}

/* ---------- 工具列 ---------- */
$('#roambtn').addEventListener('click', () => setRoam(!S.roam));
$('#overview').addEventListener('click', () => { setRoam(false); unfollow(); if (map) map.flyTo({ ...TAIWAN, duration: 2500 }); });
function toggleFull() { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); } catch {} }
$('#fullbtn').addEventListener('click', toggleFull);
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
toggleBtn('#terrainbtn', 'terrain', on => { try { map.setTerrain(on ? { source: 'dem', exaggeration: 1.5 } : null); } catch {} });
toggleBtn('#buildbtn', 'buildings', on => map.setLayoutProperty('buildings', 'visibility', on ? 'visible' : 'none'));
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
function renderSkyPanel() {
  document.querySelectorAll('#todrow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.tod)));
  document.querySelectorAll('#wxrow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.wx)));
  const W = WEATHER[lookWx()];
  $('#skybtn').textContent = W.icon;
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
  if (e.key === ' ') { togglePlay(); e.preventDefault(); }
  else if (['1', '2', '3', '4'].includes(e.key)) setSpeed(SPEEDS[+e.key - 1]);
  else if (e.key === 'ArrowLeft') setSimMinute(curMin() - 10);
  else if (e.key === 'ArrowRight') setSimMinute(curMin() + 10);
  else if (e.key === 'f' || e.key === 'F') toggleFull();
  else if (e.key === 'r' || e.key === 'R') setRoam(!S.roam);
  else if (e.key === 'm' || e.key === 'M') setMusic(!Music.playing);
  else if ((e.key === 'v' || e.key === 'V') && S.follow) cycleView();
  else if (e.key === 'Escape') { if (!picker.hidden) closePicker(); else if (!settings.hidden) settings.hidden = true; else if (!sky.hidden) sky.hidden = true; else { setRoam(false); unfollow(); } }
});

/* ---------- 主迴圈 ---------- */
let last = performance.now(), lastPush = 0, lastUi = 0;
function frame(now) {
  const dt = Math.min(1000, now - last); last = now;
  if (S.playing) { if (S.live && S.speed === 1) S.simMs = Date.now(); else S.simMs += dt * S.speed; }
  if (now - lastPush > 50) {
    updatePositions(); pushTrains(); lastPush = now;
    // 列車抵達終點：漫遊時換下一列
    if (S.roam && S.follow && !S.flying && !tripPos(S.follow, curMin())) roamNext();
  } else if (S.follow) pushFocus();
  stepCamera(now, dt);
  Precip.step(dt, now);
  if (S.roam && now > S.roamAt && !S.flying) { S.roamAt = now + ROAM_SEC * 1000; roamNext(); }
  if (now - lastUi > 500) {
    lastUi = now; renderClock(); renderCaption(); applyLook();
    if (!picker.hidden && document.activeElement !== pq) renderPicker();
    if (S.mapReady) updateRealWeather();
  }
  requestAnimationFrame(frame);
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
