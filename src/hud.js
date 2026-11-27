/* ---------- 指揮台：策略遊戲風格的即時儀表板 ----------
   左側發車看板（車次、終點、車站、狀態）、右側營運狀態（運行列車、準點率、平均誤點、各線狀態、天氣、鏡頭），
   下方今日時間軸與事件跑馬燈；地圖上每列車前方到下一站畫一條流動的橘色光線，滑過車站顯示下一班車。
   全部跟著模擬即時更新，不另外連任何伺服器 */
const HUD_Q = new URLSearchParams(location.search).get('hud');
const HUD = {
  on: HUD_Q != null ? HUD_Q !== '0' : store.get('hud', !COARSE && innerWidth >= 900),
  routes: store.get('routes', true),
  tab: store.get('hudTab', 'rail'),
  prev: new Map(),   // trip → 上一次的狀態（偵測發車、到站，產生事件）
  delays: new Map(), // 車次 → 上一次看到的誤點分鐘
  air: new Map(),    // 航班 id → 已經播報過的事件
  queue: [], recent: [], seeded: false,
  tl: null, tlAt: 0, routeAt: 0, dash: 0, dashAt: 0,
};
const hudL = $('#hudL'), hudR = $('#hudR'), hudRows = $('#hudrows'), hudRail = $('#hudrail'), hudTip = $('#hudtip');
const ORANGE = '#FF9A3C';

/* ---------- 每列車此刻的狀態：進站中、停靠、發車、運行、誤點 ---------- */
// 回傳 { k: 狀態代碼, lab: 顯示文字, st: 相關車站, t: 那一站的時刻（營運分鐘）, mm: 這列車用的分鐘數 }
function tripStatus(trip, pos) {
  const m = tripMinute(trip), n = trip.nodes.length, i = pos.seg;
  const late = Math.round(trip.liveDelay != null ? trip.liveDelay : trip.delay || 0);
  let r;
  if (pos.atStation) {
    const arr = effTime(trip, i, 'arr'), dep = effTime(trip, i, 'dep');
    if (i === n - 1) r = { k: 'arr', lab: '抵達終點', st: trip.nodes[i], t: arr };
    else if (i === 0 && m < dep - 0.5) r = { k: 'wait', lab: '待發', st: trip.nodes[i], t: dep };
    else if (dep - m < 0.35) r = { k: 'dep', lab: '發車', st: trip.nodes[i], t: dep };
    else r = { k: 'dwell', lab: '停靠', st: trip.nodes[i], t: dep };
  } else {
    const ni = nextStopIdx(trip, m), f = pos.f || 0;
    const next = ni >= 0 ? trip.nodes[ni] : trip.nodes[n - 1], nt = ni >= 0 ? effTime(trip, ni, 'arr') : effTime(trip, n - 1, 'arr');
    if (trip.times[i].stop && f < 0.12) r = { k: 'dep', lab: '發車', st: trip.nodes[i], t: effTime(trip, i, 'dep') };
    else if (ni === i + 1 && f > 0.78) r = { k: 'arr', lab: '進站中', st: next, t: nt };
    else r = { k: 'run', lab: '運行', st: next, t: nt };
  }
  r.mm = m; r.late = late;
  if (late >= 5 && (r.k === 'run' || r.k === 'wait')) { r.k = 'late'; r.lab = '誤點 ' + late + ' 分'; }
  return r;
}
const shortName = t => t.sys === 'THSR' ? '高鐵 ' + t.no : t.no ? t.type + ' ' + t.no : t.type;
const stName = n => n ? (n.sys === 'THSR' ? '高鐵' + n.name : n.name) : '';
const isMajor = n => n && (n.sys === 'THSR' || (n.sys === 'TRA' && MAJOR.has(n.name)));

