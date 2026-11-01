/* ===== 專注時刻：番茄鐘 =====
   一段專注（行駛）→ 一段休息（停靠）；每完成 4 段專注，休息拉長。
   時間以「結束的時間點」記錄並存在這台裝置，重新整理或分頁在背景也不會走偏。
   只在計時中每秒更新一次畫面，不碰地圖的繪製迴圈，省電模式下也幾乎不耗電。 */
(() => {
  const PRESETS = { classic: [25, 5, 15], deep: [50, 10, 20], short: [15, 3, 10] };
  const PHASE = {
    focus: { name: '專注', sub: '行駛中', color: 'var(--accent)' },
    short: { name: '休息', sub: '停靠一下', color: 'var(--ok)' },
    long: { name: '長休息', sub: '大站停靠', color: 'var(--ok)' },
  };
  const LONG_EVERY = 4;
  const today = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); }; // 台灣日期

  // 狀態：phase、是否在跑、結束時間點（跑的時候）或剩餘秒數（暫停時）、本輪已完成幾段
  const F = Object.assign({ preset: 'classic', phase: 'focus', running: false, endAt: 0, left: null, cycle: 0,
    music: true, clean: false, auto: false, chime: true, day: today(), done: 0, mins: 0 }, store.get('focus', {}));
  if (F.day !== today()) { F.day = today(); F.done = 0; F.mins = 0; }
  const save = () => store.set('focus', F);
  const durOf = ph => (PRESETS[F.preset] || PRESETS.classic)[ph === 'focus' ? 0 : ph === 'short' ? 1 : 2] * 60;
  const remaining = () => F.running ? Math.max(0, Math.round((F.endAt - Date.now()) / 1000)) : (F.left ?? durOf(F.phase));
  const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  const panel = $('#focus'), chip = $('#focuschip'), btn = $('#focusbtn');
  const RING = 2 * Math.PI * 54;
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
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('鐵道脈動・專注時刻', { body: text, silent: true }); } catch {}
  }

  /* ---------- 計時 ---------- */
  function start() {
    F.endAt = Date.now() + remaining() * 1000; F.running = true; F.left = null; save();
    if (F.phase === 'focus') {
      if (F.music && !Music.playing) setMusic(true);
      if (F.clean && !document.body.classList.contains('clean')) { panel.hidden = true; toggleClean(true); }
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {}
    }
    loop(); render();
  }
  function pause() { F.left = remaining(); F.running = false; save(); stopLoop(); render(); }
  function reset() { F.running = false; F.left = null; F.phase = 'focus'; F.cycle = 0; save(); stopLoop(); render(); }
  function finish(skipped) {
    const was = F.phase;
    if (was === 'focus') {
      if (!skipped) { F.done++; F.mins += durOf('focus') / 60; }
      F.cycle++;
      F.phase = F.cycle % LONG_EVERY === 0 ? 'long' : 'short';
    } else F.phase = 'focus';
    F.running = false; F.left = null; stopLoop();
    if (!skipped) {
      chime(F.phase === 'focus');
      notify(was === 'focus' ? `完成一段專注，${PHASE[F.phase].name} ${durOf(F.phase) / 60} 分鐘` : '休息結束，準備下一段專注');
      if (was === 'focus' && document.body.classList.contains('clean')) toggleClean(false);
    }
    save();
    if (F.auto && !skipped) start(); else render();
  }
  function loop() { stopLoop(); tickTimer = setInterval(tick, 1000); }
  function stopLoop() { clearInterval(tickTimer); tickTimer = 0; }
  function tick() {
    if (F.day !== today()) { F.day = today(); F.done = 0; F.mins = 0; save(); }
    if (F.running && remaining() <= 0) finish(false); else render();
  }

  /* ---------- 畫面 ---------- */
  function render() {
    const left = remaining(), total = durOf(F.phase), P = PHASE[F.phase];
    const active = F.running || left < total || F.cycle > 0;
    btn.setAttribute('aria-pressed', String(F.running));
    chip.hidden = !active;
    chip.style.setProperty('--fc', P.color);
    chip.classList.toggle('paused', !F.running);
    chip.querySelector('.t').textContent = mmss(left);
    chip.querySelector('.k').textContent = F.running ? P.name : (left < total ? '暫停' : P.name + '・待發');
    chip.setAttribute('aria-label', `${P.name} 剩 ${mmss(left)}，點一下打開專注面板`);
    document.title = F.running ? `${mmss(left)} ${P.name}・${baseTitle}` : baseTitle;
    if (panel.hidden) return;
    panel.style.setProperty('--fc', P.color);
    $('#fphase').textContent = P.name; $('#fsub').textContent = P.sub;
    $('#ftime').textContent = mmss(left);
    $('#fring').style.strokeDashoffset = String(RING * (1 - left / total));
    const go = $('#fgo'); go.textContent = F.running ? '暫停' : left < total ? '繼續' : F.phase === 'focus' ? '開始專注' : '開始休息';
    // 這一輪的四格：已完成實心、進行中半透明
    const inRound = F.cycle % LONG_EVERY, cur = F.phase === 'focus' ? inRound : -1;
    $('#fdots').innerHTML = Array.from({ length: LONG_EVERY }, (_, i) => `<i class="${i < inRound || (F.phase === 'long' && F.cycle > 0) ? 'on' : i === cur ? 'cur' : ''}"></i>`).join('');
    $('#fstat').textContent = F.done ? `今天完成 ${F.done} 段・專注 ${F.mins >= 60 ? Math.floor(F.mins / 60) + ' 小時 ' : ''}${F.mins % 60 ? F.mins % 60 + ' 分' : ''}` : '今天還沒開始';
    for (const b of $('#fpreset').children) b.setAttribute('aria-pressed', String(b.dataset.v === F.preset));
    $('#fmusic').setAttribute('aria-pressed', String(F.music));
    $('#fclean').setAttribute('aria-pressed', String(F.clean));
    $('#fauto').setAttribute('aria-pressed', String(F.auto));
    $('#fchime').setAttribute('aria-pressed', String(F.chime));
  }

  /* ---------- 操作 ---------- */
  function open(on = panel.hidden) {
    panel.hidden = !on;
    if (on) { settings.hidden = true; sky.hidden = true; musicPanel.hidden = true; closePicker(); render(); }
  }
  btn.addEventListener('click', () => open());
  chip.addEventListener('click', () => { if (document.body.classList.contains('clean')) { F.running ? pause() : start(); } else open(true); });
  // 其他面板打開時收起這個面板
  ['#musicbtn', '#skybtn', '#setbtn', '#pickbtn'].forEach(id => $(id).addEventListener('click', () => { panel.hidden = true; }));
  $('#fgo').addEventListener('click', () => F.running ? pause() : start());
  $('#fskip').addEventListener('click', () => finish(true));
  $('#freset').addEventListener('click', reset);
  $('#fpreset').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b || b.dataset.v === F.preset) return;
    F.preset = b.dataset.v; if (!F.running) F.left = null; save(); render();
  });
  for (const [id, key] of [['#fmusic', 'music'], ['#fclean', 'clean'], ['#fauto', 'auto'], ['#fchime', 'chime']])
    $(id).addEventListener('click', () => { F[key] = !F[key]; save(); render(); });
  // P：開始／暫停；Esc 先關掉這個面板（搶在主程式之前，免得順便離開跟車）
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'Escape' && !panel.hidden && !document.body.classList.contains('clean')) { panel.hidden = true; e.stopImmediatePropagation(); }
    else if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) { F.running ? pause() : start(); }
  }, true);
  // 分頁切回來時立刻校正一次（背景分頁的計時器會被瀏覽器放慢）
  document.addEventListener('visibilitychange', () => { if (!document.hidden && F.running) tick(); });

  // 重新整理後接續：如果在離開期間已經結束，直接進到下一段
  if (F.running) { if (remaining() <= 0) finish(false); else loop(); }
  render();
})();
