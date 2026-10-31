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
  cam: null, flying: false, phase: null, mapReady: false,
  pickGroup: 'all', terrain: store.get('terrain', true), buildings: store.get('buildings', true), labels: store.get('labels', true),
};
const curMin = () => minOfDay(S.simMs);

/* ---------- 底圖配色（依模擬時間切換日夜） ---------- */
const PALETTE = {
  night: { sea:'#050A12', land:'#0F1822', edge:'#1C2733', water:'#06101B', wood:'#0F1D1A', road:'#1D2A37', bld:'#1A2533',
    hsShadow:'#000000', hsHigh:'#3A4C60', hsAccent:'#0A121B', label:'#8FA0AE', halo:'#050A12',
    sky:'#0A1424', horizon:'#1F2F45', fog:'#0B1320', tra:'#A9BCCD', glow:0.55 },
  dusk: { sea:'#1B2333', land:'#2B2A33', edge:'#3A3846', water:'#1E2840', wood:'#26302B', road:'#403C48', bld:'#3A3642',
    hsShadow:'#120E18', hsHigh:'#B08A72', hsAccent:'#2A2230', label:'#D6C8C0', halo:'#1B1A22',
    sky:'#3B3352', horizon:'#E89A6A', fog:'#4A3A48', tra:'#E8DCCF', glow:0.4 },
  day: { sea:'#8EB2C7', land:'#DCDDD0', edge:'#C3C4B4', water:'#86AAC0', wood:'#BFCDB0', road:'#F4F2EA', bld:'#D2D0C6',
    hsShadow:'#4E5C55', hsHigh:'#FFFFFF', hsAccent:'#7D8B80', label:'#3B4650', halo:'#F4F2EA',
    sky:'#7FB1D8', horizon:'#E2ECF0', fog:'#DCE6EA', tra:'#3F4E5E', glow:0.15 },
};
function phaseAt(min) {
  const h = min / 60;
  if (h >= 6.5 && h < 17.2) return 'day';
  if ((h >= 5.2 && h < 6.5) || (h >= 17.2 && h < 18.6)) return 'dusk';
  return 'night';
}

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
const P0 = PALETTE[phaseAt(minOfDay(Date.now()))];
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
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': P0.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 2.2, 17, 6], 'line-opacity': 0.8 } },
    { id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13.5,
      paint: { 'fill-extrusion-color': P0.bld, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.75 } },
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
function initMap() {
  if (!window.maplibregl) { $('#intro p').textContent = '地圖元件載入失敗，請確認網路連線後重新整理。'; return; }
  map = new maplibregl.Map({
    container: 'map', style: STYLE, ...TAIWAN, maxPitch: 78, attributionControl: false,
    localIdeographFontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    fadeDuration: 0,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap 貢獻者 · OpenFreeMap · 地形 Mapzen／AWS' }), 'bottom-right');
  // 用 style.load 而非 load：外部圖磚失敗時 load 不會觸發，仍要畫出鐵道與列車
  map.once('style.load', () => {
    try { if (S.terrain) map.setTerrain({ source: 'dem', exaggeration: 1.5 }); } catch {}
    map.addSource('rails', { type: 'geojson', data: railsGeoJSON() });
    map.addLayer({ id: 'rail-glow', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 9, 16, 18], 'line-blur': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 8], 'line-opacity': P0.glow * 0.5 } });
    map.addLayer({ id: 'rail', type: 'line', source: 'rails', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': railColor(P0),
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['==', ['get', 'sys'], 'THSR'], 1.6, ['==', ['get', 'g'], 'mrt'], 1.1, 1], 12, 2.6, 16, 5] } });
    map.addSource('stations', { type: 'geojson', data: stationsGeoJSON() });
    map.addLayer({ id: 'st-dot', type: 'circle', source: 'stations',
      filter: ['any', ['<=', ['get', 'rank'], 1], ['all', ['<=', ['get', 'rank'], 2], ['>=', ['zoom'], 9]], ['>=', ['zoom'], 11.5]],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5], 'circle-color': '#0B1118', 'circle-stroke-color': '#EEF3F6', 'circle-stroke-width': 1.3, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'st-label', type: 'symbol', source: 'stations',
      filter: ['any', ['all', ['<=', ['get', 'rank'], 1], ['>=', ['zoom'], 7.2]], ['all', ['<=', ['get', 'rank'], 2], ['>=', ['zoom'], 10]], ['>=', ['zoom'], 12.5]],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 12, 14, 15], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-letter-spacing': 0.1, visibility: S.labels ? 'visible' : 'none' },
      paint: { 'text-color': '#EEF3F6', 'text-halo-color': 'rgba(5,10,18,.85)', 'text-halo-width': 1.6 } });
    map.addSource('trains', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('bodies', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'train-halo', type: 'circle', source: 'trains',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 14, 6], 13, ['case', ['get', 'sel'], 26, 14]], 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': P0.glow + 0.15, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'train-body', type: 'fill-extrusion', source: 'bodies', minzoom: 11,
      paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } });
    map.addLayer({ id: 'train', type: 'circle', source: 'trains', maxzoom: 12.5,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'sel'], 5, ['==', ['get', 'g'], 'mrt'], 1.8, 2.6], 12, ['case', ['get', 'sel'], 8, 5]],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['case', ['get', 'sel'], 2, 0.6], 'circle-pitch-alignment': 'map' } });
    map.setLayoutProperty('buildings', 'visibility', S.buildings ? 'visible' : 'none');
    S.mapReady = true;
    applyPhase(true); pushTrains();
    map.on('click', onMapClick);
    for (const l of ['train', 'train-halo', 'st-dot']) {
      map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', l, () => map.getCanvas().style.cursor = '');
    }
  });
  // 使用者自己拖曳、旋轉或縮放時，暫停跟車
  for (const ev of ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart']) {
    map.on(ev, e => { if (e.originalEvent && S.follow) { S.followPaused = true; S.flying = false; renderCaption(true); } });
  }
  map.on('error', e => console.warn('地圖資源載入失敗', e && e.error && e.error.message));
}

