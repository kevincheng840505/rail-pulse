/* ===== 搭一班車專注（番茄鐘） =====
   參考 Focus Train、Forest、Flow 這類專注 App：一個明確的開始動作、專注時畫面只留一張卡、結束有獎勵。
   - 發車看板：選 15／25／50 分，列出「大約這麼久後到站」的真實列車，點一班就上車。
   - 行車中：鏡頭跟著這班車；倒數就是列車到站的時間（會跟著誤點走），底部只留一張行車卡。
   - 到站：響兩聲鐘、蓋一張車票（從哪到哪、幾公里、幾分鐘），接著休息幾分鐘（漫遊看看別的車），再搭下一班。
   只在行車或休息時每秒更新一次畫面，不碰地圖的繪製迴圈，省電模式下也幾乎不耗電。 */
const Focus = (() => {
  const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 台灣日期
  const BREAK = { 15: [3, 10], 25: [5, 15], 50: [10, 20] }; // 短休息、每 4 張車票的長休息
  const F = Object.assign({ D: 25, mode: 'idle', ride: null, breakEnd: 0, breakLen: 0, round: 0, chime: true, day: today(), done: 0, mins: 0, km: 0, log: [] }, store.get('focus2', {}));
  if (!BREAK[F.D]) F.D = 25;
  const newDay = () => { F.day = today(); F.done = 0; F.mins = 0; F.km = 0; F.log = []; F.round = 0; };
  if (F.day !== today()) newDay();
  const save = () => store.set('focus2', F);
  const mmss = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const fmtKm = km => km >= 10 ? String(Math.round(km)) : String(Math.round(km * 10) / 10);

  const card = $('#ride'), board = $('#depart'), ticket = $('#ticket');
  const baseTitle = document.title;
  let trip = null, tickTimer = 0, actx = null, batch = 0;

  /* ---------- 鐘聲：兩聲柔和的鐘（自己合成，不用音檔） ---------- */
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
    } catch {}
  }
  function notify(text) {
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('鐵道脈動', { body: text, silent: true }); } catch {}
  }

  /* ---------- 發車看板：找「大約 D 分鐘後到站」的列車 ---------- */
  const weight = t => t.sys === 'THSR' ? 3 : t.sys === 'TRA' ? (t.type === '區間' ? 1 : 4) : 0.6;
  function candidates(D) {
    const out = [];
    for (const { trip: t, pos } of S.positions) {
      const tm = tripMinute(t); let best = null;
      for (let i = pos.seg + 1; i < t.nodes.length; i++) {
        if (!t.times[i].stop) continue;
        const a = effTime(t, i, 'arr') - tm;
        if (a < D * 0.8) continue;
        if (a > D * 1.25 + 2) break;
        const diff = Math.abs(a - D);
        if (!best || diff < best.diff) best = { i, a, diff };
      }
      if (best) out.push({ t, i: best.i, a: best.a, score: best.diff / D - weight(t) * 0.08 });
    }
    const key = t => [t.sys, t.no || '', t.origin, t.dest, t.line && t.line.id || '', t.times[0].dep].join('|');
    out.sort((x, y) => x.score - y.score || key(x.t).localeCompare(key(y.t)) || x.i - y.i);
    // 不要整頁都是同一種車
    const pick = [], seen = {};
    for (const c of out.slice(batch * 5)) { const k = c.t.sys + c.t.type; if ((seen[k] = (seen[k] || 0) + 1) > 2) continue; pick.push(c); if (pick.length >= 5) break; }
    return pick.length ? pick : out.slice(0, 5);
  }
  let shown = [];
  function renderBoard() {
    for (const b of $('#ddur').children) b.setAttribute('aria-pressed', String(+b.dataset.v === F.D));
    shown = candidates(F.D);
    $('#dlist').innerHTML = shown.length ? shown.map((c, k) => {
      const at = tripPos(c.t, curMin()), from = at ? c.t.nodes[at.seg].name : c.t.origin;
      return `<button data-k="${k}"><i style="background:${c.t.color}"></i><b>${esc(trainTitle(c.t))}</b><span>${esc(from)} → ${esc(c.t.nodes[c.i].name)}</span><em>${Math.round(c.a)} 分</em></button>`;
    }).join('') : '<div class="empty">這個時段沒有剛好的列車，換個時間長度試試。</div>';
    $('#dnote').textContent = `第 ${F.round % 4 + 1} 張車票・之後休息 ${breakFor(F.round % 4 === 3)} 分`;
  }
  const breakFor = long => BREAK[F.D][long ? 1 : 0];
  function openBoard() {
    if (!S.positions.length) return;
    closePicker(); settings.hidden = true; sky.hidden = true; musicPanel.hidden = true; ticket.hidden = true;
    batch = 0; board.hidden = false; $('#scrim').hidden = false; renderBoard();
    setTimeout(() => { const b = $('#dlist button'); if (b) b.focus({ preventScroll: true }); }, 60);
  }
  function closeBoard() { board.hidden = true; if (picker.hidden) $('#scrim').hidden = true; }

  /* ---------- 上車、行車、到站 ---------- */
  function boardTrip(c) {
    closeBoard();
    const p = tripPos(c.t, curMin());
    trip = c.t;
    F.mode = 'ride';
    F.ride = { live: !!c.t.live, serviceDest: c.t.dest, destName: c.t.nodes[c.i].name, sys: c.t.sys, no: c.t.no, origin: c.t.origin, lineId: c.t.line && c.t.line.id, dep0: c.t.times[0].dep, dest: c.i, km0: p ? p.km : c.t.cum[0], from: p ? stationName(c.t, p) : c.t.origin, start: Date.now(), plan: Math.round(c.a),
      // 保留上車時的營運日分鐘數，搭配真實經過時間跨午夜恢復
      sim0: S.simMs, tm0: tripMinute(c.t) };
    save();
    if (S.roam) setRoam(false);
    follow(c.t);
    if (!Music.playing && store.get('music', true)) setMusic(true);
    chime(true);
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {}
    loop(); render();
  }
  // 上車的地方：停在站上就是那一站，行駛中就寫「上一站」
  const stationName = (t, p) => t.nodes[p.seg].name;
  // 使用牆上時鐘計算已行駛時間；重新整理後 S.simMs 會重設，不能用來恢復進度。
  const rideMin = () => F.ride.tm0 + (Date.now() - F.ride.start) / 60000;
  const left = () => trip && F.ride ? (effTime(trip, F.ride.dest, 'arr') - rideMin()) * 60 : 0;
  function arrive() {
    const r = F.ride, t = trip, mins = Math.max(1, Math.round((Date.now() - r.start) / 60000)); // 專注時間記錄真實經過分鐘數（包含誤點）
    const km = Math.max(0, t.cum[r.dest] - r.km0);
    F.done++; F.mins += mins; F.km += km;
    const long = F.round % 4 === 3; F.round++;
    const tk = { n: trainTitle(t), c: t.color, a: r.from, b: t.nodes[r.dest].name, km: Math.round(km * 10) / 10, mins, no: F.done };
    F.log.unshift(tk); F.log.length = Math.min(F.log.length, 20);
    F.mode = 'ticket'; F.ride = null; F.breakLen = breakFor(long); trip = null;
    save(); stopLoop();
    chime(false); notify(`到站 ${tk.b}：完成一段 ${mins} 分鐘的專注`);
    if (document.body.classList.contains('clean')) toggleClean(false);
    showTicket(tk, long);
    render();
  }
  function showTicket(tk, long) {
    ticket.innerHTML = `
      <div class="top">
        <div class="no">今日第 ${tk.no} 張・${today().replace(/-/g, '.')}</div>
        <div class="route"><span>${esc(tk.a)}</span><i></i><span>${esc(tk.b)}</span></div>
        <div class="train">${esc(tk.n)}</div>
        <div class="stamp"><div>到站<small>${hm(curMin())}</small></div></div>
      </div>
      <div class="stats"><div><b>${tk.mins}</b>分鐘專注</div><div><b>${fmtKm(tk.km)}</b>公里</div><div><b>${F.done}</b>今天張數</div></div>
      <div class="acts"><button class="primary" id="tbreak">${long ? '長' : ''}休息 ${F.breakLen} 分鐘</button><button id="tnext">直接搭下一班</button><button id="tdone">先這樣</button></div>`;
    ticket.hidden = false;
    setTimeout(() => $('#tbreak').focus({ preventScroll: true }), 60);
  }
  function startBreak() {
    ticket.hidden = true;
    F.mode = 'break'; F.breakEnd = Date.now() + F.breakLen * 60000; save();
    setRoam(true); // 休息：下車走走，看看別的車
    loop(); render();
  }
  function endAll() {
    ticket.hidden = true; F.mode = 'idle'; F.ride = null; trip = null; save(); stopLoop(); render();
  }
  function getOff() { // 提早下車：不發車票
    const was = F.mode; endAll();
    if (was === 'break' && S.roam) setRoam(false);
  }
  function loop() { stopLoop(); tickTimer = setInterval(tick, 1000); }
  function stopLoop() { clearInterval(tickTimer); tickTimer = 0; }
  function tick() {
    if (F.day !== today()) { newDay(); save(); }
    if (!S.started && TRIPS.length && (F.mode === 'ride' || F.mode === 'break')) {
      closeIntro(() => { if (F.mode === 'break') setRoam(true); }, true);
    }
    if (F.mode === 'ride') {
      if (!trip || !TRIPS.includes(trip)) {
        const restored = findTrip();
        if (!restored) { if (TRIPS.length && !(typeof TDX !== 'undefined' && TDX.loading)) endAll(); return; }
        trip = restored;
        const dest = trip.nodes.findIndex((n, i) => n.name === F.ride.destName && trip.times[i].stop);
        if (dest < 0) return endAll();
        F.ride.dest = dest;
        save();
        if (left() <= 0) return arrive();
        // 只在恢復或重建班表時接回列車；一般手動換車仍視為下車。
        if (S.started && S.follow !== trip) follow(trip);
      }
      // 自己換了別的車或離開跟車：當作下車
      if (S.started && S.follow !== trip && !S.flying) return getOff();
      if (left() <= 0) return arrive();
    } else if (F.mode === 'break' && Date.now() >= F.breakEnd) {
      F.mode = 'idle'; save(); stopLoop();
      chime(true); notify('休息結束，選下一班車吧');
      if (S.roam) setRoam(false);
      render(); openBoard(); return;
    }
    render();
  }
  // 重新整理後找回原本列車：有車次時依車次；捷運以路線與首站發車時間辨識。
  const sameService = t => {
    const r = F.ride;
    if (!r || !r.destName || t.sys !== r.sys || t.origin !== r.origin || t.dest !== r.serviceDest || !!t.live !== r.live) return false;
    if (r.no) return t.no === r.no;
    return r.lineId != null && t.line && t.line.id === r.lineId && Number.isFinite(r.dep0) && Math.abs(t.times[0].dep - r.dep0) < 0.1;
  };
  function findTrip() {
    const r = F.ride; if (!r) return null;
    const all = TRIPS.filter(sameService);
    return all.find(t => tripPos(t, curMin())) || all[0] || null; // 已經到站的也找回來，才能補發車票
  }

  /* ---------- 畫面 ---------- */
  function render() {
    const riding = F.mode === 'ride' && trip, resting = F.mode === 'break';
    document.body.classList.toggle('riding', !!riding);
    document.body.classList.toggle('resting', resting);
    card.hidden = !(riding || resting);
    if (riding) {
      const s = left(), r = F.ride, total = Math.max(60, (effTime(trip, r.dest, 'arr') - r.tm0) * 60);
      card.style.setProperty('--fc', 'var(--accent)');
      $('#rphase').textContent = '專注'; $('#rtrain').textContent = trainTitle(trip);
      $('#rt').textContent = mmss(s);
      $('#rdl').textContent = '往'; $('#rdest').textContent = trip.nodes[r.dest].name;
      $('#reta').textContent = hm(effTime(trip, r.dest, 'arr')) + ' 到站' + (trip.delay ? `・晚 ${trip.delay} 分` : '');
      $('#rbar').style.width = (100 * Math.min(1, 1 - s / total)).toFixed(2) + '%';
      $('#rfrom').textContent = r.from; $('#rto').textContent = trip.nodes[r.dest].name;
      $('#rend').textContent = '下車'; $('#rgo').hidden = true;
      document.title = `${mmss(s)} 往${trip.nodes[r.dest].name}・${baseTitle}`;
    } else if (resting) {
      const s = (F.breakEnd - Date.now()) / 1000;
      card.style.setProperty('--fc', 'var(--ok)');
      $('#rphase').textContent = '休息'; $('#rtrain').textContent = '下車走走，看看別的車';
      $('#rt').textContent = mmss(s);
      $('#rdl').textContent = '下一班'; $('#rdest').textContent = `${F.D} 分鐘`; $('#reta').textContent = hm(minOfDay(F.breakEnd)) + ' 發車';
      $('#rbar').style.width = (100 * Math.min(1, 1 - s / (F.breakLen * 60))).toFixed(2) + '%';
      $('#rfrom').textContent = ''; $('#rto').textContent = '';
      $('#rend').textContent = '結束'; $('#rgo').hidden = false;
      document.title = `${mmss(s)} 休息・${baseTitle}`;
    } else document.title = baseTitle;
    if (!settings.hidden) renderSettings();
  }
  function renderSettings() {
    $('#fstat').textContent = F.done ? `今天 ${F.done} 張車票・專注 ${F.mins >= 60 ? Math.floor(F.mins / 60) + ' 小時 ' : ''}${F.mins % 60 ? F.mins % 60 + ' 分' : ''}・${fmtKm(F.km)} 公里` : '今天還沒搭車專注';
    $('#flog').innerHTML = F.log.slice(0, 5).map(r => `<div><i style="background:${r.c}"></i><b>${esc(r.n)}</b><span>${esc(r.a)} → ${esc(r.b)}</span><em>${r.mins} 分</em></div>`).join('');
    $('#fchime').setAttribute('aria-pressed', String(F.chime));
  }

  /* ---------- 操作 ---------- */
  $('#focusgo').addEventListener('click', openBoard);
  $('#startfocus').addEventListener('click', () => closeIntro(openBoard));
  $('#dclose').addEventListener('click', closeBoard);
  $('#scrim').addEventListener('click', closeBoard);
  $('#ddur').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; F.D = +b.dataset.v; batch = 0; save(); renderBoard(); });
  $('#dmore').addEventListener('click', () => { batch = (batch + 1) % 3; renderBoard(); });
  $('#dlist').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b && shown[+b.dataset.k]) boardTrip(shown[+b.dataset.k]); });
  $('#rend').addEventListener('click', getOff);
  $('#rnow').addEventListener('click', () => { F.mode = 'idle'; save(); stopLoop(); if (S.roam) setRoam(false); render(); openBoard(); });
  ticket.addEventListener('click', e => {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'tbreak') startBreak(); else if (id === 'tnext') { ticket.hidden = true; F.mode = 'idle'; save(); render(); openBoard(); } else if (id === 'tdone') endAll();
  });
  $('#setbtn').addEventListener('click', () => { if (!settings.hidden) renderSettings(); });
  $('#fchime').addEventListener('click', () => { F.chime = !F.chime; save(); renderSettings(); });
  // P：打開發車看板；Esc 先關看板或車票（搶在主程式之前，免得順便離開跟車）
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || !$('#intro').hidden && !$('#intro').classList.contains('out')) return;
    if (e.key === 'Escape' && (!board.hidden || !ticket.hidden)) { if (!board.hidden) closeBoard(); else startBreak(); e.stopImmediatePropagation(); }
    else if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey && F.mode === 'idle') openBoard();
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && tickTimer) tick(); });

  // 重新整理後接續
  if (F.mode === 'ticket') F.mode = 'idle';
  if (F.mode === 'ride' || F.mode === 'break') loop();
  render();
  return { get mode() { return F.mode; } };
})();
