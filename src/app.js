/* ===== 介面與地圖 ===== */
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
const fmtHMS = ms => { const d = new Date(ms + TW); return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(x => String(x).padStart(2, '0')).join(':'); };
const WEEK = '日一二三四五六';
const fmtDate = ms => { const d = new Date(ms + TW); return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日（${WEEK[d.getUTCDay()]}）`; };

/* ---------- 狀態 ---------- */
const S = {
  simMs: Date.now(), speed: 1, playing: true, live: true,
  filter: 'all', sel: null, // {kind:'train'|'station', trip|node}
  follow: false, lastFrame: performance.now(),
  view: { cx: 0, cy: 0, scale: 2 }, anim: null,
  positions: [], // [{trip,pos}]
  favs: new Set(store.get('favs', [])),
  boardTab: null,
};
const sysGroup = sys => SYSTEMS[sys].group;
const visible = sys => S.filter === 'all' || sysGroup(sys) === S.filter;

/* ---------- 地理底圖 ---------- */
const COUNTIES = GEO.c.map(c => {
  const path = new Path2D(); let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const r of c.r) {
    let qx = r[0], qy = r[1];
    for (let i = 0; i < r.length; i += 2) {
      if (i) { qx += r[i]; qy += r[i + 1]; }
      const [x, y] = proj(qy * GEO.q, qx * GEO.q);
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    path.closePath();
  }
  return { name: c.n, path, bbox: [minx, miny, maxx, maxy] };
});
const COUNTY_ORDER = '基隆市 台北市 新北市 桃園市 新竹市 新竹縣 苗栗縣 台中市 彰化縣 南投縣 雲林縣 嘉義市 嘉義縣 台南市 高雄市 屏東縣 宜蘭縣 花蓮縣 台東縣 澎湖縣 金門縣 連江縣'.split(' ');

const LINE_PATHS = LINES.map(L => {
  const p = new Path2D();
  L.nodes.forEach((n, i) => i ? p.lineTo(n.x, n.y) : p.moveTo(n.x, n.y));
  return { L, p };
});

/* 主要車站（低縮放時顯示名稱） */
const MAJOR = new Set('基隆 台北 桃園 中壢 新竹 苗栗 台中 彰化 斗六 嘉義 新營 台南 高雄 屏東 潮州 枋寮 台東 玉里 花蓮 宜蘭 羅東 瑞芳 蘇澳新 新左營 大甲 豐原 員林'.split(' '));

/* ---------- 畫布 ---------- */
const cv = $('#map'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);

let C = {};
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['sea','land','land-edge','county','ink','muted','faint','track','accent','label-halo','panel-solid','bad','warn','ok','gold'])
    C[k] = cs.getPropertyValue('--' + k).trim();
  C.dark = (cs.getPropertyValue('color-scheme') || '').includes('dark');
}
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(readTheme, 0));

const w2s = (x, y) => [(x - S.view.cx) * S.view.scale + W / 2, (y - S.view.cy) * S.view.scale + H / 2];
const s2w = (sx, sy) => [(sx - W / 2) / S.view.scale + S.view.cx, (sy - H / 2) / S.view.scale + S.view.cy];

function panelInset() {
  // 桌面版左側面板遮住的寬度，讓地圖置中時避開面板
  if (W > 760) return { left: 360, bottom: 80 };
  const p = $('#panel'); return { left: 0, bottom: p.hidden ? 70 : p.offsetHeight };
}
function fitBounds(minx, miny, maxx, maxy, maxScale = 60) {
  const ins = panelInset();
  const aw = W - ins.left - 40, ah = H - ins.bottom - 120;
  const scale = Math.min(maxScale, Math.max(0.5, Math.min(aw / (maxx - minx || 1), ah / (maxy - miny || 1))));
  const cx = (minx + maxx) / 2 - (ins.left / 2) / scale;
  const cy = (miny + maxy) / 2 + ((ins.bottom - 60) / 2) / scale;
  return { cx, cy, scale };
}
function flyTo(target, ms = 700) {
  S.anim = { from: { ...S.view }, to: target, t0: performance.now(), ms };
}
function centerOn(x, y, scale) {
  const ins = panelInset(); scale = scale || S.view.scale;
  return { cx: x - (ins.left / 2) / scale, cy: y + ((ins.bottom - 60) / 2) / scale, scale };
}

/* ---------- 繪製 ---------- */
function draw(now) {
  const v = S.view;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.sea; ctx.fillRect(0, 0, W, H);
  // 世界座標
  ctx.setTransform(DPR * v.scale, 0, 0, DPR * v.scale, DPR * (W / 2 - v.cx * v.scale), DPR * (H / 2 - v.cy * v.scale));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const c of COUNTIES) { ctx.fillStyle = C.land; ctx.fill(c.path); }
  ctx.strokeStyle = C['land-edge']; ctx.lineWidth = 1 / v.scale;
  for (const c of COUNTIES) ctx.stroke(c.path);

  // 路線
  const lw = px => px / v.scale;
  for (const { L, p } of LINE_PATHS) {
    if (!visible(L.sys)) continue;
    if (L.sys === 'TRA') {
      ctx.strokeStyle = C.track; ctx.lineWidth = lw(v.scale > 20 ? 3 : 2); ctx.globalAlpha = 0.9; ctx.stroke(p);
      if (v.scale > 14) { ctx.setLineDash([lw(1), lw(5)]); ctx.strokeStyle = C.sea; ctx.lineWidth = lw(1.2); ctx.stroke(p); ctx.setLineDash([]); }
      ctx.globalAlpha = 1;
    } else {
      const w = L.sys === 'THSR' ? 3 : (v.scale > 30 ? 4 : 2.5);
      if (C.dark) { ctx.strokeStyle = L.color; ctx.globalAlpha = 0.22; ctx.lineWidth = lw(w + 6); ctx.stroke(p); ctx.globalAlpha = 1; }
      ctx.strokeStyle = L.color; ctx.lineWidth = lw(w); ctx.stroke(p);
    }
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // 車站
  const labels = [];
  const occupied = [];
  const free = (x, y, w, h) => { for (const r of occupied) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false; occupied.push([x, y, w, h]); return true; };
  const pad = 40;
  for (const n of NODES) {
    if (!visible(n.sys)) continue;
    const [sx, sy] = w2s(n.x, n.y);
    if (sx < -pad || sy < -pad || sx > W + pad || sy > H + pad) continue;
    const isMRT = sysGroup(n.sys) === 'mrt';
    let show = false, r = 0, label = false;
    if (n.sys === 'THSR') { show = true; r = 3.5; label = v.scale > 2.2; }
    else if (n.sys === 'TRA') { show = v.scale > 3.5 || MAJOR.has(n.name); r = MAJOR.has(n.name) ? 2.6 : 2; label = MAJOR.has(n.name) ? v.scale > 1.6 : (TZE_STOPS.has(n.name) ? v.scale > 7 : v.scale > 16); }
    else { show = v.scale > 7; r = 2.2; label = v.scale > 28 || (n.lines.size > 1 && v.scale > 16); }
    if (!show) continue;
    const fav = S.favs.has(n.id), selected = S.sel && S.sel.kind === 'station' && S.sel.node === n;
    ctx.beginPath(); ctx.arc(sx, sy, r + (selected ? 3 : 0), 0, Math.PI * 2);
    ctx.fillStyle = C['panel-solid']; ctx.fill();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeStyle = fav ? C.gold : (n.sys === 'THSR' ? '#F07F1F' : isMRT ? [...n.lines].length > 1 ? C.ink : LINES.find(L => L.sys === n.sys && L.nodes.includes(n)).color : C.ink);
    ctx.stroke();
    if (label || selected || fav) labels.push({ n, sx, sy, r, prio: selected ? 0 : fav ? 1 : n.sys === 'THSR' ? 2 : MAJOR.has(n.name) ? 3 : 4 });
  }

  // 列車
  const trainR = Math.max(3.6, Math.min(7.5, 2.4 + v.scale * 0.18));
  const drawn = [];
  for (const { trip, pos } of S.positions) {
    if (!visible(trip.sys)) continue;
    const [sx, sy] = w2s(pos.x, pos.y);
    if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
    drawn.push([trip, pos, sx, sy]);
  }
  // 選取列車最後畫，在最上層
  drawn.sort((a, b) => (S.sel && S.sel.trip === a[0]) - (S.sel && S.sel.trip === b[0]));
  for (const [trip, pos, sx, sy] of drawn) {
    const isSel = S.sel && S.sel.trip === trip;
    const isMRT = sysGroup(trip.sys) === 'mrt';
    const len = trip.sys === 'THSR' ? trainR * 2.6 : isMRT ? trainR * 1.5 : trainR * 2.1;
    const wid = isMRT ? trainR * 1.25 : trainR * 1.45;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(pos.heading);
    if (C.dark || isSel) {
      ctx.globalAlpha = isSel ? 0.35 : 0.18; ctx.fillStyle = trip.color;
      ctx.beginPath(); ctx.arc(0, 0, len * (isSel ? 1.3 : 0.9), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, wid / 2);
    ctx.fillStyle = trip.color; ctx.fill();
    ctx.lineWidth = isSel ? 2.2 : 1.2; ctx.strokeStyle = isSel ? C.ink : C['panel-solid']; ctx.stroke();
    // 車頭
    ctx.beginPath(); ctx.arc(len / 2 - wid / 2, 0, wid * 0.22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.restore();
    if (trip.delay >= 5 && trip.sys === 'TRA' && v.scale > 2.5) {
      ctx.beginPath(); ctx.arc(sx + len / 2, sy - wid, 2.6, 0, Math.PI * 2); ctx.fillStyle = C.bad; ctx.fill();
    }
    if ((v.scale > 9 && trip.no) || isSel) {
      const txt = trip.no ? (trip.sys === 'THSR' ? trip.no : trip.type.slice(0, 2) + ' ' + trip.no) : trip.type;
      labels.push({ text: txt, sx: sx + len / 2 + 4, sy: sy - wid - 2, train: true, color: trip.color, prio: isSel ? 0 : 5 });
    }
  }

  // 標籤（依優先序避讓）
  labels.sort((a, b) => a.prio - b.prio);
  ctx.textBaseline = 'middle';
  for (const lb of labels) {
    if (lb.train) {
      ctx.font = '700 11px ' + getFont('mono');
      const w = ctx.measureText(lb.text).width;
      if (!free(lb.sx - 2, lb.sy - 8, w + 4, 16)) continue;
      halo(lb.text, lb.sx, lb.sy, C.ink);
      continue;
    }
    const n = lb.n;
    const big = n.sys === 'THSR' || MAJOR.has(n.name);
    ctx.font = (big ? '700 ' : '500 ') + (big ? 12.5 : 11.5) + 'px ' + getFont('body');
    const text = n.sys === 'THSR' ? '高鐵' + n.name : n.name;
    const w = ctx.measureText(text).width;
    let x = lb.sx + lb.r + 5, y = lb.sy;
    if (n.sys === 'THSR') { x = lb.sx - lb.r - 5 - w; }
    if (!free(x - 2, y - 8, w + 4, 16)) { x = lb.sx - lb.r - 5 - w; if (!free(x - 2, y - 8, w + 4, 16)) continue; }
    halo(text, x, y, S.favs.has(n.id) ? C.gold : (n.sys === 'THSR' ? '#E0731A' : C.ink));
  }
}
let fontCache = {};
function getFont(kind) {
  if (!fontCache[kind]) fontCache[kind] = getComputedStyle(document.documentElement).getPropertyValue(kind === 'mono' ? '--font-mono' : '--font-body').trim();
  return fontCache[kind];
}
function halo(text, x, y, color) {
  ctx.lineWidth = 3.2; ctx.strokeStyle = C['label-halo']; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

/* ---------- 時間與迴圈 ---------- */
function curMin() { return minOfDay(S.simMs); }
function updatePositions() {
  const m = curMin();
  S.positions = [];
  for (const trip of TRIPS) {
    const pos = tripPos(trip, m);
    if (pos) S.positions.push({ trip, pos });
  }
}
let lastPanel = 0, lastPos = 0;
function frame(now) {
  const dt = now - S.lastFrame; S.lastFrame = now;
  if (S.playing) {
    if (S.live && S.speed === 1) S.simMs = Date.now();
    else S.simMs += dt * S.speed;
  }
  if (S.anim) {
    const a = S.anim, f = Math.min(1, (now - a.t0) / a.ms), e = 1 - Math.pow(1 - f, 3);
    const ls = Math.log(a.from.scale) + (Math.log(a.to.scale) - Math.log(a.from.scale)) * e;
    S.view.scale = Math.exp(ls);
    S.view.cx = a.from.cx + (a.to.cx - a.from.cx) * e;
    S.view.cy = a.from.cy + (a.to.cy - a.from.cy) * e;
    if (f >= 1) S.anim = null;
  }
  if (now - lastPos > (S.speed > 1 ? 33 : 60) || S.anim) { updatePositions(); lastPos = now; }
  if (S.follow && S.sel && S.sel.kind === 'train' && !S.anim) {
    const p = S.positions.find(p => p.trip === S.sel.trip);
    if (p) { const t = centerOn(p.pos.x, p.pos.y); S.view.cx += (t.cx - S.view.cx) * 0.15; S.view.cy += (t.cy - S.view.cy) * 0.15; }
  }
  draw(now);
  if (now - lastPanel > 1000) { lastPanel = now; renderTimeline(); renderPanel(); }
  requestAnimationFrame(frame);
}

/* ---------- 面板 ---------- */
const panel = $('#panel');
function pillFor(trip) {
  const label = trip.sys === 'THSR' ? '高鐵' : trip.type;
  return `<span class="pill" style="background:${trip.color}">${esc(label)}</span>`;
}
function delayText(trip) {
  if (trip.sys !== 'TRA') return '<span class="ontime">準點</span>';
  if (!trip.delay) return '<span class="ontime">準點</span>';
  return `<span class="${trip.delay >= 5 ? 'late' : 'minor'}">晚 ${trip.delay} 分</span>`;
}
function modeBadge() {
  const live = TDX.ok;
  return `<span class="mode ${live ? 'live' : ''}"><span class="dot"></span>${live ? 'TDX 官方時刻・即時誤點' : '班表推估・誤點為模擬'}</span>`;
}
function renderPanel() {
  if (!S.sel) return renderOverview();
  if (S.sel.kind === 'train') return renderTrain(S.sel.trip);
  if (S.sel.kind === 'station') return renderStation(S.sel.node);
}
function head(title, sub, extra = '') {
  return `<button class="handle" aria-label="展開或收合面板"></button><div class="head"><div class="grow"><h2>${title}</h2><div class="sub">${sub}</div></div>${extra}</div>`;
}
function setPanel(html, keepScroll = true) {
  const body = panel.querySelector('.body');
  const st = keepScroll && body ? body.scrollTop : 0;
  panel.innerHTML = html;
  const nb = panel.querySelector('.body');
  if (nb) nb.scrollTop = st;
}
function renderOverview() {
  const c = { tra: 0, hsr: 0, mrt: 0 }; let traOn = 0, traN = 0;
  const delayed = [];
  for (const { trip } of S.positions) {
    c[sysGroup(trip.sys)]++;
    if (trip.sys === 'TRA') { traN++; if (trip.delay < 5) traOn++; if (trip.delay >= 1) delayed.push(trip); }
  }
  delayed.sort((a, b) => b.delay - a.delay);
  const rate = traN ? Math.round(traOn / traN * 100) : 100;
  const favs = [...S.favs].map(id => NODES[id]).filter(Boolean);
  setPanel(`${head('全台即時概況', fmtDate(S.simMs))}
  <div class="body">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div class="clock">${fmtHMS(S.simMs)}</div>${modeBadge()}
    </div>
    <div class="eyebrow">運行中列車</div>
    <div class="stats">
      <div class="stat"><b>${c.tra}</b><span>台鐵</span></div>
      <div class="stat"><b>${c.hsr}</b><span>高鐵</span></div>
      <div class="stat"><b>${c.mrt}</b><span>捷運・輕軌</span></div>
    </div>
    <div class="eyebrow">台鐵準點率（誤點未滿 5 分）</div>
    <div style="display:flex;align-items:baseline;gap:8px"><b class="tm" style="font-size:22px">${rate}%</b><span class="sub">${traOn} / ${traN} 列</span></div>
    <div class="meter"><i style="width:${rate}%"></i></div>
    ${favs.length ? `<div class="eyebrow">我的最愛車站</div>${favs.map(n => `<button class="row" data-station="${n.id}"><span style="color:var(--gold)">★</span><span class="dest">${esc(n.name)}</span><span class="cd">${esc(SYSTEMS[n.sys].name)}</span></button>`).join('')}` : ''}
    <div class="eyebrow">誤點列車</div>
    ${delayed.length ? delayed.slice(0, 8).map(t => `<button class="row" data-trip="${t.idx}"><span class="no">${esc(t.no)}</span>${pillFor(t)}<span class="dest">${esc(t.origin)} → ${esc(t.dest)}</span>${delayText(t)}</button>`).join('') : '<div class="sub">目前沒有誤點列車</div>'}
    <div class="eyebrow">圖例</div>
    <div class="legend">
      ${['普悠瑪','太魯閣','自強','莒光','區間快','區間'].map(k => `<span><i style="background:${TRA_TYPES[k].color}"></i>${k}</span>`).join('')}
      <span><i style="background:#F07F1F"></i>台灣高鐵</span>
      <span><i style="background:linear-gradient(90deg,#E3002C,#0070BD,#008659,#F8B61C)"></i>捷運・輕軌</span>
    </div>
    <div class="eyebrow">操作</div>
    <div class="note">點列車可跟車並查看停靠站，點車站可看接下來的班次與倒數。拖曳時間軸可回看或預看任何時刻。</div>
    <div class="eyebrow">資料說明</div>
    <div class="note">車站位置與路線依公開資料整理，線形為站間連線示意。列車位置依各營運單位的班型與行車時間推估${TDX.ok ? '；台鐵與高鐵目前使用 TDX 當日官方時刻表，台鐵誤點每分鐘更新' : '，誤點為模擬值。到「設定」填入 TDX 金鑰可改用官方時刻表與即時誤點'}。</div>
  </div>`);
}

function nextStopIdx(trip, m) {
  for (let i = 0; i < trip.nodes.length; i++) if (trip.times[i].stop && effTime(trip, i, 'dep') >= m) return i; // 停靠中仍算目前這一站
  return -1;
}
function tripMinute(trip) {
  // 若車次跨午夜，回傳與其時刻表一致的分鐘數
  const m = curMin();
  if (m < 240 && effTime(trip, 0, 'dep') > m + 600) return m + 1440;
  return m;
}
function renderTrain(trip) {
  const m = tripMinute(trip);
  const pos = tripPos(trip, curMin());
  const ni = nextStopIdx(trip, m);
  const stops = trip.nodes.map((n, i) => ({ n, i, t: trip.times[i] })).filter(s => s.t.stop);
  const title = trip.sys === 'THSR' ? `高鐵 ${esc(trip.no)} 次` : trip.no ? `${esc(trip.type)} ${esc(trip.no)} 次` : esc(trip.type);
  const sub = `${esc(trip.origin)} → ${esc(trip.dest)}${trip.car ? '・' + esc(trip.car) : ''}`;
  let status;
  if (!pos) status = effTime(trip, 0, 'dep') > m ? `尚未發車，${fmtHM(effTime(trip, 0, 'dep'))} 自${esc(trip.origin)}出發` : '已抵達終點';
  else if (ni >= 0) {
    const eta = effTime(trip, ni, 'arr');
    const atSt = pos.atStation && trip.nodes[pos.seg] === trip.nodes[ni];
    status = `<div class="nextbox"><div><div class="sub">${atSt ? '停靠中' : '下一站'}</div><b>${esc(trip.nodes[ni].name)}</b></div><div style="text-align:right"><div class="tm">${fmtHM(eta)}</div><div class="cd">${atSt ? '即將發車' : Math.max(0, Math.round(eta - m)) + ' 分後到站'}</div></div></div>`;
  }
  const speed = pos && !pos.atStation && pos.f != null ? estSpeed(trip, pos) : 0;
  setPanel(`${head(title, sub, `<button class="close" data-close aria-label="關閉">✕</button>`)}
  <div class="body">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${pillFor(trip)}${delayText(trip)}${speed ? `<span class="cd">約 ${speed} km/h</span>` : ''}</div>
    ${typeof status === 'string' && !status.startsWith('<') ? `<div class="nextbox"><span>${status}</span></div>` : status || ''}
    <div class="btnrow">
      <button class="btn ${S.follow ? 'primary' : ''}" data-follow>${S.follow ? '跟隨中' : '跟隨列車'}</button>
      ${pos ? '' : `<button class="btn" data-jump>跳到發車時間</button>`}
    </div>
    <div class="eyebrow">停靠站（${stops.length} 站）</div>
    <ol class="stops">
      ${stops.map(s => {
        const arr = effTime(trip, s.i, 'arr'), dep = effTime(trip, s.i, 'dep');
        const cls = dep < m && s.i !== ni ? 'past' : s.i === ni ? 'cur' : '';
        const sched = s.i === 0 ? trip.times[0].dep : trip.times[s.i].arr;
        const showDelay = trip.delay && trip.sys === 'TRA';
        return `<li class="${cls}"><span class="bul"></span><span>${esc(s.n.name)}</span><span class="tm">${fmtHM(sched)}</span><span class="tm ${showDelay ? 'late' : 'cd'}" style="min-width:42px;text-align:right">${showDelay ? fmtHM(s.i === 0 ? dep : arr) : ''}</span></li>`;
      }).join('')}
    </ol>
  </div>`);
}
function estSpeed(trip, pos) {
  const i = pos.seg, a = trip.nodes[i], b = trip.nodes[i + 1];
  const mins = effTime(trip, i + 1, 'arr') - effTime(trip, i, 'dep');
  return Math.round(dist(a, b) * 1.1 / mins * 60);
}

function renderStation(n) {
  const m = curMin();
  const rows = [];
  for (const [trip, i] of (NODE_TRIPS.get(n.id) || [])) {
    if (i === trip.nodes.length - 1) continue; // 終點到站不列入出發
    for (const off of [0, 1440]) {
      const dep = effTime(trip, i, 'dep') - off;
      if (dep >= m - 1 && dep <= m + 180) rows.push({ trip, i, dep, sched: trip.times[i].dep - off });
    }
  }
  rows.sort((a, b) => a.dep - b.dep);
  const isMRT = sysGroup(n.sys) === 'mrt';
  let html;
  if (isMRT) {
    // 依方向（終點）分組
    const groups = new Map();
    for (const r of rows) {
      const k = (r.trip.line ? (r.trip.line.label || r.trip.line.name) : '') + '｜往 ' + r.trip.dest;
      if (!groups.has(k)) groups.set(k, { trip: r.trip, list: [] });
      if (groups.get(k).list.length < 3) groups.get(k).list.push(r);
    }
    html = [...groups.entries()].map(([k, g]) => `<div class="row" style="flex-wrap:wrap;border-bottom:1px solid var(--line);border-radius:0">
      <span class="pill" style="background:${g.trip.color}">${esc(g.trip.type)}</span><b class="dest">往 ${esc(g.trip.dest)}</b>
      <span style="display:flex;gap:10px;width:100%;padding-left:2px">${g.list.map((r, j) => `<button class="btn" style="padding:3px 8px" data-trip="${r.trip.idx}"><span class="tm">${Math.max(0, Math.round(r.dep - m)) || '進站'}${Math.round(r.dep - m) > 0 ? ' 分' : ''}</span></button>`).join('')}</span></div>`).join('') || '<div class="sub">今日營運已結束</div>';
  } else {
    html = rows.slice(0, 16).map(r => {
      const cd = Math.round(r.dep - m);
      return `<button class="row" data-trip="${r.trip.idx}"><span class="tm" style="font-weight:700">${fmtHM(r.sched)}</span><span class="no">${esc(r.trip.no)}</span>${pillFor(r.trip)}<span class="dest">往 ${esc(r.trip.dest)}</span><span style="text-align:right;display:grid;gap:2px">${delayText(r.trip)}<span class="cd">${cd <= 0 ? '即將發車' : cd + ' 分'}</span></span></button>`;
    }).join('') || '<div class="sub">接下來 3 小時沒有停靠班次</div>';
  }
  const lines = [...n.lines].join('、');
  const fav = S.favs.has(n.id);
  // 同名轉乘站（不同系統）
  const transfers = NODES.filter(o => o !== n && (o.name === n.name || (o.name.replace(/車站$/, '') === n.name.replace(/車站$/, ''))) && dist(o, n) < 1.5);
  setPanel(`${head(esc(n.sys === 'THSR' ? '高鐵' + n.name + '站' : n.name), `${esc(SYSTEMS[n.sys].name)}・${esc(lines)}`,
    `<button class="fav ${fav ? 'on' : ''}" data-fav aria-label="${fav ? '取消最愛' : '加入最愛'}" title="${fav ? '取消最愛' : '加入最愛'}">${fav ? '★' : '☆'}</button><button class="close" data-close aria-label="關閉">✕</button>`)}
  <div class="body">
    ${transfers.length ? `<div class="tabs">${transfers.map(o => `<button data-station="${o.id}">轉乘 ${esc(SYSTEMS[o.sys].name)}</button>`).join('')}</div>` : ''}
    <div class="eyebrow">${isMRT ? '下一班列車' : '出發看板・未來 3 小時'}</div>
    <div class="board">${html}</div>
    <div class="note" style="margin-top:12px">${fmtHMS(S.simMs)} 更新${S.live ? '' : '（非即時，時間軸已移動）'}</div>
  </div>`);
}

panel.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.classList.contains('handle')) { panel.classList.toggle('collapsed'); return; }
  if (t.dataset.trip != null) { selectTrain(TRIPS[+t.dataset.trip], true); return; }
  if (t.dataset.station != null) { selectStation(NODES[+t.dataset.station], true); return; }
  if (t.hasAttribute('data-close')) { clearSel(); return; }
  if (t.hasAttribute('data-follow')) { S.follow = !S.follow; $('#recenter').hidden = true; renderPanel(); return; }
  if (t.hasAttribute('data-jump') && S.sel?.trip) { const st = effTime(S.sel.trip, 0, 'dep') % 1440; setSimMinute(st - 1); S.follow = true; renderPanel(); return; }
  if (t.hasAttribute('data-fav') && S.sel?.node) {
    const id = S.sel.node.id; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    store.set('favs', [...S.favs]); renderPanel();
  }
});

function selectTrain(trip, fly) {
  S.sel = { kind: 'train', trip }; S.follow = true; $('#recenter').hidden = true;
  panel.classList.remove('collapsed');
  renderPanel();
  const p = tripPos(trip, curMin());
  if (fly && p) flyTo(centerOn(p.x, p.y, Math.max(S.view.scale, sysGroup(trip.sys) === 'mrt' ? 40 : 12)));
}
function selectStation(n, fly) {
  S.sel = { kind: 'station', node: n }; S.follow = false; $('#recenter').hidden = true;
  panel.classList.remove('collapsed');
  renderPanel();
  if (fly) flyTo(centerOn(n.x, n.y, Math.max(S.view.scale, sysGroup(n.sys) === 'mrt' ? 45 : 14)));
}
function clearSel() { S.sel = null; S.follow = false; $('#recenter').hidden = true; renderPanel(); }

/* ---------- 時間軸 ---------- */
const slider = $('#slider');
function renderTimeline() {
  $('#tlabel').textContent = fmtHMS(S.simMs).slice(0, S.speed > 1 ? 5 : 8);
  if (document.activeElement !== slider) slider.value = Math.floor(curMin());
  $('#play').textContent = S.playing ? '❚❚' : '▶';
  $('#play').setAttribute('aria-label', S.playing ? '暫停' : '播放');
  $('#nowbtn').hidden = S.live && S.speed === 1 && S.playing;
  document.querySelectorAll('.speeds button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sp === S.speed)));
}
function setSimMinute(min) {
  S.simMs = dayStart(Date.now()) + ((min + 1440) % 1440) * 60000; S.live = false;
  updatePositions(); renderTimeline(); renderPanel();
}
slider.addEventListener('input', () => setSimMinute(+slider.value));
$('#play').addEventListener('click', togglePlay);
function togglePlay() { S.playing = !S.playing; if (S.playing) S.lastFrame = performance.now(); if (!S.playing) S.live = false; renderTimeline(); }
function setSpeed(sp) { S.speed = sp; if (sp !== 1) S.live = false; S.playing = true; renderTimeline(); }
document.querySelectorAll('.speeds button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.sp)));
$('#nowbtn').addEventListener('click', goNow);
function goNow() { S.simMs = Date.now(); S.live = true; S.speed = 1; S.playing = true; updatePositions(); renderTimeline(); renderPanel(); }

/* ---------- 篩選、搜尋、縣市 ---------- */
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  S.filter = b.dataset.sys;
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  store.set('filter', S.filter);
}));
const q = $('#q'), results = $('#results');
let resultItems = [], resultOn = 0;
function search(text) {
  text = normName(text.trim());
  if (!text) return [];
  const out = [];
  const seen = new Set();
  for (const n of NODES) {
    if (n.name.includes(text) && !seen.has(n.sys + n.name)) {
      seen.add(n.sys + n.name);
      out.push({ kind: 'station', node: n, score: n.name === text ? 0 : n.name.startsWith(text) ? 1 : 2, label: n.sys === 'THSR' ? '高鐵' + n.name : n.name, k: SYSTEMS[n.sys].name });
    }
  }
  const m = curMin();
  if (/^\d+$/.test(text)) {
    for (const t of TRIPS) if (t.no && (t.no === text || t.no.replace(/^0+/, '') === text.replace(/^0+/, '')))
      out.push({ kind: 'train', trip: t, score: -1, label: `${t.sys === 'THSR' ? '高鐵' : t.type} ${t.no} 次`, k: `${t.origin} → ${t.dest}` });
    for (const t of TRIPS) if (t.no && t.no.startsWith(text) && t.no !== text && out.length < 30)
      out.push({ kind: 'train', trip: t, score: 3, label: `${t.sys === 'THSR' ? '高鐵' : t.type} ${t.no} 次`, k: `${t.origin} → ${t.dest}` });
  }
  const typeHit = Object.keys(TRA_TYPES).find(k => text.includes(k)) || (/(EMU|TEMU)\d*/i.test(text) ? null : null);
  const carHit = /^T?EMU\d+$/i.test(text) ? text.toUpperCase() : null;
  if (typeHit || carHit || text === '高鐵') {
    for (const { trip } of S.positions) {
      if ((typeHit && trip.type === typeHit) || (carHit && trip.car === carHit) || (text === '高鐵' && trip.sys === 'THSR'))
        out.push({ kind: 'train', trip, score: 4, label: `${trip.sys === 'THSR' ? '高鐵' : trip.type} ${trip.no} 次`, k: `行駛中・往${trip.dest}` });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 30);
}
function renderResults() {
  if (!resultItems.length) { results.hidden = !q.value.trim(); results.innerHTML = q.value.trim() ? '<div class="sub" style="padding:10px">找不到符合的車站或車次</div>' : ''; return; }
  results.hidden = false;
  results.innerHTML = resultItems.map((r, i) => `<button data-i="${i}" class="${i === resultOn ? 'on' : ''}">${r.kind === 'train' ? pillFor(r.trip) : '<span style="opacity:.6">●</span>'}<span>${esc(r.label)}</span><span class="k">${esc(r.k)}</span></button>`).join('');
}
q.addEventListener('input', () => { resultItems = search(q.value); resultOn = 0; renderResults(); });
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { resultOn = Math.min(resultItems.length - 1, resultOn + 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { resultOn = Math.max(0, resultOn - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter' && resultItems[resultOn]) pick(resultItems[resultOn]);
  else if (e.key === 'Escape') { q.value = ''; results.hidden = true; q.blur(); }
  e.stopPropagation();
});
results.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(resultItems[+b.dataset.i]); });
function pick(r) {
  results.hidden = true; q.blur();
  if (r.kind === 'station') selectStation(r.node, true);
  else selectTrain(r.trip, true);
}
document.addEventListener('click', e => { if (!e.target.closest('.search')) results.hidden = true; });

const countySel = $('#county');
for (const name of COUNTY_ORDER) { const c = COUNTIES.find(c => c.name === name); if (c) countySel.insertAdjacentHTML('beforeend', `<option>${name}</option>`); }
countySel.addEventListener('change', () => {
  const c = COUNTIES.find(c => c.name === countySel.value);
  if (c) flyTo(fitBounds(...c.bbox, 80));
  countySel.value = '';
});

/* ---------- 主題、全螢幕、設定 ---------- */
$('#themebtn').addEventListener('click', () => {
  const dark = C.dark;
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  store.set('theme', dark ? 'light' : 'dark');
});
{ const t = store.get('theme', null); if (t) document.documentElement.setAttribute('data-theme', t); }
function toggleFull() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch {}
}
$('#fullbtn').addEventListener('click', toggleFull);

const dlg = $('#dlg');
$('#setbtn').addEventListener('click', () => { const c = store.get('tdx', {}); $('#tdxid').value = c.id || ''; $('#tdxsecret').value = c.secret || ''; dlg.hidden = false; $('#tdxid').focus(); });
$('#dlgclose').addEventListener('click', () => dlg.hidden = true);
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.hidden = true; });
const tdxStatus = msg => { $('#tdxstatus').innerHTML = msg; };
let delayTimer = null;
let tdxGen = 0; // 每次連線或改回推估都會遞增，讓過期的請求不再改動狀態
const twDate = ms => new Date(ms + TW).toISOString().slice(0, 10);
async function connectTDX(cred, quiet) {
  const gen = ++tdxGen;
  const isCurrent = () => gen === tdxGen;
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
      // 台灣日期換日後（凌晨 4 點，跨午夜班次已收班）重新載入當日時刻表
      const now = Date.now();
      if (twDate(now) !== TDX.date && minOfDay(now) >= 240) { connectTDX(cred, true); return; }
      TDX.loadDelays(cred, isCurrent).catch(() => {});
    }, 60000);
    if (S.sel && S.sel.kind === 'train') clearSel();
    updatePositions(); renderPanel();
  } catch (err) {
    if (!isCurrent()) return;
    TDX.ok = false;
    const blocked = err instanceof TypeError;
    tdxStatus(blocked
      ? '無法連到 TDX。若是在 Claude 預覽頁面開啟，安全設定不允許連外，請改用部署在自己網域的版本；若已自架，請確認網路連線。目前繼續使用班表推估。'
      : esc(err.message) + '。請確認金鑰正確；目前繼續使用班表推估。');
    if (!quiet) console.warn(err);
  }
}
$('#tdxgo').addEventListener('click', () => {
  const cred = { id: $('#tdxid').value.trim(), secret: $('#tdxsecret').value.trim() };
  if (!cred.id || !cred.secret) { tdxStatus('請填入 Client ID 與 Client Secret。'); return; }
  store.set('tdx', cred); connectTDX(cred);
});
$('#tdxclear').addEventListener('click', () => {
  tdxGen++;
  store.set('tdx', {}); TDX.ok = false; clearInterval(delayTimer);
  generateAll(); if (S.sel && S.sel.kind === 'train') clearSel();
  updatePositions(); renderPanel(); tdxStatus('已改回班表推估。');
});

/* ---------- 地圖操作 ---------- */
const pointers = new Map();
let dragStart = null, pinchStart = null, moved = false;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  moved = false; S.anim = null;
  if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, cx: S.view.cx, cy: S.view.cy };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: S.view.scale, mid: s2w((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
  }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, clampScale(pinchStart.scale * d / pinchStart.d) / S.view.scale);
    moved = true; breakFollow();
  } else if (dragStart) {
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; cv.classList.add('dragging'); breakFollow(); }
    if (moved) { S.view.cx = dragStart.cx - dx / S.view.scale; S.view.cy = dragStart.cy - dy / S.view.scale; }
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 1) { const [p] = [...pointers.values()]; dragStart = { x: p[0], y: p[1], cx: S.view.cx, cy: S.view.cy }; }
  if (pointers.size === 0) {
    cv.classList.remove('dragging');
    if (!moved && e.type === 'pointerup') hitTest(e.clientX, e.clientY);
    dragStart = null;
  }
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault(); S.anim = null;
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
}, { passive: false });
cv.addEventListener('dblclick', e => { flyTo({ ...zoomTarget(e.clientX, e.clientY, 2) }, 350); });
const clampScale = s => Math.max(0.8, Math.min(400, s));
function zoomTarget(sx, sy, k) {
  const [wx, wy] = s2w(sx, sy); const ns = clampScale(S.view.scale * k);
  return { scale: ns, cx: wx - (sx - W / 2) / ns, cy: wy - (sy - H / 2) / ns };
}
function zoomAt(sx, sy, k) { Object.assign(S.view, zoomTarget(sx, sy, k)); }
function breakFollow() {
  if (S.follow && S.sel && S.sel.kind === 'train') { S.follow = false; $('#recenter').hidden = false; }
}
$('#recenter').addEventListener('click', () => { S.follow = true; $('#recenter').hidden = true; });

function hitTest(sx, sy) {
  let best = null, bd = 14;
  for (const { trip, pos } of S.positions) {
    if (!visible(trip.sys)) continue;
    const [x, y] = w2s(pos.x, pos.y); const d = Math.hypot(x - sx, y - sy);
    if (d < bd) { bd = d; best = { kind: 'train', trip }; }
  }
  if (!best) {
    bd = 12;
    for (const n of NODES) {
      if (!visible(n.sys)) continue;
      if (sysGroup(n.sys) === 'mrt' && S.view.scale <= 7) continue;
      if (n.sys === 'TRA' && S.view.scale <= 3.5 && !MAJOR.has(n.name)) continue;
      const [x, y] = w2s(n.x, n.y); const d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = { kind: 'station', node: n }; }
    }
  }
  if (!best) return;
  if (best.kind === 'train') selectTrain(best.trip, false);
  else selectStation(best.node, false);
}

/* ---------- 鍵盤 ---------- */
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ') { togglePlay(); e.preventDefault(); }
  else if (['1','2','3','4'].includes(e.key)) setSpeed([1, 10, 30, 60][+e.key - 1]);
  else if (e.key === 'ArrowLeft') setSimMinute(curMin() - 10);
  else if (e.key === 'ArrowRight') setSimMinute(curMin() + 10);
  else if (e.key === 'f' || e.key === 'F') toggleFull();
  else if (e.key === 'Escape') { if (!dlg.hidden) dlg.hidden = true; else clearSel(); }
  else if (e.key === '/') { q.focus(); e.preventDefault(); }
});

/* ---------- 啟動 ---------- */
function boot() {
  resize(); readTheme();
  generateAll();
  S.filter = store.get('filter', 'all');
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sys === S.filter)));
  const isl = COUNTIES.filter(c => !['澎湖縣','金門縣','連江縣'].includes(c.name));
  const bb = isl.reduce((a, c) => [Math.min(a[0], c.bbox[0]), Math.min(a[1], c.bbox[1]), Math.max(a[2], c.bbox[2]), Math.max(a[3], c.bbox[3])], [1e9, 1e9, -1e9, -1e9]);
  Object.assign(S.view, fitBounds(...bb));
  updatePositions(); renderTimeline(); renderPanel();
  requestAnimationFrame(t => { S.lastFrame = t; frame(t); });
  const cred = store.get('tdx', {});
  if (cred.id && cred.secret) connectTDX(cred, true);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontCache = {}; });
boot();
