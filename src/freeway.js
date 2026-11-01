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
    const nl = Math.max(1, Math.min(6, lanes || (link ? 1 : 2)));
    ways.push({ ref, link, br: !!(flags & 2), bridge: false, tunnel, layer: Math.max(1, layer || 1), lanes: nl, a, z, ll, xy, cum, len: cum[cum.length - 1],
      W: nl * 3.6 + (link ? 1.8 : 3.4), H: 0, hA: 0, hZ: 0, rA: 0, rZ: 0 });
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
  fwyHeights(ways);
}
/* 高度：
   - OSM 常把一條高架切成很多短段，所以把相連的橋段併成一組；整組夠長（300 公尺以上）或有多層才架高，
     過河、跨路的短橋和路面同高。
   - 每個端點的高度取接在那裡的主線最低者（沒有主線才看匝道），路段兩端往端點高度做平滑的坡，
     高架起訖、上下層交會、匝道上下高架都是連續的斜坡，不會一階一階。 */
function fwyHeights(ways) {
  const ends = new Map(), add = (n, w) => { if (n < 0) return; if (!ends.has(n)) ends.set(n, []); ends.get(n).push(w); };
  for (const w of ways) { add(w.a, w); add(w.z, w); }
  const seen = new Set();
  for (const w0 of ways) {
    if (!w0.br || seen.has(w0)) continue;
    const comp = [], stack = [w0]; seen.add(w0);
    while (stack.length) {
      const w = stack.pop(); comp.push(w);
      for (const n of [w.a, w.z]) for (const o of ends.get(n) || []) if (o.br && !seen.has(o)) { seen.add(o); stack.push(o); }
    }
    const len = comp.reduce((t, w) => t + w.len, 0), multi = comp.some(w => w.layer >= 2);
    if (len >= 300 || multi) for (const w of comp) { w.bridge = true; w.H = FWY_DECK * w.layer; }
  }
  const nodeH = (n, w) => {
    const list = ends.get(n) || [];
    if (list.length < 2) return w.H;              // 資料邊界：不做坡
    const main = list.filter(o => !o.link), use = main.length ? main : list;
    return Math.min(...use.map(o => o.H));
  };
  for (const w of ways) {
    w.hA = nodeH(w.a, w); w.hZ = nodeH(w.z, w);
    const R = dh => Math.min(w.len / 2.2, Math.max(60, Math.abs(dh) * 38));
    w.rA = w.hA !== w.H ? R(w.H - w.hA) : 0; w.rZ = w.hZ !== w.H ? R(w.H - w.hZ) : 0;
    w.flat = !w.H && !w.hA && !w.hZ;
  }
}
// 路段上距起點 s 公尺處的橋面高度
function fwyAlt(w, s) {
  if (w.flat) return 0;
  const ss = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  let h = w.H;
  if (w.rA && s < w.rA) h = w.hA + (w.H - w.hA) * ss(s / w.rA);
  else if (w.rZ && s > w.len - w.rZ) h = w.hZ + (w.H - w.hZ) * ss((w.len - s) / w.rZ);
  return h;
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
function fwyNext(w) {
  const nexts = (FWY.starts.get(w.z) || []).map(i => FWY.ways[i]).filter(o => o !== w);
  if (!nexts.length) return null;
  const endH = fwyPoint(w, w.len).h;
  const cost = o => o.link * 50 + (o.ref !== w.ref) * 20 + angGap(fwyPoint(o, 0).h, endH);
  nexts.sort((p, q) => cost(p) - cost(q));
  return nexts[0];
}
function fwyAdvance(k, s, dist) {
  let w = FWY.ways[k], guard = 0;
  s += dist;
  while (s > w.len && guard++ < 40) {
    const n = fwyNext(w);
    if (!n) { s = w.len; break; }
    s -= w.len; w = n; k = FWY.ways.indexOf(w);
  }
  return { w: k, s, ...fwyPoint(w, s) };
}
// 沿路網從 (k0, s0) 走到 (k1, s1) 的距離；同一路段在後面時為負；max 公尺內接不到就回傳 null
function fwyGap(k0, s0, k1, s1, max) {
  if (k0 === k1) return s1 - s0;
  let w = FWY.ways[k0], d = w.len - s0, guard = 0;
  while (d < max && guard++ < 40) {
    const n = fwyNext(w); if (!n) return null;
    if (FWY.ways.indexOf(n) === k1) return d + s1;
    d += n.len; w = n;
  }
  return null;
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
// 地面路段（整段都在地面）用地圖的線圖層畫
function fwyGround(ways) {
  const features = [];
  for (const w of ways) if (w.flat && !w.tunnel) features.push({ type: 'Feature', properties: { w: w.W, lanes: w.lanes }, geometry: { type: 'LineString', coordinates: w.ll } });
  return { type: 'FeatureCollection', features };
}
/* ---------- 高架與引道：WebGL 網格 ----------
   地圖的 fill-extrusion 只能畫平頂的柱體，坡道只能切成一階一階。這裡自己算三角形：
   橋面隨高度連續傾斜，兩側有橋面版側邊、護欄、白線、車道虛線，下方有橋墩與帽梁。
   全台的高架依 4 公里的格子分組，只建、只畫鏡頭附近的格子（和飛機、客運共用 planes3d 圖層）。 */
const FWY_CELL3D = 4000;
const FWY_COL = { top: '#666C73', side: '#AEB3B8', under: '#8C9196', rail: '#D7DADD', railIn: '#C4C8CC', mark: '#F3F4F5', pier: '#B8BCC0', cap: '#A9AEB3' };
function fwyCells() {
  const cells = new Map();
  for (const w of FWY.ways) {
    if (w.flat || w.tunnel) continue;
    const [x, y] = w.xy[0], key = Math.floor(x / FWY_CELL3D) + ',' + Math.floor(y / FWY_CELL3D);
    if (!cells.has(key)) cells.set(key, { key, ways: [], x0: (Math.floor(x / FWY_CELL3D) + 0.5) * FWY_CELL3D, y0: (Math.floor(y / FWY_CELL3D) + 0.5) * FWY_CELL3D });
    cells.get(key).ways.push(w);
  }
  for (const c of cells.values()) {
    c.ll = bll(c.x0, c.y0);
    let r = 0; for (const w of c.ways) for (const [x, y] of w.xy) r = Math.max(r, Math.hypot(x - c.x0, y - c.y0));
    c.r = r + 50;
  }
  return [...cells.values()];
}
function fwyCellMesh(cell) {
  const P = [], N = [], C = [], hex = {};
  for (const k in FWY_COL) hex[k] = PlaneGL.hex(FWY_COL[k]);
  // bxy（北為 +y）換成網格的本地座標：x 往東、y 往南（公尺，以格子中心的經緯度為準）
  const [lon0, lat0] = cell.ll, cx = 111320 * Math.cos(lat0 / DEG);
  const loc = (x, y, z) => [(x / BKX + 121 - lon0) * cx, -(y / BKY + 23.7 - lat0) * 111320, z];
  const tri = (a, b, c, col, nz) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(q => q / l);
    if (nz && n[2] * nz < 0) n = n.map(q => -q);
    for (const p of [a, b, c]) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(col[0], col[1], col[2]); }
  };
  const quad = (a, b, c, d, col, nz) => { tri(a, b, c, col, nz); tri(a, c, d, col, nz); };
  for (const w of cell.ways) {
    // 取樣：原有的折點，加上坡道內每 8 公尺一點
    const ss = new Set(w.cum.map(v => +v.toFixed(2)));
    for (let t = 0; t < w.rA; t += 8) ss.add(t);
    for (let t = w.len - w.rZ; t < w.len; t += 8) if (t > 0) ss.add(+t.toFixed(2));
    const S = [...ss].filter(v => v >= 0 && v <= w.len).sort((p, q) => p - q);
    const pts = S.map(s => { const p = fwyPoint(w, s); return { s, x: p.x, y: p.y, h: fwyAlt(w, s) }; });
    // 每個取樣點的左右法向量（轉角取平均）
    for (let i = 0; i < pts.length; i++) {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
      let dx = q.x - p.x, dy = q.y - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      pts[i].rx = dy; pts[i].ry = -dx; pts[i].fx = dx; pts[i].fy = dy;
    }
    const hw = w.W / 2;
    const at = (p, off, dz) => loc(p.x + p.rx * off, p.y + p.ry * off, p.h + dz);
    const thick = p => Math.min(1.6, Math.max(0.05, p.h));
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (p.h < 0.03 && q.h < 0.03) {
        // 貼地的一小段：只畫路面
        quad(at(p, -hw, 0.02), at(p, hw, 0.02), at(q, hw, 0.02), at(q, -hw, 0.02), hex.top, 1);
        continue;
      }
      quad(at(p, -hw, 0), at(p, hw, 0), at(q, hw, 0), at(q, -hw, 0), hex.top, 1);                         // 橋面
      quad(at(p, -hw, -thick(p)), at(q, -hw, -thick(q)), at(q, hw, -thick(q)), at(p, hw, -thick(p)), hex.under, -1); // 底面
      for (const sd of [-1, 1]) {
        const o = sd * hw, oi = sd * (hw - 0.35);
        quad(at(p, o, -thick(p)), at(q, o, -thick(q)), at(q, o, 0), at(p, o, 0), hex.side);              // 橋面版側邊
        quad(at(p, o, 0), at(q, o, 0), at(q, o, 1.0), at(p, o, 1.0), hex.rail);                          // 護欄外側
        quad(at(p, oi, 0), at(q, oi, 0), at(q, oi, 1.0), at(p, oi, 1.0), hex.railIn);                    // 護欄內側
        quad(at(p, oi, 1.0), at(q, oi, 1.0), at(q, o, 1.0), at(p, o, 1.0), hex.rail, 1);                // 護欄頂
        const m0 = sd * (hw - 0.75), m1 = sd * (hw - 0.6);
        quad(at(p, m0, 0.03), at(q, m0, 0.03), at(q, m1, 0.03), at(p, m1, 0.03), hex.mark, 1);           // 路肩白線
      }
      // 車道虛線：4 公尺線、6 公尺空
      const segL = q.s - p.s;
      if (w.lanes > 1 && segL > 0.1) for (let k = 1; k < w.lanes; k++) {
        const off = -hw + 0.75 + (w.W - 1.5) * k / w.lanes;
        for (let d = Math.ceil(p.s / 10) * 10; d < q.s; d += 10) {
          const t0 = (d - p.s) / segL, t1 = Math.min(1, (d + 4 - p.s) / segL);
          const lp = t => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, h: p.h + (q.h - p.h) * t, rx: p.rx, ry: p.ry });
          const A = lp(t0), B = lp(t1);
          quad(at(A, off - 0.08, 0.03), at(B, off - 0.08, 0.03), at(B, off + 0.08, 0.03), at(A, off + 0.08, 0.03), hex.mark, 1);
        }
      }
    }
    // 橋墩與帽梁：每 34 公尺一組，夠高才畫
    for (let s = 17; s < w.len; s += 34) {
      const fp = fwyPoint(w, s), h = fwyAlt(w, s); if (h < 3) continue;
      const fx = Math.sin(fp.h / DEG), fy = Math.cos(fp.h / DEG), rx = fy, ry = -fx;
      const box = (along, across, z0, z1, col) => {
        const c = (a, b, z) => loc(fp.x + fx * a + rx * b, fp.y + fy * a + ry * b, z);
        const A = along / 2, B = across / 2;
        const ring = [[-A, -B], [A, -B], [A, B], [-A, B]];
        for (let i = 0; i < 4; i++) { const [a1, b1] = ring[i], [a2, b2] = ring[(i + 1) % 4]; quad(c(a1, b1, z0), c(a2, b2, z0), c(a2, b2, z1), c(a1, b1, z1), col); }
        quad(c(-A, -B, z1), c(A, -B, z1), c(A, B, z1), c(-A, B, z1), col, 1);
      };
      const T = Math.min(1.6, h);
      box(1.6, Math.min(w.W * 0.3, 3.2), 0, h - T - 0.9, hex.pier);
      box(2.0, w.W * 0.78, h - T - 0.9, h - T, hex.cap);
    }
  }
  return { P: new Float32Array(P), N: new Float32Array(N), C: new Float32Array(C), n: P.length / 3 };
}
// 依鏡頭位置挑出附近的格子交給 planes3d 圖層；靜態網格不需要每格重畫
function fwyPickCells() {
  if (!FWY.cells || !S.mapReady) return;
  const z = map.getZoom();
  if (z < 11.5) { PlaneGL.stat = []; return; }
  const c = map.getCenter(), [x, y] = bxy(c.lng, c.lat), R = 2500 * Math.pow(2, 16 - Math.min(16, z)) + 4000 * Math.min(1, map.getPitch() / 60) * Math.pow(2, 15.5 - Math.min(15.5, z));
  PlaneGL.stat = FWY.cells.filter(cl => Math.hypot(cl.x0 - x, cl.y0 - y) < R + cl.r)
    .map(cl => ({ p: { alt: 0, h: 90, pitch: 0 }, ll: cl.ll, mesh: () => PlaneGL.meshFor('fwy|' + cl.key, () => fwyCellMesh(cl)) }));
}
// 公尺換成像素寬（緯度 23.7 度附近）
const fwyPx = m => ['interpolate', ['exponential', 2], ['zoom'], 8, ['*', m, 256 / (40075016.686 * Math.cos(23.7 / DEG) / 2 ** 8) * 2], 22, ['*', m, 256 / (40075016.686 * Math.cos(23.7 / DEG) / 2 ** 22) * 2]];
function addFreewayLayers() {
  if (!FWY.ready || !S.mapReady || map.getSource('fwy-ground')) return;
  map.addSource('fwy-ground', { type: 'geojson', data: fwyGround(FWY.ways), tolerance: 0.2 });
  const before = map.getLayer('buildings') ? 'buildings' : undefined;
  map.addLayer({ id: 'fwy-road', type: 'line', source: 'fwy-ground', minzoom: 8, layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': '#5E646B', 'line-width': fwyPx(['get', 'w']), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 12, 0.95] } }, before);
  map.addLayer({ id: 'fwy-edge', type: 'line', source: 'fwy-ground', minzoom: 13,
    paint: { 'line-color': '#EDEFF1', 'line-width': fwyPx(0.18), 'line-gap-width': fwyPx(['-', ['get', 'w'], 1.4]), 'line-opacity': 0.9 } }, before);
  map.addLayer({ id: 'fwy-lane', type: 'line', source: 'fwy-ground', minzoom: 14, filter: ['>=', ['get', 'lanes'], 2],
    paint: { 'line-color': '#F4F5F6', 'line-width': fwyPx(0.15), 'line-dasharray': [20, 30], 'line-opacity': 0.85 } }, before);
  FWY.cells = fwyCells();
  map.on('moveend', fwyPickCells); map.on('zoomend', fwyPickCells);
  let t = 0; map.on('move', () => { const n = performance.now(); if (n - t > 400) { t = n; fwyPickCells(); } });
  fwyPickCells(); map.triggerRepaint();
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