/* ---------- 事件：發車、到站、誤點、起降 ---------- */
function pushEvent(kind, tag, text, m) {
  const ev = { kind, tag, text, at: fmtHM(m != null ? m : curMin()) };
  HUD.queue.push(ev); if (HUD.queue.length > 24) HUD.queue.splice(0, HUD.queue.length - 24);
  HUD.recent.push(ev); if (HUD.recent.length > 30) HUD.recent.shift();
}
function scanEvents() {
  const seed = !HUD.seeded; // 第一次只記下狀態，不把當下所有列車都播報一次
  const seen = new Set();
  for (const { trip, pos } of S.positions) {
    if (trip.sys !== 'TRA' && trip.sys !== 'THSR') continue;
    seen.add(trip);
    const atSt = pos.atStation ? trip.nodes[pos.seg] : null;
    const was = HUD.prev.get(trip);
    const now = atSt ? 'S' + pos.seg : 'R' + pos.seg;
    HUD.prev.set(trip, now);
    if (seed || was === now) continue;
    const name = shortName(trip);
    // 從大站開車
    if (was && was[0] === 'S' && now[0] === 'R') {
      const st = trip.nodes[+was.slice(1)];
      if (isMajor(st) || +was.slice(1) === 0) pushEvent('dep', '發車', `${name} 由 ${stName(st)} 開出，往 ${trip.dest}`);
    } else if (atSt && pos.seg === trip.nodes.length - 1) pushEvent('arr', '抵達', `${name} 抵達終點 ${stName(atSt)}`);
    else if (atSt && isMajor(atSt) && was) pushEvent('arr', '進站', `${name} 停靠 ${stName(atSt)}`);
    // 誤點變化（台鐵即時資料）
    if (trip.liveDelay != null && trip.no) {
      const d = Math.round(trip.liveDelay), pd = HUD.delays.get(trip.no);
      if (pd != null && d >= 5 && d > pd) pushEvent('late', '誤點', `${name}（往${trip.dest}）誤點 ${d} 分`);
      else if (pd != null && pd >= 5 && d < 5) pushEvent('info', '恢復', `${name} 已恢復準點`);
      HUD.delays.set(trip.no, d);
    }
  }
  for (const t of HUD.prev.keys()) if (!seen.has(t)) HUD.prev.delete(t);
  if (seed) for (const { trip } of S.positions) if (trip.liveDelay != null && trip.no) HUD.delays.set(trip.no, Math.round(trip.liveDelay));
  // 飛機：四座機場的起飛、落地
  if (typeof AIR !== 'undefined' && AIR.on) {
    const m = curMin();
    for (const ap of WATCH_APS) for (const { f, dt, kind } of upcoming(ap, m - 1.5, 6)) {
      if (dt < 0 || dt > 1.5) continue; // 剛剛（1.5 分鐘內）發生
      const key = f.id + kind; if (HUD.air.has(key)) continue;
      HUD.air.set(key, m);
      if (seed) continue;
      const other = kind === 'dep' ? f.arr : f.dep;
      pushEvent('air', kind === 'dep' ? '起飛' : '落地', `${airTitle(f)} ${kind === 'dep' ? '自' + AIRPORTS[ap][0] + '機場起飛，飛往' + nameOf(other) : '由' + nameOf(other) + '飛抵' + AIRPORTS[ap][0] + '機場'}`, m - 1.5 + dt);
    }
    if (HUD.air.size > 400) for (const [k, t] of HUD.air) if (Math.abs(m - t) > 30) HUD.air.delete(k);
  }
  // 每兩分鐘一則全台概況
  if (seed || performance.now() - Ticker.statAt > 120e3) {
    HUD.seeded = true; Ticker.statAt = performance.now();
    const st = hudStats();
    pushEvent('info', '概況', `全台 ${st.total} 列車運行中 · 空中 ${st.air} 架 · 台鐵準點率 ${st.ontime}%${st.lateN ? ' · ' + st.lateN + ' 列誤點' : ''} · ${(WEATHER[lookWx()] || WEATHER.clear).name}`);
  }
}

/* ---------- 跑馬燈：一則捲出左邊就從右邊接上下一則，不會因為內容更新而跳動 ---------- */
const Ticker = { x: 0, last: 0, idx: 0, shown: new Set(), statAt: 0 };
function tickerEl(ev) {
  const el = document.createElement('span'); el._ev = ev; Ticker.shown.add(ev);
  el.className = 'ev';
  el.innerHTML = `<b>${esc(ev.at)}</b><i class="${ev.kind}">${esc(ev.tag)}</i>${esc(ev.text)}`;
  return el;
}
function stepTicker(now) {
  const dt = Math.min(1000, now - (Ticker.last || now)); Ticker.last = now;
  if (!HUD.on || document.hidden) return;
  const box = hudRail.parentElement, W = box.clientWidth; if (!W) return;
  // 補上內容：先放新事件，沒有新事件就輪播最近的
  let guard = 0;
  while (hudRail.scrollWidth + Ticker.x < W + 400 && guard++ < 6) {
    let ev = HUD.queue.shift();
    // 沒有新事件就輪播最近的（畫面上已經有的不重複）
    for (let k = 0; !ev && k < HUD.recent.length; k++) { const c = HUD.recent[Ticker.idx++ % HUD.recent.length]; if (!Ticker.shown.has(c)) ev = c; }
    if (!ev) break;
    if (!hudRail.children.length) Ticker.x = W; // 第一則從右邊進來
    hudRail.appendChild(tickerEl(ev));
  }
  Ticker.x -= dt * 0.055; // 每秒約 55 像素
  const first = hudRail.firstElementChild;
  if (first && first.offsetWidth + 36 < -Ticker.x) { Ticker.x += first.offsetWidth + 36; Ticker.shown.delete(first._ev); first.remove(); }
  hudRail.style.transform = `translate3d(${Ticker.x.toFixed(1)}px,-50%,0)`;
}

