/* ===== 場景：3D 車廂模型、跟車視角、光線與天氣 ===== */

/* ---------- 車廂造型 ----------
   依實際車型的編組、車長、車寬與塗裝。單位公尺；寬高略為放大，遠看也認得出來。
   body 車身、stripe/stripe2 腰帶、roof 車頂、nose 車頭流線段長度、cab 車頭色（無則同車身） */
const EX = 1.3;
const LIFT = 0.6;
const LIVERY = {
  THSR:     { n:12, len:25,   w:3.38, h:3.65, gap:0.5, nose:10,  body:'#F3F4F1', stripe:'#F07F1F', stripe2:'#1E3A6E', roof:'#D9DCDF', name:'700T' },
  TEMU2000: { n:8,  len:20,   w:2.9,  h:3.6,  gap:0.6, nose:4.5, body:'#F4F4F2', stripe:'#E8452C', stripe2:'#E8452C', roof:'#C9CDD1', cab:'#E8452C', name:'普悠瑪' },
  TEMU1000: { n:8,  len:20,   w:2.9,  h:3.6,  gap:0.6, nose:4,   body:'#F4F4F2', stripe:'#C8102E', stripe2:'#9AA3AD', roof:'#C9CDD1', cab:'#C8102E', name:'太魯閣' },
  EMU3000:  { n:12, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:3.5, body:'#F2F3F1', stripe:'#F26A21', stripe2:'#2B2F36', roof:'#C9CDD1', cab:'#2B2F36', name:'EMU3000' },
  E1000:    { n:12, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:3,   body:'#F2F3F1', stripe:'#E2752B', stripe2:'#E2752B', roof:'#B9BEC4', cab:'#E2752B', name:'推拉式' },
  CHUKUANG: { n:10, len:20,   w:2.9,  h:3.6,  gap:0.7, nose:0,   body:'#E8833A', stripe:'#FFFFFF', stripe2:'#FFFFFF', roof:'#8D8F93', name:'莒光' },
  EMU900:   { n:10, len:20,   w:2.9,  h:3.6,  gap:0.6, nose:2,   body:'#E9ECEF', stripe:'#F2C230', stripe2:'#2D5BA8', roof:'#B9BEC4', cab:'#2D5BA8', name:'EMU900' },
  TRTC:     { n:6,  len:23.5, w:3.2,  h:3.6,  gap:0.5, nose:1.5, body:'#C9CED3', roof:'#A9AFB5', name:'高運量' },
  TRTC_BR:  { n:4,  len:13.7, w:2.5,  h:3.3,  gap:0.5, nose:1.5, body:'#E9EBEC', roof:'#B4BAC0', name:'中運量' },
  TRTC_Y:   { n:4,  len:22,   w:2.65, h:3.5,  gap:0.5, nose:2,   body:'#D9DDE0', roof:'#B4BAC0', name:'中運量' },
  TYMC:     { n:5,  len:22,   w:3.0,  h:3.6,  gap:0.5, nose:2.5, body:'#D3D7DB', roof:'#A9AFB5', name:'機捷' },
  TMRT:     { n:2,  len:22,   w:2.9,  h:3.6,  gap:0.5, nose:2.5, body:'#E4E8EB', roof:'#B4BAC0', name:'台中捷運' },
  KRTC:     { n:3,  len:23.5, w:3.2,  h:3.6,  gap:0.5, nose:1.5, body:'#C9CED3', roof:'#A9AFB5', name:'高雄捷運' },
  LRT:      { n:5,  len:6.8,  w:2.65, h:3.4,  gap:0,   nose:1.5, body:'#F1F3F1', roof:'#7CBD52', name:'輕軌' },
};
function liveryOf(trip) {
  if (trip.sys === 'THSR') return LIVERY.THSR;
  if (trip.sys === 'TRA') {
    if (trip.type === '莒光') return LIVERY.CHUKUANG;
    if (trip.car && trip.car.startsWith('TEMU2000') || trip.type === '普悠瑪') return LIVERY.TEMU2000;
    if (trip.car && trip.car.startsWith('TEMU1000') || trip.type === '太魯閣') return LIVERY.TEMU1000;
    if (trip.car && /推拉|E1000/.test(trip.car)) return LIVERY.E1000;
    if (trip.type === '自強' || (trip.car && trip.car.startsWith('EMU3000'))) return LIVERY.EMU3000;
    return LIVERY.EMU900;
  }
  const id = trip.line && trip.line.id;
  if (trip.sys === 'TRTC') return id === 'BR' ? LIVERY.TRTC_BR : id === 'Y' ? LIVERY.TRTC_Y : LIVERY.TRTC;
  if (trip.sys === 'KRTC' && id === 'KC') return LIVERY.LRT;
  return LIVERY[trip.sys] || LIVERY.TRTC;
}
const trainLength = trip => { const L = liveryOf(trip); return (L.n * L.len + (L.n - 1) * L.gap) / 1000; };