function applyPhase(force) {
  const ph = phaseAt(curMin());
  if (!map || !S.mapReady || (ph === S.phase && !force)) return;
  S.phase = ph; const P = PALETTE[ph];
  const set = (l, k, v) => { try { map.setPaintProperty(l, k, v); } catch {} };
  set('bg', 'background-color', P.sea); set('land', 'fill-color', P.land); set('wood', 'fill-color', P.wood);
  set('water', 'fill-color', P.water); set('county', 'line-color', P.edge); set('roads', 'line-color', P.road); set('buildings', 'fill-extrusion-color', P.bld);
  set('hills', 'hillshade-shadow-color', P.hsShadow); set('hills', 'hillshade-highlight-color', P.hsHigh); set('hills', 'hillshade-accent-color', P.hsAccent);
  set('places', 'text-color', P.label); set('places', 'text-halo-color', P.halo);
  set('rail', 'line-color', railColor(P)); set('rail-glow', 'line-color', railColor(P));
  set('rail-glow', 'line-opacity', P.glow * 0.5);
  set('train-halo', 'circle-opacity', P.glow + 0.15);
  try { map.setSky({ 'sky-color': P.sky, 'horizon-color': P.horizon, 'fog-color': P.fog, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4, 'atmosphere-blend': 0.6 }); } catch {}
  document.body.dataset.phase = ph;
}

