/* ===== 背景音樂：以 Web Audio 即時合成的 Lofi／咖啡廳曲目（沒有音檔，也沒有版權問題） =====
   每首曲子都有固定的和弦進行、速度與長度，每一小節的內容由「曲目＋小節編號」決定，
   所以同一首每次聽都一樣，也可以拖進度條跳到任何位置。 */
const Music = (() => {
  let ctx = null, master = null, verb = null, noise = null, crackleBuf = null, timer = null;
  let playing = false, idx = 0, sess = null, pausedAt = 0, cut = 0; // cut：從小節中間開始播時，比這個時間早的音符不排
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(); } catch {} });
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const rngOf = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* ---------- 和弦 ---------- */
  const Q = { maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], 7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14], 13: [0, 4, 10, 14, 21], sus: [0, 5, 7, 10, 14], m11: [0, 3, 7, 10, 17], '6/9': [0, 4, 9, 14] };
  const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  function chord(sym) {
    const m = sym.match(/^([A-G]b?)(.*)$/), root = NOTE[m[1]], iv = Q[m[2]];
    const bass = 48 + root - (root >= 5 ? 12 : 0); // 低音落在 F2–E3：手機喇叭也聽得到
    // 上方聲部放在 F3–E5 之間，避免太低糊在一起
    const tones = iv.slice(1).map(i => { let n = 48 + root + i; while (n < 53) n += 12; while (n > 76) n -= 12; return n; }).sort((a, b) => a - b);
    return { root, bass, tones, iv };
  }

  /* ---------- 曲目 ----------
     style：lofi（慵懶 swing 鼓、黑膠底噪、溫暖的電鋼琴）、cafe（爵士刷鼓與走路貝斯）、bossa（巴薩諾瓦撥弦） */
  const TRACKS = [
    { title: '月台晚風', mood: 'Lofi', style: 'lofi', bpm: 72, keys: 'rhodes', prog: ['Fmaj7', 'Em7', 'Dm9', 'Cmaj9'], scale: [0, 2, 4, 7, 9] },
    { title: '窗邊的拿鐵', mood: '咖啡廳爵士', style: 'cafe', bpm: 100, keys: 'piano', prog: ['Cm9', 'F13', 'Bbmaj7', 'Ebmaj7', 'Am7', 'D7', 'Gm7', 'G7'], scale: [10, 0, 2, 5, 7] },
    { title: '雨天區間車', mood: 'Lofi', style: 'lofi', bpm: 68, keys: 'rhodes', prog: ['Am9', 'Dm9', 'G13', 'Cmaj9'], scale: [9, 0, 2, 4, 7], rainy: true },
    { title: '午後慢車', mood: '巴薩諾瓦', style: 'bossa', bpm: 108, keys: 'pluck', prog: ['Dmaj7', 'Bm7', 'Em9', 'A13'], scale: [2, 4, 6, 9, 11] },
    { title: '夜班列車', mood: 'Lofi', style: 'lofi', bpm: 64, keys: 'rhodes', prog: ['Ebmaj7', 'Cm9', 'Abmaj7', 'Bbsus'], scale: [3, 5, 7, 10, 0] },
    { title: '海線晴天', mood: '輕快咖啡廳', style: 'cafe', bpm: 112, keys: 'piano', prog: ['Cmaj7', 'Am7', 'Dm9', 'G13', 'Em7', 'A7', 'Dm7', 'G7'], scale: [0, 2, 4, 7, 9] },
    { title: '山線隧道', mood: 'Lofi', style: 'lofi', bpm: 76, keys: 'rhodes', prog: ['Gm9', 'Cm11', 'Fsus', 'Bbmaj7', 'Ebmaj7', 'Am7', 'D7', 'Gm9'], scale: [7, 10, 0, 2, 5] },
    { title: '鳳梨酥與冰咖啡', mood: '巴薩諾瓦', style: 'bossa', bpm: 116, keys: 'pluck', prog: ['Fmaj7', 'Gm7', 'Am7', 'Gm7', 'Bbmaj7', 'C9', 'Fmaj7', 'C9'], scale: [5, 7, 9, 0, 2] },
  ].map((t, i) => {
    const bar = 240 / t.bpm, bars = Math.max(32, Math.round(170 / bar / 8) * 8);
    return { ...t, id: i, bar, bars, dur: bars * bar, chords: t.prog.map(chord) };
  });

  /* ---------- 音色 ---------- */
  function env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, sus), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  }
  function osc(type, f, t, end, out, det = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
    o.connect(out); o.start(t); o.stop(end); return o;
  }
  // 電鋼琴：正弦基音＋輕微二倍音，慢慢衰減，帶一點顫音
  function rhodes(bus, m, t, len, vel) {
    if (t < cut) return;
    const g = ctx.createGain(); env(g, t, 0.01, 0.11 * vel, 1.2, 0.035 * vel, 0.6, t + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    g.connect(lp); lp.connect(bus);
    const end = t + len + 0.7;
    osc('sine', hz(m), t, end, g, -4);
    const h = ctx.createGain(); h.gain.value = 0.18; h.connect(g); osc('sine', hz(m) * 2, t, end, h, 3);
    const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 4.2; tg.gain.value = 0.012 * vel;
    trem.connect(tg); tg.connect(g.gain); trem.start(t); trem.stop(end);
  }
  // 鋼琴：快起、指數衰減
  function piano(bus, m, t, len, vel) {
    if (t < cut) return;
    const g = ctx.createGain(); env(g, t, 0.006, 0.13 * vel, 0.5, 0.03 * vel, 0.5, t + Math.min(len, 2.5));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    g.connect(lp); lp.connect(bus);
    const end = t + Math.min(len, 2.5) + 0.6;
    osc('sine', hz(m), t, end, g);
    const h = ctx.createGain(); h.gain.value = 0.22; h.connect(g); osc('triangle', hz(m) * 2, t, end, h);
    const h3 = ctx.createGain(); h3.gain.value = 0.06; h3.connect(g); osc('sine', hz(m) * 3, t, end, h3);
  }
  // 撥弦（像尼龍弦吉他）
  function pluck(bus, m, t, len, vel) {
    if (t < cut) return;
    const g = ctx.createGain(); env(g, t, 0.004, 0.14 * vel, 0.35, 0.012 * vel, 0.3, t + Math.min(len, 1.2));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.4);
    g.connect(lp); lp.connect(bus);
    const end = t + Math.min(len, 1.2) + 0.4;
    osc('triangle', hz(m), t, end, g); osc('sawtooth', hz(m), t, end, g, 6);
  }
  const KEYS = { rhodes, piano, pluck };
  function bass(bus, m, t, len, vel) {
    if (t < cut) return;
    const g = ctx.createGain(); env(g, t, 0.012, 0.26 * vel, 0.4, 0.13 * vel, 0.12, t + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    g.connect(lp); lp.connect(bus);
    osc('sine', hz(m), t, t + len + 0.2, g); osc('triangle', hz(m), t, t + len + 0.2, g);
  }
  function noiseHit(bus, t, type, f, q, peak, dec) {
    if (t < cut) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.05);
  }
  function kick(bus, t, vel) {
    if (t < cut) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
  }
  const snare = (bus, t, vel) => { if (t < cut) return; noiseHit(bus, t, 'bandpass', 1700, 0.8, 0.22 * vel, 0.2); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 185; g.gain.setValueAtTime(0.08 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.1); };
  const hat = (bus, t, vel) => noiseHit(bus, t, 'highpass', 7500, 0.5, 0.05 * vel, 0.045);
  const brush = (bus, t, vel, long) => noiseHit(bus, t, 'bandpass', 3800, 0.6, 0.05 * vel, long ? 0.32 : 0.12);
  const rim = (bus, t, vel) => noiseHit(bus, t, 'bandpass', 2600, 6, 0.12 * vel, 0.05);

  /* ---------- 一小節 ---------- */
  function scheduleBar(S, k) {
    const T = S.track, t0 = S.startAt + k * T.bar, st = T.bar / 16, bus = S.bus;
    const R = rngOf(T.id * 7919 + k * 104729 + 17);
    const n = T.chords.length, C = T.chords[k % n], next = T.chords[(k + 1) % n];
    const intro = k < 4, outro = k >= T.bars - 4, brk = T.bars >= 40 && k >= T.bars / 2 - 2 && k < T.bars / 2 + 2;
    const fade = outro ? 1 - (k - (T.bars - 4)) / 5 : intro ? 0.6 + k * 0.1 : 1;
    const sw = T.style === 'bossa' ? 0 : 0.22; // 搖擺：反拍的十六分音符往後拖
    const at = s => t0 + s * st + (s % 2 ? sw * st : 0) + (R() - 0.5) * 0.008;
    const play = KEYS[T.keys];

    // 和弦
    if (T.style === 'lofi') {
      C.tones.forEach((m, i) => play(bus, m, at(0) + i * 0.018, T.bar * 0.9, 0.8 * fade));
      if (R() < 0.45 && !outro) C.tones.slice(-2).forEach(m => play(bus, m + 12, at(10), T.bar * 0.3, 0.35 * fade));
    } else if (T.style === 'cafe') {
      const hits = R() < 0.5 ? [0, 6] : [0, 7, 10];
      hits.forEach((s, j) => C.tones.forEach(m => play(bus, m, at(s), j === 0 ? T.bar * 0.35 : T.bar * 0.18, (j === 0 ? 0.75 : 0.55) * fade)));
    } else {
      [[0, 0], [3, 1], [6, 1], [10, 1], [12, 0], [14, 1]].forEach(([s, chordHit]) => {
        if (chordHit) C.tones.slice(0, 3).forEach((m, i) => play(bus, m, at(s) + i * 0.012, st * 2.5, 0.6 * fade));
      });
    }

    // 低音
    if (!intro || k >= 2) {
      if (T.style === 'cafe' && !brk) {
        const steps = [C.bass, C.bass + C.iv[2] - 12 + 12 * (R() < 0.5), C.bass + C.iv[1], next.bass + (R() < 0.5 ? 1 : -1)];
        steps.forEach((m, b) => bass(bus, m, at(b * 4), T.bar / 4 * 0.85, 0.85 * fade));
      } else if (T.style === 'bossa') {
        [[0, C.bass], [6, C.bass + 7], [8, C.bass + 7], [14, C.bass]].forEach(([s, m]) => bass(bus, m, at(s), st * 1.8, 0.8 * fade));
      } else {
        bass(bus, C.bass, at(0), T.bar * 0.55, 0.9 * fade);
        if (R() < 0.6) bass(bus, C.bass + (R() < 0.5 ? 7 : 12), at(10), T.bar * 0.25, 0.6 * fade);
      }
    }

    // 鼓
    if (!intro && !outro && !brk) {
      if (T.style === 'lofi') {
        [0, R() < 0.5 ? 7 : 8, 10].forEach((s, i) => kick(bus, at(s), i ? 0.65 : 0.9));
        [4, 12].forEach(s => snare(bus, at(s), 0.8));
        for (let s = 0; s < 16; s += 2) hat(bus, at(s), s % 4 ? 0.55 : 0.9);
        if (R() < 0.3) hat(bus, at(15), 0.35);
      } else if (T.style === 'cafe') {
        for (let b = 0; b < 4; b++) brush(bus, at(b * 4), 0.8, true);
        [2, 6, 10, 14].forEach(s => brush(bus, at(s), 0.5, false));
        [4, 12].forEach(s => rim(bus, at(s), 0.5));
        kick(bus, at(0), 0.4); kick(bus, at(8), 0.3);
      } else {
        for (let s = 0; s < 16; s++) hat(bus, at(s), s % 2 ? 0.2 : 0.4);
        [0, 6, 8, 14].forEach(s => kick(bus, at(s), 0.45));
        [3, 6, 10, 12].forEach(s => rim(bus, at(s), 0.45));
      }
    }

    // 旋律：在曲子的五聲音階上小步移動，兩小節一句，句尾休息
    if (!intro && k < T.bars - 2) {
      const phraseRest = (k % 4) === 3, base = 72 + (T.scale[0] > 6 ? T.scale[0] - 12 : T.scale[0]);
      const sc = []; for (let o = -1; o <= 1; o++) T.scale.forEach(d => sc.push(base - T.scale[0] + d + 12 * o));
      sc.sort((a, b) => a - b);
      let p = S.mel ?? Math.floor(sc.length / 2);
      for (let s = 0; s < (phraseRest ? 8 : 16); s += 2) {
        if (R() > (T.style === 'lofi' ? 0.38 : 0.5)) continue;
        p = Math.max(0, Math.min(sc.length - 1, p + Math.round((R() - 0.5) * 4)));
        let m = sc[p];
        if (s === 0) m = sc.reduce((a, b) => (C.tones.some(c => (c - b) % 12 === 0) && Math.abs(b - m) < Math.abs(a - m) ? b : a), m);
        const len = st * (R() < 0.3 ? 4 : 2);
        (T.keys === 'pluck' ? pluck : piano)(bus, m, at(s), len, (0.55 + R() * 0.3) * fade);
      }
      S.mel = p;
    }
  }

  /* ---------- 播放控制 ---------- */
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8, ib = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ib;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    master.connect(comp); master.connect(verb); verb.connect(wet); wet.connect(comp); comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    { const d = crackleBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.004 + (Math.random() < 0.0003 ? (Math.random() - 0.5) * 0.6 : 0); }
  }
  function endSession() {
    if (!sess) return;
    const s = sess, now = ctx.currentTime; sess = null;
    s.bus.gain.cancelScheduledValues(now); s.bus.gain.setValueAtTime(s.bus.gain.value, now); s.bus.gain.linearRampToValueAtTime(0, now + 0.25);
    try { s.crackle && s.crackle.stop(now + 0.3); } catch {}
    setTimeout(() => { try { s.bus.disconnect(); } catch {} }, 4000);
  }
  function startSession(at) {
    endSession();
    const T = TRACKS[idx], now = ctx.currentTime;
    const k = Math.max(0, Math.min(T.bars - 1, Math.floor(at / T.bar)));
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(1, now + (at > 0 ? 0.3 : 0.05));
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = T.style === 'lofi' ? 3400 : 9000;
    bus.connect(tone); tone.connect(master);
    // 保留小節內的位置：時間軸對齊到 at，這一小節已經過去的音符不排
    sess = { track: T, bus, startAt: now + 0.12 - Math.min(at, T.dur - 0.5), next: k, mel: null }; cut = now + 0.1;
    if (T.style === 'lofi') {
      const c = ctx.createBufferSource(); c.buffer = crackleBuf; c.loop = true;
      const cg = ctx.createGain(); cg.gain.value = 0.9; c.connect(cg); cg.connect(bus); c.start(now); sess.crackle = c;
    }
    clearInterval(timer); timer = setInterval(tick, 100); tick();
  }
  function tick() {
    if (!sess) return;
    const S = sess, T = S.track, now = ctx.currentTime;
    while (S.next < T.bars && S.startAt + S.next * T.bar < now + 0.7) scheduleBar(S, S.next++);
    if (now > S.startAt + T.dur + 1.2) { idx = (idx + 1) % TRACKS.length; store('track', idx); startSession(0); emit(); }
  }
  function store(k, v) { try { localStorage.setItem('rp.music.' + k, JSON.stringify(v)); } catch {} }
  try { const v = JSON.parse(localStorage.getItem('rp.music.track')); if (Number.isInteger(v) && v >= 0 && v < TRACKS.length) idx = v; } catch {}

  /* 雨聲：濾波過的白噪音，跟著天氣調整音量（只在音樂開著時出聲） */
  let rainGain = null, rainLevel = 0;
  function applyRain() {
    if (!ctx) return;
    if (!rainGain) {
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      s.connect(bp); bp.connect(rainGain); rainGain.connect(ctx.destination); s.start();
    }
    const now = ctx.currentTime;
    rainGain.gain.cancelScheduledValues(now); rainGain.gain.setValueAtTime(rainGain.gain.value, now);
    rainGain.gain.linearRampToValueAtTime(playing ? rainLevel * 0.07 : 0, now + 2);
  }

  const api = {
    tracks: TRACKS.map(({ id, title, mood, dur }) => ({ id, title, mood, dur })),
    get playing() { return playing; },
    get index() { return idx; },
    position() { return sess && ctx ? Math.max(0, Math.min(sess.track.dur, ctx.currentTime - sess.startAt)) : pausedAt; },
    onChange(f) { listeners.add(f); },
    setRain(level) { rainLevel = level; applyRain(); },
    async play(i, at = 0) {
      if (!ctx) init();
      if (ctx.state === 'suspended') await ctx.resume();
      if (i != null && i !== idx) { idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length; store('track', idx); at = 0; }
      playing = true; pausedAt = at; startSession(at); applyRain(); emit();
    },
    start() { return api.play(null, pausedAt); },
    stop() {
      if (!ctx || !playing) return;
      pausedAt = api.position(); playing = false; endSession(); clearInterval(timer); applyRain(); emit();
      setTimeout(() => { if (!playing) ctx.suspend(); }, 600);
    },
    toggle() { return playing ? api.stop() : api.start(); },
    next() { return api.play(idx + 1); },
    prev() { return api.position() > 4 ? api.play(null, 0) : api.play(idx - 1); },
    seek(sec) { pausedAt = Math.max(0, Math.min(TRACKS[idx].dur - 1, sec)); if (playing) startSession(pausedAt); emit(); },
  };
  return api;
})();