/* 沿著列車行駛路徑取第 km 公里處的點（投影座標，單位公里） */
function trackPoint(trip, km) {
  const c = trip.cum, n = c.length;
  if (km <= 0) { const p = segPoint(trip.nodes[0], trip.nodes[1], 0); return { x: p.x + Math.cos(p.heading) * km, y: p.y + Math.sin(p.heading) * km, heading: p.heading }; }
  if (km >= c[n - 1]) { const p = segPoint(trip.nodes[n - 2], trip.nodes[n - 1], 1), d = km - c[n - 1]; return { x: p.x + Math.cos(p.heading) * d, y: p.y + Math.sin(p.heading) * d, heading: p.heading }; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= km) lo = mid; else hi = mid; }
  const span = c[hi] - c[lo] || 1e-9;
  return segPoint(trip.nodes[lo], trip.nodes[hi], (km - c[lo]) / span);
}

/* 把一列車拆成多節車廂的 3D 方塊：車身、窗帶、腰帶、車頂，車頭做成流線收窄 */
function carFeatures(trip, pos, P, out, detail) {
  const L = liveryOf(trip);
  const w = L.w * EX / 1000, h = L.h * EX;
  const winColor = '#141C26', paneColor = P.lit ? P.winLit : '#3A5068';
  const quad = (a, b, wa, wb) => {
    const ca = Math.cos(a.heading), sa = Math.sin(a.heading), cb = Math.cos(b.heading), sb = Math.sin(b.heading);
    // 前後兩端各自用當地的軌道方向算出左右兩點，彎道上車廂也貼著軌道
    const r = [unproj(a.x - sa * wa, a.y + ca * wa), unproj(b.x - sb * wb, b.y + cb * wb), unproj(b.x + sb * wb, b.y - cb * wb), unproj(a.x + sa * wa, a.y - ca * wa)];
    r.push(r[0]); return [r];
  };
  // 3D 方塊整體抬高 0.6 公尺，避免與地形表面深度衝突（手機上特別明顯）；b 仍記原始值，b=0 代表車身底面
  const add = (geom, base, top, color) => out.push({ type: 'Feature', properties: { b: base, b3: base + LIFT, t: top + LIFT, c: color }, geometry: { type: 'Polygon', coordinates: geom } });
  let km = pos.km;
  const total = trip.cum[trip.cum.length - 1];
  for (let i = 0; i < L.n; i++) {
    const front = km, back = km - L.len / 1000;
    km = back - L.gap / 1000;
    const lead = i === 0, tail = i === L.n - 1;
    const nose = L.nose / 1000;
    const f = trackPoint(trip, Math.min(front, total + 0.02)), bk = trackPoint(trip, back);
    // 車身主體（去掉車頭流線段）
    const bodyF = lead && nose ? trackPoint(trip, front - nose) : f;
    const bodyB = tail && nose ? trackPoint(trip, back + nose) : bk;
    add(quad(bodyF, bodyB, w / 2, w / 2), 0, h, L.body);
    // 窗帶與腰帶：比車身寬一點點，蓋在側面
    const iw = w / 2 + 0.00008;
    add(quad(bodyF, bodyB, iw, iw), h * 0.56, h * 0.8, winColor);
    // 近看時把窗帶切成一格格車窗，夜裡會亮
    if (detail) {
      const span = (front - back) - (lead && nose ? nose : 0) - (tail && nose ? nose : 0);
      const k0 = back + (tail && nose ? nose : 0), nw = Math.max(2, Math.round(span * 1000 / 2.6));
      for (let k = 0; k < nw; k++) {
        const a = trackPoint(trip, k0 + span * (k + 0.18) / nw), b = trackPoint(trip, k0 + span * (k + 0.82) / nw);
        add(quad(b, a, iw + 0.00003, iw + 0.00003), h * 0.6, h * 0.77, paneColor);
      }
    }
    if (L.stripe) add(quad(bodyF, bodyB, iw + 0.00002, iw + 0.00002), h * 0.4, h * 0.5, L.stripe);
    if (L.stripe2) add(quad(bodyF, bodyB, iw + 0.00002, iw + 0.00002), h * 0.33, h * 0.37, L.stripe2);
    add(quad(bodyF, bodyB, w * 0.36, w * 0.36), h, h * 1.07, L.roof);
    if (!L.stripe && trip.color) add(quad(bodyF, bodyB, iw + 0.00002, iw + 0.00002), h * 0.42, h * 0.52, trip.color);
    // 車頭流線：分兩段逐漸變矮變窄
    const capColor = L.cab || L.body;
    // 三段逐漸變矮變窄，模仿車鼻斜面；第一段上方是駕駛室窗
    const NOSE = [[0, 1, 0.5, 0.88], [0.4, 0.88, 0.44, 0.62], [0.72, 0.62, 0.2, 0.36]]; // [起點比例, 起點寬, 終點寬, 高]
    if (lead && nose) NOSE.forEach(([u, w0, w1, hh], j) => {
      const a = trackPoint(trip, front - nose * (1 - u)), b = trackPoint(trip, front - nose * (1 - (NOSE[j + 1] ? NOSE[j + 1][0] : 1)));
      add(quad(b, a, w * w1 / 2, w * w0 / 2), 0, h * hh, j ? capColor : L.body);
      if (!j) add(quad(b, a, w * w1 / 2 + 0.00004, w * w0 / 2 + 0.00004), h * 0.6, h * 0.82, winColor);
    });
    if (tail && nose && L.n > 1) NOSE.forEach(([u, w0, w1, hh], j) => {
      const a = trackPoint(trip, back + nose * (1 - u)), b = trackPoint(trip, back + nose * (1 - (NOSE[j + 1] ? NOSE[j + 1][0] : 1)));
      add(quad(a, b, w * w0 / 2, w * w1 / 2), 0, h * hh, j ? capColor : L.body);
    });
  }
}

