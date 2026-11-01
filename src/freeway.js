/* ---------- 國道：OpenStreetMap 路網（data/freeway.json，由 tools/fetch_freeway.py 產生） ----------
   1. 畫出國道：地面路段是柏油路面加路肩線、車道虛線；高架路段是橋面、護欄、橋墩，
      接地面的一端做成引道坡。
   2. 給國道客運用：把客運貼到行駛方向相同的車道上、沿路網往前推算，高架段跟著升高。 */
const BKX = 111320 * Math.cos(23.7 / DEG), BKY = 110570;
const bxy = (lon, lat) => [(lon - 121) * BKX, (lat - 23.7) * BKY];
const bll = (x, y) => [x / BKX + 121, y / BKY + 23.7];
const FWY = { ways: [], grid: new Map(), starts: new Map(), ready: false, CELL: 400 };
const FWY_DECK = 6.5;   // 每層高架的橋面高度（公尺）
const fcell = (x, y) => Math.floor(x / FWY.CELL) + ',' + Math.floor(y / FWY.CELL);
const angGap = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

function decodeFreeway(j) {
  const ways = [];
  for (const r of j.ways || []) {
    const [ref, flags, layer, lanes, a, z] = r, ll = [];
    let lon = r[6], lat = r[7]; ll.push([lon / 1e5, lat / 1e5]);
    for (let i = 8; i + 1 < r.length; i += 2) { lon += r[i]; lat += r[i + 1]; ll.push([lon / 1e5, lat / 1e5]); }
    if (ll.length < 2) continue;
    const xy = ll.map(([lo, la]) => bxy(lo, la)), cum = [0];
    for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const link = !!(flags & 1), tunnel = !!(flags & 4);
    // 短橋（過河、跨路）實際上和路面同高，只有長橋或多層高架才畫成架高
    let len = 0; for (let i = 1; i < ll.length; i++) len += Math.hypot((ll[i][0] - ll[i - 1][0]) * BKX, (ll[i][1] - ll[i - 1][1]) * BKY);
    const bridge = !!(flags & 2) && (len >= 300 || (layer || 0) >= 2);
    const nl = Math.max(1, Math.min(6, lanes || (link ? 1 : 2)));
    ways.push({ ref, link, bridge, tunnel, layer: Math.max(1, layer || 1), lanes: nl, a, z, ll, xy, cum, len: cum[cum.length - 1],
      W: nl * 3.6 + (link ? 1.8 : 3.4), H: bridge ? FWY_DECK * Math.max(1, layer || 1) : 0, rampA: 0, rampZ: 0 });
  }
  return ways;
}
function indexFreeway(ways) {
  FWY.ways = ways; FWY.grid.clear(); FWY.starts.clear();
  ways.forEach((w, k) => {
    if (w.a >= 0) { if (!FWY.starts.has(w.a)) FWY.starts.set(w.a, []); FWY.starts.get(w.a).push(k); }
    for (let i = 1; i < w.xy.length; i++) {
      const [ax, ay] = w.xy[i - 1], [bx, by] = w.xy[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (FWY.CELL / 2)));
      const seen = new Set();
      for (let t = 0; t <= n; t++) {
        const c = fcell(ax + (bx - ax) * t / n, ay + (by - ay) * t / n);
        if (seen.has(c)) continue; seen.add(c);
        if (!FWY.grid.has(c)) FWY.grid.set(c, []); FWY.grid.get(c).push(k, i);
      }
    }
  });
  // 高架接到地面路段（或沒接任何路段）的那一端做引道坡
  const ends = new Map();
  for (const w of ways) for (const n of [w.a, w.z]) if (n >= 0) { if (!ends.has(n)) ends.set(n, []); ends.get(n).push(w); }
  for (const w of ways) {
    if (!w.bridge) continue;
    const R = Math.min(240, w.len / 2.2);
    const groundAt = n => !(ends.get(n) || []).some(o => o !== w && o.bridge);
    if (groundAt(w.a)) w.rampA = R;
    if (groundAt(w.z)) w.rampZ = R;
  }
}
// 路段上距起點 s 公尺處的橋面高度
function fwyAlt(w, s) {
  if (!w.bridge) return 0;
  let k = 1;
  if (w.rampA) k = Math.min(k, s / w.rampA);
  if (w.rampZ) k = Math.min(k, (w.len - s) / w.rampZ);
  k = Math.max(0, Math.min(1, k));
  return w.H * (k * k * (3 - 2 * k));
}
function fwyPoint(w, s) {
  s = Math.max(0, Math.min(w.len, s));
  let lo = 1, hi = w.cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (w.cum[m] < s) lo = m + 1; else hi = m; }
  const a = w.xy[lo - 1], b = w.xy[lo], seg = w.cum[lo] - w.cum[lo - 1] || 1, k = (s - w.cum[lo - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: (Math.atan2(b[0] - a[0], b[1] - a[1]) * DEG + 360) % 360, alt: fwyAlt(w, s) };
}
// 找附近行駛方向相同的車道（OSM 的國道每個方向是一條路）
// prefer：上一格貼的路段，相鄰平行車道（例如高架與地面）時優先留在原路段，不會跳來跳去
function fwySnap(x, y, h, maxD, prefer) {
  const pw = prefer != null ? FWY.ways[prefer] : null;
  if (!FWY.ready) return null;
  const r = Math.ceil(maxD / FWY.CELL), cx = Math.floor(x / FWY.CELL), cy = Math.floor(y / FWY.CELL), done = new Set();
  let best = null;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const list = FWY.grid.get((cx + i) + ',' + (cy + j)); if (!list) continue;
    for (let n = 0; n < list.length; n += 2) {
      const k = list[n], si = list[n + 1], key = k * 4096 + si; if (done.has(key)) continue; done.add(key);
      const w = FWY.ways[k], [ax, ay] = w.xy[si - 1], [bx, by] = w.xy[si], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if (d > maxD) continue;
      const sh = (Math.atan2(dx, dy) * DEG + 360) % 360, gap = h == null ? 0 : angGap(sh, h);
      if (gap > 60) continue;
      const stay = pw && (w === pw || w.a === pw.z) ? -15 : 0;
      const score = d + gap * 0.6 + (w.link ? 6 : 0) + stay;
      if (!best || score < best.score) best = { score, w: k, s: w.cum[si - 1] + Math.sqrt(L2) * t, d };
    }
  }
  if (!best) return null;
  return { w: best.w, s: best.s, d: best.d, ...fwyPoint(FWY.ways[best.w], best.s) };
}
// 沿路網往前走 dist 公尺；路段走完就接同一個端點出發、方向最順的下一段（優先主線）
function fwyAdvance(k, s, dist) {
  let w = FWY.ways[k], guard = 0;
  s += dist;
  while (s > w.len && guard++ < 40) {
    const nexts = (FWY.starts.get(w.z) || []).map(i => FWY.ways[i]).filter(o => o !== w);
    if (!nexts.length) { s = w.len; break; }
    const endH = fwyPoint(w, w.len).h;
    const cost = o => o.link * 50 + (o.ref !== w.ref) * 20 + angGap(fwyPoint(o, 0).h, endH);
    nexts.sort((p, q) => cost(p) - cost(q));
    s -= w.len; w = nexts[0]; k = FWY.ways.indexOf(w);
  }
  return { w: k, s, ...fwyPoint(w, s) };
}

