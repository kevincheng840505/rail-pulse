/* ===== 漫遊・專注：番茄鐘就是漫遊的節奏 =====
   按下「漫遊」就開始：
   專注（25 分）＝搭一班車：上一班還要開很久的列車，鏡頭穩穩跟著它，不換車；
     字卡告訴你「專注結束時大約到哪一站」，車開到終點就自動轉乘。
   休息（5 分）＝下車走走：照原本的漫遊，每分鐘換一列車或去機場看飛機。
   倒數一直留在時鐘下面（隱藏介面時在左上角），不用點開任何面板；節奏與今天的車票放在 ⚙ 設定。
   時間以「結束的時間點」記錄並存在這台裝置，重新整理或分頁在背景也不會走偏。
   只在計時中每秒更新一次畫面，不碰地圖的繪製迴圈，省電模式下也幾乎不耗電。 */
const Focus = (() => {
  const PRESETS = { classic: [25, 5, 15], deep: [50, 10, 20], short: [15, 3, 10] };
  const PHASE = {
    focus: { name: '專注', color: 'var(--accent)' },
    short: { name: '休息', color: 'var(--ok)' },
    long: { name: '長休息', color: 'var(--ok)' },
  };
  const LONG_EVERY = 4;
  const today = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); }; // 台灣日期

  // 狀態：phase、是否在跑、結束時間點（跑的時候）或剩餘秒數（暫停時）、本輪已完成幾段、今天的統計與車票
  const F = Object.assign({ preset: 'classic', phase: 'focus', running: false, endAt: 0, left: null, cycle: 0,
    clean: false, chime: true, day: today(), done: 0, mins: 0, km: 0, log: [] }, store.get('focus', {}));
  if (!PRESETS[F.preset] && F.preset !== 'off') F.preset = 'classic';
  const newDay = () => { F.day = today(); F.done = 0; F.mins = 0; F.km = 0; F.log = []; };
  if (F.day !== today()) newDay();
  const save = () => store.set('focus', F);
  const enabled = () => F.preset !== 'off';
  const durOf = ph => (PRESETS[F.preset] || PRESETS.classic)[ph === 'focus' ? 0 : ph === 'short' ? 1 : 2] * 60;
  // 這一段的長度在開始時就固定（F.len），中途換節奏只影響下一段，倒數與累計的分鐘數才會一致
  const total = () => F.len || durOf(F.phase);
  const remaining = () => F.running ? Math.max(0, Math.round((F.endAt - Date.now()) / 1000)) : (F.left ?? total());
  const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const focusing = () => F.running && F.phase === 'focus';

  const line = $('#focusline');
  const baseTitle = document.title;
  let tickTimer = 0, actx = null;

  /* ---------- 提示音：兩聲柔和的鐘聲（自己合成，不用音檔） ---------- */
  function chime(up) {
    if (!F.chime) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime, notes = up ? [659.25, 987.77] : [987.77, 659.25];
      notes.forEach((f, i) => {
        const t = now + i * 0.42;
        [1, 2.76].forEach((h, k) => {
          const o = actx.createOscillator(), g = actx.createGain();
          o.type = 'sine'; o.frequency.value = f * h;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k ? 0.04 : 0.18, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + (k ? 0.6 : 1.8));
          o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 1.9);
        });
      });
      setTimeout(() => { if (actx && !F.running) { actx.close().catch(() => {}); actx = null; } }, 3000);
    } catch {}
  }
  function notify(text) {
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('鐵道脈動', { body: text, silent: true }); } catch {}
  }

  /* ---------- 專注＝搭一班車 ---------- */
  const runLeft = t => effTime(t, t.nodes.length - 1, 'arr') - tripMinute(t);
  // 上車：挑一班還要開過整段專注的列車（偏好自強、普悠瑪、高鐵這種長途車）；都不夠長就挑開最久的
  function pickBoard(mins, not) {
    const pool = S.positions.map(p => p.trip).filter(t => t !== not);
    if (!pool.length) return null;
    const w = t => (t.sys === 'THSR' ? 4 : t.sys === 'TRA' ? (t.type === '區間' ? 1.5 : 5) : 0.5);
    const long = pool.filter(t => runLeft(t) >= mins);
    if (!long.length) return pool.reduce((a, t) => runLeft(t) > runLeft(a) ? t : a, pool[0]);
    let r = Math.random() * long.reduce((a, t) => a + w(t), 0);
    for (const t of long) { r -= w(t); if (r <= 0) return t; }
    return long[0];
  }
  // force：漫遊鈕在專注時是「換一班車」
  function board(force) {
    if (!S.started || !S.positions.length) return;
    const t = S.follow, left = remaining() / 60, watching = typeof AIR !== 'undefined' && AIR.watch;
    if (!force && !watching && t && tripPos(t, curMin()) && runLeft(t) >= left) { if (S.followPaused) setView(S.view); return; }
    const nt = pickBoard(left, force ? t : null); if (nt) follow(nt);
  }
  // 專注時漫遊不自動換車；休息時照常每分鐘換
  function applyPhase() {
    if (!S.roam) return;
    if (focusing()) { S.roamAt = Infinity; board(false); }
    else if (S.roamAt === Infinity) S.roamAt = performance.now() + 2000;
  }
  const _roamNext = roamNext;
  roamNext = function () { if (focusing()) { board(true); S.roamAt = Infinity; return; } return _roamNext.apply(this, arguments); };
  // 漫遊開關＝番茄鐘開關。選了別的車（漫遊關掉但還在跟車）倒數照走；離開跟車才暫停
  const _setRoam = setRoam;
  setRoam = function (on) {
    const r = _setRoam.apply(this, arguments);
    if (S.roam) { if (enabled() && !F.running) start(); else applyPhase(); }
    else if (F.running) setTimeout(() => { if (!S.roam && !S.follow && F.running) pause(); }, 0);
    return r;
  };

  // 車票：專注時跟著的列車，從哪一站到哪一站、跑了幾公里
  let ride = null;
  const stationAt = (t, km) => { let i = 0; while (i < t.nodes.length - 1 && t.cum[i + 1] <= km + 0.05) i++; return t.nodes[i].name; };
  // 終點寫「下一站」：只跑了半站時才不會變成「桃園 → 桃園」
  const stationAhead = (t, km) => { let i = 0; while (i < t.nodes.length - 1 && t.cum[i] < km - 0.05) i++; return t.nodes[i].name; };
  function closeTicket() {
    if (!ride) return;
    const r = ride; ride = null;
    const km = r.km1 - r.km0; if (km < 0.2) return;
    F.km += km;
    F.log.unshift({ n: trainTitle(r.trip), c: r.trip.color, a: stationAt(r.trip, r.km0), b: stationAhead(r.trip, r.km1), km: Math.round(km * 10) / 10 });
    F.log.length = Math.min(F.log.length, 12);
    save();
  }
  function trackRide() {
    if (!focusing()) return closeTicket();
    const t = S.follow, pos = t && tripPos(t, curMin());
    if (ride && ride.trip !== t) closeTicket();
    if (!t) return;
    if (!pos) { closeTicket(); board(true); return; } // 到終點了：轉乘
    if (!ride) ride = { trip: t, km0: pos.km, km1: pos.km };
    else ride.km1 = Math.max(ride.km1, pos.km);
  }
  // 字卡上的一行：專注結束時大約在哪裡
  function capRow(t) {
    if (!focusing() || t !== S.follow) return '';
    const end = tripMinute(t) + remaining() / 60, n = t.nodes.length;
    let where;
    if (end >= effTime(t, n - 1, 'arr')) where = `先到終點${t.nodes[n - 1].name}，到時幫你轉乘`;
    else { let i = 0; while (i < n - 1 && effTime(t, i + 1, 'arr') <= end) i++; where = `大約在${t.nodes[i].name}${i < n - 1 && effTime(t, i, 'dep') < end ? '到' + t.nodes[i + 1].name + '之間' : ''}`; }
    return `<div class="frow"><span class="fk">專注 ${Math.ceil(remaining() / 60)} 分後</span><span>${esc(where)}</span></div>`;
  }

  /* ---------- 計時 ---------- */
  function start() {
    if (!enabled()) return;
    if (!F.len) F.len = durOf(F.phase);
    F.endAt = Date.now() + remaining() * 1000; F.running = true; F.left = null; save();
    if (F.phase === 'focus' && F.clean && S.started && !document.body.classList.contains('clean')) toggleClean(true);
    applyPhase();
    loop(); render(); renderCaption(true);
  }
  function pause() { trackRide(); F.left = remaining(); F.running = false; closeTicket(); save(); stopLoop(); render(); renderCaption(true); }
  function stop() { closeTicket(); F.running = false; F.left = null; F.len = 0; F.phase = 'focus'; F.cycle = 0; save(); stopLoop(); if (S.roam && S.roamAt === Infinity) S.roamAt = performance.now() + 2000; render(); renderCaption(true); }
  function finish(skipped) {
    const was = F.phase;
    if (was === 'focus') {
      trackRide(); closeTicket();
      if (!skipped) { F.done++; F.mins += Math.round(total() / 60); }
      F.cycle++;
      F.phase = F.cycle % LONG_EVERY === 0 ? 'long' : 'short';
    } else F.phase = 'focus';
    F.running = false; F.left = null; F.len = 0; stopLoop();
    if (!skipped) {
      chime(F.phase === 'focus');
      notify(was === 'focus' ? `完成一段專注，${PHASE[F.phase].name} ${durOf(F.phase) / 60} 分鐘` : '休息結束，上車繼續專注');
    }
    if (was === 'focus' && document.body.classList.contains('clean') && F.clean) toggleClean(false);
    save();
    // 休息：下車走走（漫遊）；一段接一段，直到你停下漫遊
    if (was === 'focus' && S.started && !S.roam) setRoam(true);
    start();
  }
  function loop() { stopLoop(); tickTimer = setInterval(tick, 1000); }
  function stopLoop() { clearInterval(tickTimer); tickTimer = 0; }
  function tick() {
    if (F.day !== today()) { newDay(); save(); }
    trackRide();
    if (F.running && remaining() <= 0) finish(false); else render();
  }
  const toggle = () => { if (F.running) pause(); else if (enabled()) { if (!S.roam && !S.follow) setRoam(true); else start(); } };

  /* ---------- 畫面 ---------- */
  const fmtKm = km => km >= 10 ? Math.round(km) + '' : (Math.round(km * 10) / 10) + '';
  function render() {
    const left = remaining(), len = total(), P = PHASE[F.phase];
    const paused = !F.running && left < len;
    // 時鐘下面的一行：專注 18:42 · 自強 106 次，下面一條細細的進度
    line.hidden = !enabled() || !(F.running || paused);
    if (!line.hidden) {
      line.style.setProperty('--fc', P.color);
      line.classList.toggle('paused', paused);
      line.querySelector('.k').textContent = paused ? '暫停' : P.name;
      line.querySelector('.t').textContent = mmss(left);
      line.querySelector('.s').textContent = paused ? '點一下繼續' : F.phase === 'focus' ? (S.follow ? trainTitle(S.follow) : '') : '到處看看';
      line.querySelector('.bar i').style.width = (100 * (1 - left / len)).toFixed(2) + '%';
      line.setAttribute('aria-label', `${P.name} 剩 ${mmss(left)}，點一下${paused ? '繼續' : '暫停'}`);
    }
    document.title = F.running ? `${mmss(left)} ${P.name}・${baseTitle}` : baseTitle;
    if (!settings.hidden) renderSettings();
  }
  function renderSettings() {
    const km = F.km + (ride ? ride.km1 - ride.km0 : 0);
    $('#fstat').textContent = F.done || km >= 0.1 ? `今天專注 ${F.done} 段・${F.mins >= 60 ? Math.floor(F.mins / 60) + ' 小時 ' : ''}${F.mins % 60 || !F.mins ? F.mins % 60 + ' 分' : ''}${km >= 0.1 ? '・跟車 ' + fmtKm(km) + ' 公里' : ''}` : '今天還沒開始專注';
    const live = ride && ride.km1 - ride.km0 >= 0.1 ? [{ n: trainTitle(ride.trip), c: ride.trip.color, a: stationAt(ride.trip, ride.km0), b: '行駛中', km: Math.round((ride.km1 - ride.km0) * 10) / 10 }] : [];
    $('#flog').innerHTML = live.concat(F.log).slice(0, 5).map(r => `<div><i style="background:${r.c}"></i><b>${esc(r.n)}</b><span>${esc(r.a)} → ${esc(r.b)}</span><em>${fmtKm(r.km)} km</em></div>`).join('');
    for (const b of $('#fpreset').children) b.setAttribute('aria-pressed', String(b.dataset.v === F.preset));
    $('#fclean').setAttribute('aria-pressed', String(F.clean));
    $('#fchime').setAttribute('aria-pressed', String(F.chime));
  }

  /* ---------- 操作 ---------- */
  line.addEventListener('click', toggle);
  $('#setbtn').addEventListener('click', () => { if (!settings.hidden) renderSettings(); });
  $('#fpreset').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b || b.dataset.v === F.preset) return;
    const was = enabled(); F.preset = b.dataset.v; save();
    if (!enabled()) stop(); // 只漫遊：關掉倒數，漫遊照舊
    else if (!was && S.roam) start();
    render(); renderSettings(); // 進行中的這一段維持原長度，下一段才用新節奏
  });
  $('#freset').addEventListener('click', () => { stop(); if (S.roam) start(); renderSettings(); });
  for (const [id, key] of [['#fclean', 'clean'], ['#fchime', 'chime']]) $(id).addEventListener('click', () => { F[key] = !F[key]; save(); renderSettings(); });
  // P：暫停／繼續
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || !$('#intro').hidden && !$('#intro').classList.contains('out')) return;
    if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) toggle();
  }, true);
  // 分頁切回來時立刻校正一次（背景分頁的計時器會被瀏覽器放慢）
  document.addEventListener('visibilitychange', () => { if (!document.hidden && F.running) tick(); });

  // 重新整理後接續：如果在離開期間已經結束，直接進到下一段
  if (F.running) { if (remaining() <= 0) finish(false); else loop(); }
  render();
  return { capRow, get focusing() { return focusing(); } };
})();