/* ---------- 跟車視角 ---------- */
const VIEWS = [
  { id: 'persp', name: '透視' },
  { id: 'chase', name: '追車' },
  { id: 'cab', name: '車頭' },
  { id: 'side', name: '側拍' },
  { id: 'orbit', name: '環繞' },
  { id: 'trackside', name: '路邊' },
  { id: 'aerial', name: '空拍' },
];
const M = 0.001; // 1 公尺 = 0.001 公里
const offsetPt = (p, along, side) => {
  const c = Math.cos(p.heading), s = Math.sin(p.heading);
  return { x: p.x + c * along - s * side, y: p.y + s * along + c * side };
};

/* ---------- 光線：依時間在幾個關鍵色票之間平滑內插 ---------- */
const PALETTES = {
  night: { sea:'#050A12', land:'#0F1822', edge:'#1C2733', water:'#06101B', wood:'#0F1D1A', road:'#1D2A37', bld:'#1D3550', bldEdge:'#4A7FB5',
    hsShadow:'#000000', hsHigh:'#3A4C60', hsAccent:'#0A121B', label:'#8FA0AE', halo:'#050A12',
    sky:'#081222', horizon:'#1C2B40', fog:'#0B1320', tra:'#A9BCCD', light:'#7C8FB0', glow:0.6, lightI:0.25 },
  dawn: { sea:'#2A3348', land:'#3A3540', edge:'#4A4452', water:'#2C3650', wood:'#2E3A35', road:'#4D4652', bld:'#5A5070', bldEdge:'#B39AC8',
    hsShadow:'#1A1424', hsHigh:'#E0A27E', hsAccent:'#382A3A', label:'#E6D2C6', halo:'#241E28',
    sky:'#5B5A86', horizon:'#F2A97A', fog:'#7A6070', tra:'#F0E2D4', light:'#FFB98A', glow:0.35, lightI:0.4 },
  day: { sea:'#8EB2C7', land:'#DCDDD0', edge:'#C3C4B4', water:'#86AAC0', wood:'#BFCDB0', road:'#F4F2EA', bld:'#B9C7D6', bldEdge:'#6F8CA8',
    hsShadow:'#4E5C55', hsHigh:'#FFFFFF', hsAccent:'#7D8B80', label:'#3B4650', halo:'#F4F2EA',
    sky:'#6FA8D8', horizon:'#E2ECF0', fog:'#DCE6EA', tra:'#3F4E5E', light:'#FFFFFF', glow:0.15, lightI:0.3 },
  dusk: { sea:'#1F2438', land:'#30293A', edge:'#433A4E', water:'#222A46', wood:'#283029', road:'#4A3F4E', bld:'#4A3E5E', bldEdge:'#A389C2',
    hsShadow:'#140E1A', hsHigh:'#D98A62', hsAccent:'#2E2232', label:'#E2CFC6', halo:'#1C1820',
    sky:'#3E3560', horizon:'#F08A5A', fog:'#4E3A4A', tra:'#EADCCF', light:'#FF9E6A', glow:0.4, lightI:0.4 },
};
// 一天中的關鍵時刻（小時 → 色票）
const TOD_KEYS = [[0, 'night'], [4.9, 'night'], [5.7, 'dawn'], [6.8, 'day'], [16.8, 'day'], [17.7, 'dusk'], [18.7, 'night'], [24, 'night']];
const TOD_FIXED = { day: 11, dusk: 17.7, night: 22, dawn: 5.7 };
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
function paletteAt(hour, wx) {
  let i = 0; while (i < TOD_KEYS.length - 2 && TOD_KEYS[i + 1][0] <= hour) i++;
  const [h0, k0] = TOD_KEYS[i], [h1, k1] = TOD_KEYS[i + 1];
  const t = h1 > h0 ? Math.min(1, Math.max(0, (hour - h0) / (h1 - h0))) : 0;
  const A = PALETTES[k0], B = PALETTES[k1], P = {};
  for (const k in A) P[k] = typeof A[k] === 'number' ? A[k] + (B[k] - A[k]) * t : mixHex(A[k], B[k], t);
  // 天氣：雲越厚越灰、越暗
  const W = WEATHER[wx] || WEATHER.clear;
  const dayness = hour > 6 && hour < 18 ? 1 : 0.3;
  const grey = mixHex('#1B2027', '#9AA3AB', dayness);
  for (const k of ['sea', 'land', 'water', 'wood', 'road', 'bld', 'hsHigh', 'sky', 'horizon', 'fog', 'light']) P[k] = mixHex(P[k], grey, W.grey);
  if (W.dark) for (const k of ['sea', 'land', 'water', 'wood', 'road', 'bld', 'sky', 'horizon']) P[k] = mixHex(P[k], '#000000', W.dark);
  P.fogBlend = W.fogBlend; P.lightI *= 1 - W.grey * 0.5;
  P.lit = P.glow > 0.3 || W.dark > 0.25;
  P.winLit = '#FFF0B8';
  return P;
}