/* ---------- 畫出國道 ---------- */
function fwyOffset(xy, off) {
  // 折線往右偏移 off 公尺（左偏給負值），轉角用兩邊法向量的平均
  const out = [];
  for (let i = 0; i < xy.length; i++) {
    const p = xy[Math.max(0, i - 1)], q = xy[Math.min(xy.length - 1, i + 1)];
    let dx = q[0] - p[0], dy = q[1] - p[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    out.push([xy[i][0] + dy * off, xy[i][1] - dx * off]);
  }
  return out;
}
function fwySlice(w, s0, s1) {
  const pts = [fwyPoint(w, s0)];
  for (let i = 1; i < w.cum.length - 1; i++) if (w.cum[i] > s0 && w.cum[i] < s1) pts.push({ x: w.xy[i][0], y: w.xy[i][1] });
  pts.push(fwyPoint(w, s1));
  return pts.map(p => [p.x, p.y]);
}
function fwyGeo(ways) {
  const ground = [], solid = [];
  const strip = (xy, l, r, base, top, kind) => {
    if (xy.length < 2 || top - base < 0.01) return;
    const A = fwyOffset(xy, l), B = fwyOffset(xy, r).reverse(), ring = A.concat(B, [A[0]]).map(([x, y]) => bll(x, y));
    solid.push({ type: 'Feature', properties: { kind, base, top }, geometry: { type: 'Polygon', coordinates: [ring] } });
  };
  for (const w of ways) {
    if (w.tunnel) continue;
    if (!w.bridge) { ground.push({ type: 'Feature', properties: { w: w.W, lanes: w.lanes, link: w.link ? 1 : 0 }, geometry: { type: 'LineString', coordinates: w.ll } }); continue; }
    // 橋面切段：引道坡每 25 公尺一段（高度不同），中段一整條
    const cuts = [0];
    const step = 25;
    for (let s = step; s < w.rampA; s += step) cuts.push(s);
    if (w.rampA < w.len - w.rampZ) cuts.push(Math.max(w.rampA, 0.01));
    for (let s = Math.max(w.rampA, w.len - w.rampZ); s < w.len; s += step) if (s > cuts[cuts.length - 1] + 1) cuts.push(s);
    if (cuts[cuts.length - 1] < w.len) cuts.push(w.len);
    const hw = w.W / 2;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1]; if (s1 - s0 < 0.5) continue;
      const h = (fwyAlt(w, s0) + fwyAlt(w, s1)) / 2, xy = fwySlice(w, s0, s1);
      if (h < 0.4) { ground.push({ type: 'Feature', properties: { w: w.W, lanes: w.lanes, link: w.link ? 1 : 0 }, geometry: { type: 'LineString', coordinates: xy.map(([x, y]) => bll(x, y)) } }); continue; }
      strip(xy, -hw, hw, Math.max(0, h - 1.5), h, 'deck');
      strip(xy, -hw, -hw + 0.4, h, h + 1.0, 'rail');
      strip(xy, hw - 0.4, hw, h, h + 1.0, 'rail');
      strip(xy, -hw + 0.55, -hw + 0.7, h, h + 0.03, 'mark');
      strip(xy, hw - 0.7, hw - 0.55, h, h + 0.03, 'mark');
    }
    // 橋墩：每 34 公尺一支，夠高才畫
    for (let s = 17; s < w.len; s += 34) {
      const p = fwyPoint(w, s); if (p.alt < 3) continue;
      const r = Math.min(1.4, hw * 0.3), xy = [[p.x - Math.sin(p.h / DEG) * r, p.y - Math.cos(p.h / DEG) * r], [p.x + Math.sin(p.h / DEG) * r, p.y + Math.cos(p.h / DEG) * r]];
      strip(xy, -Math.min(hw * 0.55, 3), Math.min(hw * 0.55, 3), 0, p.alt - 1.5, 'pier');
    }
  }
  return { ground: { type: 'FeatureCollection', features: ground }, solid: { type: 'FeatureCollection', features: solid } };
}
// 公尺換成像素寬（緯度 23.7 度附近）
const fwyPx = m => ['interpolate', ['exponential', 2], ['zoom'], 8, ['*', m, 256 / (40075016.686 * Math.cos(23.7 / DEG) / 2 ** 8) * 2], 22, ['*', m, 256 / (40075016.686 * Math.cos(23.7 / DEG) / 2 ** 22) * 2]];
function addFreewayLayers() {
  if (!FWY.ready || !S.mapReady || map.getSource('fwy-ground')) return;
  const g = fwyGeo(FWY.ways);
  map.addSource('fwy-ground', { type: 'geojson', data: g.ground, tolerance: 0.2 });
  map.addSource('fwy-3d', { type: 'geojson', data: g.solid, tolerance: 0.1 });
  const before = map.getLayer('buildings') ? 'buildings' : undefined;
  map.addLayer({ id: 'fwy-road', type: 'line', source: 'fwy-ground', minzoom: 8, layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': '#5E646B', 'line-width': fwyPx(['get', 'w']), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 12, 0.95] } }, before);
  map.addLayer({ id: 'fwy-edge', type: 'line', source: 'fwy-ground', minzoom: 13,
    paint: { 'line-color': '#EDEFF1', 'line-width': fwyPx(0.18), 'line-gap-width': fwyPx(['-', ['get', 'w'], 1.4]), 'line-opacity': 0.9 } }, before);
  map.addLayer({ id: 'fwy-lane', type: 'line', source: 'fwy-ground', minzoom: 14, filter: ['>=', ['get', 'lanes'], 2],
    paint: { 'line-color': '#F4F5F6', 'line-width': fwyPx(0.15), 'line-dasharray': [20, 30], 'line-opacity': 0.85 } }, before);
  const solidBefore = map.getLayer('light-glow') ? 'light-glow' : undefined;
  map.addLayer({ id: 'fwy-3d', type: 'fill-extrusion', source: 'fwy-3d', minzoom: 11.5,
    paint: { 'fill-extrusion-color': ['match', ['get', 'kind'], 'deck', '#6E757C', 'rail', '#D4D7DA', 'mark', '#F6F7F8', 'pier', '#B9BDC1', '#888'],
      'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-vertical-gradient': false,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, 1] } }, solidBefore);
}
// 示範資料：沿國道客運示範路線（台北—台中）兩個方向各一條，中間一段做成高架
function demoFreeway() {
  const line = [[121.517, 25.049], [121.47, 25.06], [121.40, 25.04], [121.30, 25.01], [121.21, 24.95], [121.13, 24.88], [121.02, 24.80], [120.93, 24.70], [120.86, 24.59], [120.79, 24.47], [120.72, 24.30], [120.68, 24.17]];
  // 加密後切成三段：地面、高架、地面
  const dense = [];
  for (let i = 1; i < line.length; i++) for (let t = 0; t < 1; t += 0.05) dense.push([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]);
  dense.push(line[line.length - 1]);
  const ways = [];
  const enc = (pts, off) => { const xy = fwyOffset(pts.map(([a, b]) => bxy(a, b)), off).map(([x, y]) => bll(x, y)); const q = xy.map(([a, b]) => [Math.round(a * 1e5), Math.round(b * 1e5)]); const out = [q[0][0], q[0][1]]; for (let i = 1; i < q.length; i++) out.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return out; };
  const cut = [0, 40, 80, dense.length - 1];
  let node = 0;
  for (const dir of [0, 1]) {
    const pts = dir ? dense.slice().reverse() : dense, n0 = node;
    for (let k = 0; k < 3; k++) ways.push(['國1', k === 1 ? 2 : 0, 1, 3, n0 + k, n0 + k + 1, ...enc(pts.slice(cut[k], cut[k + 1] + 1), 9)]);
    node += 4;
  }
  return { ways };
}
async function loadFreeway() {
  let j = null;
  if (/[?&]busdemo\b/.test(location.search)) j = demoFreeway();
  else {
    try { const r = await fetch('data/freeway.json'); if (r.ok) j = await r.json(); } catch {}
  }
  FWY.done = true;
  if (!j) return;
  indexFreeway(decodeFreeway(j));
  FWY.ready = true;
  addFreewayLayers();
}
loadFreeway();
(function waitMap() { if (S.mapReady && FWY.ready) addFreewayLayers(); else if (!(FWY.done && !FWY.ready)) setTimeout(waitMap, 500); })();