/* ---------- 列車位置 ---------- */
const LLEN = { TRA: 0.22, THSR: 0.3, TRTC: 0.14, TYMC: 0.12, TMRT: 0.08, KRTC: 0.1 };
function trainBody(trip, pos) {
  // 沿行進方向的長方體（車長依系統，寬度略為誇大以便辨識）
  const len = LLEN[trip.sys] || 0.15, w = 0.022;
  const c = Math.cos(pos.heading), s = Math.sin(pos.heading);
  const pts = [[-len, -w], [0, -w], [0.012, 0], [0, w], [-len, w]].map(([u, v]) => unproj(pos.x + u * c - v * s, pos.y + u * s + v * c));
  pts.push(pts[0]);
  return pts;
}
function updatePositions() {
  const m = curMin();
  S.positions = [];
  for (const trip of TRIPS) { const pos = tripPos(trip, m); if (pos) S.positions.push({ trip, pos }); }
}
function pushTrains() {
  if (!S.mapReady) return;
  const sel = S.follow;
  const pts = [], bodies = [];
  for (const { trip, pos } of S.positions) {
    const isSel = trip === sel;
    pts.push({ type: 'Feature', properties: { idx: trip.idx, color: trip.color, sel: isSel, g: sysGroup(trip.sys) }, geometry: { type: 'Point', coordinates: unproj(pos.x, pos.y) } });
    bodies.push({ type: 'Feature', properties: { idx: trip.idx, color: isSel ? '#FFFFFF' : trip.color, h: isSel ? 16 : 11 }, geometry: { type: 'Polygon', coordinates: [trainBody(trip, pos)] } });
  }
  map.getSource('trains').setData({ type: 'FeatureCollection', features: pts });
  map.getSource('bodies').setData({ type: 'FeatureCollection', features: bodies });
}

/* ---------- 跟車鏡頭 ---------- */
const ZOOM = { TRA: 14.2, THSR: 13.4, TRTC: 15, TYMC: 14.6, TMRT: 15, KRTC: 15 };
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
// 投影座標的 y 軸朝南，heading 為數學角度；換成地圖方位角（北為 0、順時針）
const bearingOf = h => 90 + h * DEG;
let flightId = 0;
function follow(trip, { fly = true } = {}) {
  S.follow = trip; S.followPaused = false;
  closePicker();
  const pos = tripPos(trip, curMin());
  if (pos && map) {
    const bearing = bearingOf(pos.heading);
    S.cam = { bearing, zoom: ZOOM[trip.sys] || 14 };
    if (fly) {
      // 先停掉上一段飛行（會同步觸發它的 moveend），再用編號辨認這一段的結束
      map.stop();
      const id = ++flightId;
      S.flying = true;
      map.once('moveend', () => { if (id === flightId) S.flying = false; });
      map.flyTo({ center: unproj(pos.x, pos.y), zoom: S.cam.zoom, pitch: 64, bearing, duration: 3200, essential: true, curve: 1.6 });
    }
  }
  pushTrains(); renderCaption(true);
}
function unfollow() { S.follow = null; S.followPaused = false; S.flying = false; pushTrains(); renderCaption(); }
function stepCamera() {
  if (!S.follow || S.followPaused || S.flying || !map || !S.cam) return;
  const pos = tripPos(S.follow, curMin());
  if (!pos) return;
  const [lon, lat] = unproj(pos.x, pos.y);
  S.cam.bearing += angDiff(S.cam.bearing, bearingOf(pos.heading)) * 0.025;
  const c = map.getCenter();
  map.jumpTo({ center: [c.lng + (lon - c.lng) * 0.2, c.lat + (lat - c.lat) * 0.2], bearing: S.cam.bearing });
}