/* ---------- 統計 ---------- */
function hudStats() {
  const c = { tra: 0, hsr: 0, mrt: 0 }, lines = new Map();
  let lateN = 0, liveN = 0, sum = 0, live = false;
  for (const { trip } of S.positions) {
    const g = sysGroup(trip.sys); c[g]++;
    const key = trip.sys === 'TRA' || trip.sys === 'THSR' ? trip.sys : trip.line ? trip.line.name : trip.type;
    const L = lines.get(key) || { name: key === 'TRA' ? '台鐵' : key === 'THSR' ? '高鐵' : key, color: key === 'TRA' ? '#9DB0C2' : trip.color, n: 0, late: 0, sys: trip.sys };
    L.n++;
    if (trip.sys === 'TRA') {
      const d = trip.liveDelay != null ? trip.liveDelay : trip.delay || 0;
      if (trip.liveDelay != null) live = true;
      liveN++; sum += d; if (d >= 5) { lateN++; L.late++; }
    }
    lines.set(key, L);
  }
  let air = 0;
  if (typeof AIR !== 'undefined' && AIR.on) { const m = curMin(); for (const f of AIR.flights) { const p = flightPos(f, m); if (p && p.alt > 30) air++; } }
  return { c, total: c.tra + c.hsr + c.mrt, air, lines, live,
    ontime: liveN ? Math.round((1 - lateN / liveN) * 1000) / 10 : 100, avg: liveN ? sum / liveN : 0, lateN };
}
const SYS_ORDER = { TRA: 0, THSR: 1, TRTC: 2, TYMC: 3, TMRT: 4, KRTC: 5 };
let hudRKey = '';
function renderHudR() {
  const s = hudStats(), wx = lookWx(), W = WEATHER[wx] || WEATHER.clear, r = S.realWx;
  const hour = lookHour(), todName = hour < 5.2 || hour >= 18.7 ? '夜晚' : hour < 6.8 ? '清晨' : hour < 16.8 ? '白天' : '黃昏';
  const cls = v => v >= 92 ? 'good' : v >= 80 ? 'warn' : 'bad';
  const lines = [...s.lines.values()].sort((a, b) => (SYS_ORDER[a.sys] - SYS_ORDER[b.sys]) || b.n - a.n).slice(0, 9);
  const pct = k => s.total ? (s.c[k] / s.total * 100).toFixed(1) : 0;
  const html = `
    <section><h6><span class="live"></span>全台營運<small>${esc(fmtHM(curMin()))}</small></h6>
      <div class="kpis">
        <div class="kpi"><b>${s.total}</b><span>運行中列車</span></div>
        <div class="kpi"><b>${s.air}</b><span>空中航班</span></div>
        <div class="kpi ${cls(s.ontime)}"><b>${s.ontime.toFixed(s.ontime === 100 ? 0 : 1)}<small>%</small></b><span>台鐵準點率</span></div>
        <div class="kpi ${s.avg >= 3 ? 'bad' : s.avg >= 1 ? 'warn' : 'good'}"><b>${s.avg.toFixed(1)}<small>分</small></b><span>平均誤點</span></div>
      </div>
      <div class="mix"><i style="width:${pct('tra')}%;background:#9DB0C2"></i><i style="width:${pct('hsr')}%;background:${'#F07F1F'}"></i><i style="width:${pct('mrt')}%;background:#4FA3E0"></i></div>
      <div class="mixlab"><span style="--c:#9DB0C2">台鐵 ${s.c.tra}</span><span style="--c:#F07F1F">高鐵 ${s.c.hsr}</span><span style="--c:#4FA3E0">捷運・輕軌 ${s.c.mrt}</span><span style="margin-left:auto;color:var(--faint)">${s.live ? 'TDX 即時誤點' : '班表推估'}</span></div>
    </section>
    <section><h6>鏡頭</h6>
      <div class="cams">
        <button data-a="dep" title="跟著下一班從大站發車的列車（N）">跟拍發車</button>
        <button data-a="air" title="去機場跟著下一架起飛的飛機">跟拍起飛</button>
        <button data-a="roam" class="wide" aria-pressed="${!!S.roam}" title="自動在台鐵、高鐵、捷運與機場之間巡航運鏡（R）">電影巡航</button>
      </div>
    </section>
    <section><h6>各線狀態</h6>
      <div class="lines">${lines.map(L => {
        const g = L.sys !== 'TRA' ? ['', '正常'] : L.late / Math.max(1, L.n) > 0.2 ? ['b', `${L.late} 列誤點`] : L.late ? ['w', `${L.late} 列誤點`] : ['', '正常'];
        return `<div><i style="background:${L.color}"></i><span>${esc(L.name)}</span><span class="c">${L.n} 列</span><span class="g ${g[0]}">${g[1]}</span></div>`; }).join('') || '<div><span></span><span class="c">目前沒有列車運行</span></div>'}</div>
    </section>
    <section><h6>天氣與光線</h6>
      <div class="wxline">${WX_ICON[wx] || WX_ICON.clear}<div><b>${esc(W.name)}${r && S.wx === 'auto' ? ' ' + r.temp + '°C' : ''}</b><br><span>${esc(todName)}${S.tod === 'auto' ? ' · 跟著台灣時間' : ' · 手動'}</span></div></div>
      <div class="row" id="hudtod">${[['auto', '自動'], ['day', '白天'], ['dusk', '黃昏'], ['night', '夜晚']].map(([v, n]) => `<button data-v="${v}" aria-pressed="${S.tod === v}">${n}</button>`).join('')}</div>
    </section>
`;
  if (html === hudRKey) return;
  hudRKey = html; hudR.innerHTML = html;
}
hudR.addEventListener('click', e => {
  const t = e.target.closest('#hudtod button[data-v]');
  if (t) { S.tod = t.dataset.v; store.set('tod', S.tod); applyLook(true); renderHudR(); return; }
  const a = e.target.closest('.cams button'); if (!a) return;
  if (a.dataset.a === 'dep') followNextDeparture();
  else if (a.dataset.a === 'air') followNextTakeoff();
  else if (a.dataset.a === 'roam') { if (S.roam) setRoam(false); else setRoam(true); }
  renderHudR();
});