/* ---------- 天氣 ---------- */
const WEATHER = {
  clear:  { name: '晴',   icon: '☀', grey: 0,    dark: 0,    fogBlend: 0.55, rain: 0,   fog: 0 },
  cloudy: { name: '多雲', icon: '☁', grey: 0.35, dark: 0.05, fogBlend: 0.4,  rain: 0,   fog: 0.08 },
  rain:   { name: '雨',   icon: '☂', grey: 0.5,  dark: 0.15, fogBlend: 0.25, rain: 0.55, fog: 0.15 },
  storm:  { name: '雷雨', icon: '⛈', grey: 0.6,  dark: 0.3,  fogBlend: 0.18, rain: 1,   fog: 0.2, flash: true },
  fog:    { name: '霧',   icon: '🌫', grey: 0.55, dark: 0.05, fogBlend: 0.04, rain: 0,   fog: 0.55 },
};
// Open-Meteo（免金鑰）WMO 天氣代碼對應
function wmoToWx(code, cloud) {
  if (code >= 95) return 'storm';
  if (code >= 51 && code <= 82) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2 || cloud > 60) return 'cloudy';
  return 'clear';
}
const RealWeather = {
  cache: new Map(), // 0.25 度格點 → {wx, temp, at}
  async at(lon, lat) {
    const key = `${(Math.round(lat * 4) / 4).toFixed(2)},${(Math.round(lon * 4) / 4).toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60e3) return hit;
    const [la, lo] = key.split(',');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=weather_code,cloud_cover,temperature_2m&timezone=Asia%2FTaipei`);
    if (!r.ok) throw new Error('天氣資料 ' + r.status);
    const c = (await r.json()).current;
    const v = { wx: wmoToWx(c.weather_code, c.cloud_cover), temp: Math.round(c.temperature_2m), at: Date.now() };
    this.cache.set(key, v);
    return v;
  },
};