/* 漫遊：每隔一段時間換一列車，偏好行駛中、不同系統的列車 */
const ROAM_SEC = 75;
function pickRoamTrip() {
  const pool = S.positions.filter(p => !p.pos.atStation && p.trip !== S.follow);
  if (!pool.length) return null;
  const lastG = S.follow ? sysGroup(S.follow.sys) : null;
  const weight = p => (p.trip.sys === 'TRA' ? (p.trip.type === '區間' ? 2 : 5) : p.trip.sys === 'THSR' ? 4 : 1) * (sysGroup(p.trip.sys) === lastG ? 0.4 : 1);
  const total = pool.reduce((a, p) => a + weight(p), 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= weight(p); if (r <= 0) return p.trip; }
  return pool[0].trip;
}
function setRoam(on) {
  S.roam = on; $('#roambtn').setAttribute('aria-pressed', String(on));
  if (on) { S.roamAt = performance.now() + ROAM_SEC * 1000; if (!S.follow || S.followPaused) { const t = pickRoamTrip(); if (t) follow(t); } }
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
  const hit = map.queryRenderedFeatures(box, { layers: ['train', 'train-halo', 'train-body', 'st-dot'] });
  const tr = hit.find(f => f.layer.id !== 'st-dot');
  if (tr) { setRoam(false); follow(TRIPS[tr.properties.idx]); return; }
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
  if (!settings.hidden) { closePicker(); const c = store.get('tdx', {}); $('#tdxid').value = c.id || ''; $('#tdxsecret').value = c.secret || ''; }
});
function toggleBtn(id, key, apply) {
  const b = $(id); b.setAttribute('aria-pressed', String(S[key]));
  b.addEventListener('click', () => { S[key] = !S[key]; store.set(key, S[key]); b.setAttribute('aria-pressed', String(S[key])); if (S.mapReady) apply(S[key]); });
}
toggleBtn('#terrainbtn', 'terrain', on => { try { map.setTerrain(on ? { source: 'dem', exaggeration: 1.5 } : null); } catch {} });
toggleBtn('#buildbtn', 'buildings', on => map.setLayoutProperty('buildings', 'visibility', on ? 'visible' : 'none'));
toggleBtn('#labelbtn', 'labels', on => map.setLayoutProperty('st-label', 'visibility', on ? 'visible' : 'none'));

/* ---------- TDX ---------- */
const tdxStatus = msg => { $('#tdxstatus').innerHTML = msg; };
let delayTimer = null, tdxGen = 0;
const twDate = ms => new Date(ms + TW).toISOString().slice(0, 10);
function afterTripsChanged() {
  // 班次重建後 TRIPS 內的物件已換新，跟車對象要找回同一車次
  if (S.follow) {
    const f = S.follow, same = TRIPS.find(t => t.sys === f.sys && t.no && t.no === f.no && t.origin === f.origin);
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
  else if (e.key === 'Escape') { if (!picker.hidden) closePicker(); else if (!settings.hidden) settings.hidden = true; else { setRoam(false); unfollow(); } }
});

/* ---------- 主迴圈 ---------- */
let last = performance.now(), lastPush = 0, lastUi = 0;
function frame(now) {
  const dt = Math.min(1000, now - last); last = now;
  if (S.playing) { if (S.live && S.speed === 1) S.simMs = Date.now(); else S.simMs += dt * S.speed; }
  if (now - lastPush > 50) {
    updatePositions(); pushTrains(); lastPush = now;
    // 列車抵達終點：漫遊時換下一列
    if (S.roam && S.follow && !S.flying && !tripPos(S.follow, curMin())) { const t = pickRoamTrip(); if (t) follow(t); }
  }
  stepCamera();
  if (S.roam && now > S.roamAt && !S.flying) { S.roamAt = now + ROAM_SEC * 1000; const t = pickRoamTrip(); if (t) follow(t); }
  if (now - lastUi > 500) { lastUi = now; renderClock(); renderCaption(); applyPhase(); if (!picker.hidden && document.activeElement !== pq) renderPicker(); }
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
  initMap();
  updatePositions(); renderClock();
  startBtns.forEach(b => { b.disabled = false; });
  requestAnimationFrame(t => { last = t; frame(t); });
  const cred = store.get('tdx', {});
  if (cred.id && cred.secret) connectTDX(cred, true);
}
boot();