/* ---------- 發車看板 ---------- */
let hudRowsKey = '';
function renderHudL() {
  const g = HUD.tab, m = curMin(), rows = [];
  if (g === 'air') {
    if (typeof AIR !== 'undefined') for (const ap of WATCH_APS) for (const u0 of upcoming(ap, m - 2, 6)) {
      const u = { ...u0, dt: u0.dt - 2 }, f = u.f, ph = watchPhase(f, ap, m);
      let k = 'wait', lab = u.kind === 'dep' ? '準備' : '航行';
      if (ph) { if (ph.kind === 'dep') { k = ph.ground ? 'dwell' : 'dep'; lab = ph.ground ? '滑行' : '起飛'; } else { k = ph.ground ? 'dwell' : 'arr'; lab = ph.ground ? '滑行' : '進場'; } }
      else if (u.dt < 0) { k = u.kind === 'dep' ? 'dep' : 'arr'; lab = u.kind === 'dep' ? '起飛' : '落地'; }
      rows.push({ at: fmtHM(m + u.dt), dot: '#C9B8FF', name: airTitle(f), sub: (u.kind === 'dep' ? '往' : '自') + nameOf(u.kind === 'dep' ? f.arr : f.dep), st: AIRPORTS[ap][0], k, lab, d: u.dt, air: f.id });
    }
    rows.sort((a, b) => a.d - b.d);
  } else {
    for (const { trip, pos } of S.positions) {
      const gg = sysGroup(trip.sys);
      if (g === 'rail' ? gg === 'mrt' : gg !== g) continue;
      const s = tripStatus(trip, pos);
      // 看板只列「靠近車站」的列車：停靠、進站、剛發車，以及 15 分鐘內會到站的
      const d = s.t - s.mm;
      if (d > 15 || d < -1) continue;
      // 像真的發車看板：依那一站的時刻排序，大站優先
      rows.push({ at: fmtHM(s.t), dot: trip.color, name: shortName(trip), sub: '往' + trip.dest, st: stName(s.st), k: s.k, lab: s.lab, d: d + (isMajor(s.st) || g === 'mrt' ? 0 : 8) + (s.k === 'late' ? -3 : 0), i: trip.idx });
    }
    rows.sort((a, b) => a.d - b.d);
  }
  const fit = Math.max(3, Math.floor((hudRows.clientHeight - 26) / 30.5));
  const top = rows.slice(0, fit);
  $('#hudLsub').textContent = g === 'air' ? '四座機場 · 3 小時內' : `15 分鐘內 ${rows.length} 列`;
  const html = '<div class="hd"><span>時刻</span><span>車次・終點</span><span>' + (g === 'air' ? '機場' : '車站') + '</span><span style="text-align:right">狀態</span></div>' +
    (top.map(r => `<button ${r.i != null ? 'data-i="' + r.i + '"' : 'data-f="' + esc(r.air) + '"'}${r.i != null && S.follow && S.follow.idx === r.i ? ' aria-current="true"' : ''}><span class="t">${esc(r.at)}</span><span class="n"><i style="background:${r.dot}"></i>${esc(r.name)}<em>${esc(r.sub)}</em></span><span class="s">${esc(r.st)}</span><span class="st ${r.k}">${esc(r.lab)}</span></button>`).join('')
      || `<div class="hd" style="border:0;letter-spacing:.04em">${g === 'air' ? '接下來沒有起降的航班' : '目前沒有靠站中的列車'}</div>`);
  if (html === hudRowsKey) return;
  hudRowsKey = html; hudRows.innerHTML = html;
}
hudRows.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.i != null) { const t = TRIPS[+b.dataset.i]; if (t && tripPos(t, curMin())) { setRoam(false); follow(t); } }
  else if (b.dataset.f) { const f = AIR.flights.find(x => x.id === b.dataset.f); if (f) { setRoam(false); watchFlight(f); } }
  renderHudL();
});
$('#hudtabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  HUD.tab = b.dataset.g; store.set('hudTab', HUD.tab); renderTabs(); hudRowsKey = ''; renderHudL();
});
function renderTabs() { document.querySelectorAll('#hudtabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === HUD.tab))); }

/* ---------- 跟拍 ---------- */
// 下一班從大站開出的台鐵、高鐵：正在月台上、最快開車的那一列
function followNextDeparture() {
  let best = null, bd = Infinity;
  for (const { trip, pos } of S.positions) {
    if (trip.sys !== 'TRA' && trip.sys !== 'THSR' || !pos.atStation || pos.seg >= trip.nodes.length - 1 || trip === S.follow) continue;
    const st = trip.nodes[pos.seg], m = tripMinute(trip), d = effTime(trip, pos.seg, 'dep') - m;
    if (d < 0.15) continue; // 已經在關門的不算，鏡頭來不及飛到
    const score = d + (isMajor(st) ? 0 : 4) + (trip.sys === 'THSR' || /自強|普悠瑪|太魯閣/.test(trip.type) ? 0 : 1.5);
    if (score < bd) { bd = score; best = trip; }
  }
  if (!best) for (const { trip, pos } of S.positions) if ((trip.sys === 'TRA' || trip.sys === 'THSR') && !pos.atStation && trip !== S.follow) { best = trip; break; }
  if (!best) return;
  setRoam(false); follow(best);
  const pos = tripPos(best, curMin());
  pushEvent('info', '跟拍', `鏡頭跟著 ${shortName(best)}，即將由 ${stName(best.nodes[pos ? pos.seg : 0])} 開往 ${best.dest}`);
}
// 下一架起飛的飛機：已經在滑行、最快離地的那一架
function followNextTakeoff() {
  if (typeof AIR === 'undefined') return;
  const m = curMin();
  let best = null, bd = Infinity, bap = 'TPE';
  for (const ap of WATCH_APS) for (const u of upcoming(ap, m, 8)) {
    if (u.kind !== 'dep') continue;
    const ph = watchPhase(u.f, ap, m);
    const score = u.dt + (ph ? 0 : 20);
    if (score < bd) { bd = score; best = u.f; bap = ap; }
  }
  setRoam(false);
  if (best) watchFlight(best); else watchAirport(bap);
}
$('#nextdep').addEventListener('click', followNextDeparture);

/* ---------- 今日時間軸：每 10 分鐘有幾列車在跑，標出現在與尖峰 ---------- */
const TL0 = 240, TL1 = 1560, TLB = 10; // 04:00 到隔天 02:00
function buildTimeline() {
  const nb = (TL1 - TL0) / TLB, rail = new Float32Array(nb), mrt = new Float32Array(nb);
  for (const t of TRIPS) {
    const a = effTime(t, 0, 'dep'), b = effTime(t, t.nodes.length - 1, 'arr');
    const arr = sysGroup(t.sys) === 'mrt' ? mrt : rail;
    for (let k = Math.max(0, Math.floor((a - TL0) / TLB)); k < nb && TL0 + k * TLB <= b; k++) arr[k]++;
  }
  let peak = 0, pk = 0;
  for (let k = 0; k < nb; k++) if (rail[k] + mrt[k] > peak) { peak = rail[k] + mrt[k]; pk = k; }
  HUD.tl = { rail, mrt, nb, peak, pk, n: TRIPS.length };
}
function drawTimeline() {
  const cv = $('#hudcv'); if (!cv || !cv.offsetWidth) return;
  if (!HUD.tl || HUD.tl.n !== TRIPS.length || performance.now() - HUD.tlAt > 120e3) { buildTimeline(); HUD.tlAt = performance.now(); }
  const T = HUD.tl, g = cv.getContext('2d'), W = cv.width, H = cv.height, top = 12, base = H - 14;
  g.clearRect(0, 0, W, H);
  const bw = W / T.nb, sc = (base - top) / Math.max(1, T.peak);
  for (let k = 0; k < T.nb; k++) {
    const hr = T.rail[k] * sc, hm = T.mrt[k] * sc;
    g.fillStyle = 'rgba(79,163,224,.55)'; g.fillRect(k * bw + 0.5, base - hm, bw - 1, hm);
    g.fillStyle = 'rgba(242,196,109,.75)'; g.fillRect(k * bw + 0.5, base - hm - hr, bw - 1, hr);
  }
  g.font = '500 19px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(163,177,188,.8)'; g.textBaseline = 'bottom';
  for (let h = 6; h <= 24; h += 3) { const x = (h * 60 - TL0) / (TL1 - TL0) * W; g.fillRect(x, base, 1, 4); g.fillText(String(h % 24).padStart(2, '0'), x - 11, H + 3); }
  // 尖峰
  const px = (T.pk + 0.5) * bw;
  g.fillStyle = 'rgba(238,243,246,.7)'; g.font = '700 19px "Noto Sans TC", sans-serif'; g.textBaseline = 'top';
  g.fillText('尖峰 ' + fmtHM(TL0 + T.pk * TLB), Math.min(W - 110, Math.max(0, px - 40)), -1);
  // 現在
  let m = curMin(); if (m < TL0) m += 1440;
  const x = (m - TL0) / (TL1 - TL0) * W;
  if (x >= 0 && x <= W) {
    g.fillStyle = '#FF7A6B'; g.fillRect(x - 1, top - 4, 2, base - top + 6);
    g.beginPath(); g.arc(x, top - 4, 4, 0, Math.PI * 2); g.fill();
  }
}

/* ---------- 地圖：前方路線（流動的橘色光線）與滑過車站 ---------- */
// 流動效果：輪流換虛線的起點（MapLibre 官方動畫線的做法），每秒約 12 次
const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
function routeFeatures() {
  const out = [];
  if (!HUD.routes || !S.mapReady) return out;
  const z = map.getZoom(); if (z < 6) return out;
  const b = map.getBounds(), mx = (b.getEast() - b.getWest()) * 0.2, my = (b.getNorth() - b.getSouth()) * 0.2;
  const W = b.getWest() - mx, E = b.getEast() + mx, Sb = b.getSouth() - my, N = b.getNorth() + my;
  const c = map.getCenter(), list = [];
  for (const p of S.positions) {
    const ll = unproj(p.pos.x, p.pos.y);
    if (p.trip !== S.follow && (ll[0] < W || ll[0] > E || ll[1] < Sb || ll[1] > N)) continue;
    list.push({ ...p, d: p.trip === S.follow ? -1 : (ll[0] - c.lng) ** 2 + (ll[1] - c.lat) ** 2 });
  }
  list.sort((a, b) => a.d - b.d);
  const cap = COARSE || Quality.low ? 70 : 160;
  for (const { trip, pos } of list.slice(0, cap)) {
    const m = tripMinute(trip), sel = trip === S.follow;
    let ni = nextStopIdx(trip, m);
    if (ni < 0) continue;
    if (pos.atStation && ni === pos.seg) { ni = nextStopIdx(trip, effTime(trip, pos.seg, 'dep') + 0.01); if (ni < 0) continue; }
    // 跟拍的列車多畫一站
    if (sel) { const n2 = nextStopIdx(trip, effTime(trip, ni, 'dep') + 0.01); if (n2 > ni) ni = n2; }
    const k0 = pos.km, k1 = trip.cum[ni];
    if (k1 - k0 < 0.05) continue;
    const step = Math.max(0.04, (k1 - k0) / (sel ? 80 : 28)), pts = [];
    for (let k = k0; k < k1; k += step) { const q = trackPoint(trip, k); pts.push(unproj(q.x, q.y)); }
    const q = trackPoint(trip, k1); pts.push(unproj(q.x, q.y));
    out.push({ type: 'Feature', properties: { sel, mrt: sysGroup(trip.sys) === 'mrt' }, geometry: { type: 'LineString', coordinates: pts } });
  }
  return out;
}
function pushRoutes(force) {
  if (!S.mapReady || !map.getSource('routes')) return;
  const now = performance.now(), z = map.getZoom();
  const gap = S.follow ? 400 : z < 9 ? 2500 : z < 12 ? 1200 : 500;
  if (!force && now - HUD.routeAt < gap) return;
  HUD.routeAt = now;
  map.getSource('routes').setData({ type: 'FeatureCollection', features: routeFeatures() });
}
function stepDash(now) {
  if (!S.mapReady || !HUD.routes || !map.getLayer('route-flow') || document.hidden) return;
  const fps = COARSE || Quality.low ? 8 : 12;
  if (now - HUD.dashAt < 1000 / fps) return;
  HUD.dashAt = now;
  HUD.dash = (HUD.dash + 1) % DASH.length;
  map.setPaintProperty('route-flow', 'line-dasharray', DASH[HUD.dash]);
}
function initHudMap() {
  map.addSource('routes', { type: 'geojson', data: EMPTY, lineMetrics: true });
  const before = map.getLayer('train-halo') ? 'train-halo' : undefined;
  const fade = a => ['interpolate', ['linear'], ['zoom'], 6, a * 0.6, 8.5, a, 14.5, a, 16.5, 0]; // 近看跟拍時列車在高架上，地面的光線會錯位，淡出
  map.addLayer({ id: 'route-glow', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: HUD.routes ? 'visible' : 'none' },
    paint: { 'line-color': ORANGE, 'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 6], 'line-opacity': fade(0.45),
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['get', 'sel'], 7, 4], 14, ['case', ['get', 'sel'], 16, 10], 18, ['case', ['get', 'sel'], 30, 18]],
      // 越遠越淡：光線從列車往下一站漸漸消失
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,154,60,1)', 0.7, 'rgba(255,154,60,.55)', 1, 'rgba(255,154,60,0)'] } }, before);
  map.addLayer({ id: 'route-flow', type: 'line', source: 'routes', layout: { 'line-join': 'round', visibility: HUD.routes ? 'visible' : 'none' },
    paint: { 'line-color': '#FFD08A', 'line-opacity': fade(0.95), 'line-dasharray': DASH[0],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['get', 'sel'], 2.4, 1.4], 14, ['case', ['get', 'sel'], 4, 2.6], 18, ['case', ['get', 'sel'], 7, 4]] } }, before);
  // 滑過車站：光圈
  map.addLayer({ id: 'st-hl', type: 'circle', source: 'stations', filter: ['==', ['get', 'id'], -1],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 9, 14, 16], 'circle-color': 'rgba(255,154,60,.18)', 'circle-stroke-color': ORANGE, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } }, before);
  if (!COARSE) {
    map.on('mousemove', 'st-dot', e => { const f = e.features && e.features[0]; if (f) hoverStation(NODES[f.properties.id], e.point); });
    map.on('mouseleave', 'st-dot', () => hoverStation(null));
    map.on('mousemove', 'train', e => { const f = e.features && e.features[0]; if (f && !HUD.hoverSt) hoverTrain(TRIPS[f.properties.idx], e.point); });
    map.on('mouseleave', 'train', () => { if (!HUD.hoverSt) hudTip.hidden = true; });
  }
  pushRoutes(true);
}
function placeTip(pt) {
  hudTip.hidden = false;
  const r = map.getCanvas().getBoundingClientRect(), x = r.left + pt.x, y = r.top + pt.y;
  hudTip.style.left = Math.min(x, innerWidth - 290) + 'px'; hudTip.style.top = Math.min(y, innerHeight - 120) + 'px';
}
function hoverStation(n, pt) {
  HUD.hoverSt = n;
  if (!n) { hudTip.hidden = true; try { map.setFilter('st-hl', ['==', ['get', 'id'], -1]); } catch {} return; }
  map.setFilter('st-hl', ['==', ['get', 'id'], n.id]);
  const m = curMin(); let best = null;
  for (const [trip, i] of (NODE_TRIPS.get(n.id) || [])) {
    if (i === trip.nodes.length - 1) continue;
    for (const off of [0, 1440]) { const dep = effTime(trip, i, 'dep') - off; if (dep >= m - 0.3 && (!best || dep < best.dep)) best = { trip, dep }; }
  }
  let html = `<b>${esc(stName(n))}</b> <span class="m">${esc(SYSTEMS[n.sys].name)}</span><br>`;
  if (best) {
    const cd = Math.round(best.dep - m), t = best.trip, late = Math.round(t.liveDelay != null ? t.liveDelay : t.delay || 0);
    html += `下一班 <b>${esc(shortName(t))}</b> 往${esc(t.dest)}<br><span class="a">${fmtHM(best.dep)} · ${cd > 0 ? cd + ' 分後開' : '即將開車'}</span>${t.sys === 'TRA' ? (late >= 1 ? ` <span class="late">誤點 ${late} 分</span>` : ' <span class="m">準點</span>') : ''}`;
  } else html += '<span class="m">接下來沒有班次</span>';
  html += '<br><span class="m">點一下看更多班次</span>';
  hudTip.innerHTML = html; placeTip(pt);
}
function hoverTrain(t, pt) {
  if (!t) return;
  const pos = tripPos(t, curMin()); if (!pos) return;
  const s = tripStatus(t, pos);
  hudTip.innerHTML = `<b>${esc(shortName(t))}</b> <span class="m">${esc(t.origin)} → ${esc(t.dest)}</span><br><span class="st ${s.k}" style="display:inline-block">${esc(s.lab)}</span> <span class="m">${esc(stName(s.st))}</span> <span class="a">${fmtHM(s.t)}</span><br><span class="m">點一下跟著這列車</span>`;
  placeTip(pt);
}