/* 雨滴與閃電：畫在地圖上方的透明畫布 */
const Precip = (() => {
  let cv = null, ctx = null, drops = [], level = 0, flash = 0, nextFlash = 0, night = false;
  function resize() { if (!cv) return; const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  function init() {
    cv = document.getElementById('precip'); ctx = cv.getContext('2d');
    addEventListener('resize', resize); resize();
  }
  function set(l, isNight, storm) {
    level = l; night = isNight; Precip.storm = storm;
    const want = Math.round(l * 420);
    while (drops.length < want) drops.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 900 + Math.random() * 700, l: 10 + Math.random() * 16 });
    drops.length = want;
  }
  function step(dt, now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (Precip.storm && now > nextFlash) { flash = 1; nextFlash = now + 6000 + Math.random() * 14000; }
    if (flash > 0) { ctx.fillStyle = `rgba(220,228,255,${flash * 0.35})`; ctx.fillRect(0, 0, innerWidth, innerHeight); flash = Math.max(0, flash - dt / 260); }
    if (!drops.length) return;
    ctx.strokeStyle = night ? 'rgba(170,190,215,.32)' : 'rgba(225,235,245,.45)';
    ctx.lineWidth = 1; ctx.beginPath();
    const s = dt / 1000;
    for (const d of drops) {
      d.y += d.v * s; d.x -= d.v * s * 0.18;
      if (d.y > innerHeight) { d.y = -d.l; d.x = Math.random() * (innerWidth + 200); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
    }
    ctx.stroke();
  }
  return { init, set, step, storm: false };
})();

/* 車頭燈與尾燈的位置（貼地的光暈，遠看就是一列車的頭尾） */
function trainLights(trip, pos, out) {
  const len = trainLength(trip);
  out.push({ type: 'Feature', properties: { c: '#FFF4D6', k: 1, idx: trip.idx }, geometry: { type: 'Point', coordinates: (p => unproj(p.x, p.y))(trackPoint(trip, pos.km + 0.004)) } });
  out.push({ type: 'Feature', properties: { c: '#FF3B30', k: 0.55, idx: trip.idx }, geometry: { type: 'Point', coordinates: (p => unproj(p.x, p.y))(trackPoint(trip, pos.km - len - 0.002)) } });
}