/* ---------- 開關 ---------- */
function setHud(on) {
  HUD.on = on; if (HUD_Q == null) store.set('hud', on);
  document.body.classList.toggle('hud', on);
  $('#hudbtn').setAttribute('aria-pressed', String(on)); $('#hudset').setAttribute('aria-pressed', String(on));
  if (on) { hudRKey = ''; hudRowsKey = ''; hudTick(); }
}
function setRoutes(on) {
  HUD.routes = on; store.set('routes', on);
  $('#routebtn').setAttribute('aria-pressed', String(on));
  if (S.mapReady) for (const l of ['route-glow', 'route-flow']) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
  pushRoutes(true);
}
$('#hudbtn').addEventListener('click', () => setHud(!HUD.on));
$('#hudset').addEventListener('click', () => setHud(!HUD.on));
$('#routebtn').addEventListener('click', () => setRoutes(!HUD.routes));
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey || !$('#intro').hidden && !$('#intro').classList.contains('out')) return;
  if (e.key === 'h' || e.key === 'H') setHud(!HUD.on);
  else if (e.key === 'n' || e.key === 'N') followNextDeparture();
  else if (e.key === 'd' || e.key === 'D') { const night = lookHour() < 5.2 || lookHour() >= 18.7; S.tod = night ? 'day' : 'night'; store.set('tod', S.tod); applyLook(true); hudRKey = ''; }
});

/* ---------- 迴圈：統計每秒一次，跑馬燈與流動線每一格 ---------- */
let hudLast = 0;
function hudTick() {
  if (!S.positions.length) return;
  scanEvents();
  if (!HUD.on) return;
  renderHudL(); renderHudR(); drawTimeline();
}
function hudFrame(now) {
  requestAnimationFrame(hudFrame);
  stepTicker(now);
  stepDash(now);
  pushRoutes();
  if (now - hudLast > 1000) { hudLast = now; hudTick(); }
}
renderTabs();
setHud(HUD.on);
$('#routebtn').setAttribute('aria-pressed', String(HUD.routes));
const hudWait = setInterval(() => { if (S.mapReady && map.getSource('stations')) { clearInterval(hudWait); initHudMap(); } }, 200);
requestAnimationFrame(hudFrame);
