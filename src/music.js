/* ===== 背景音樂：以 Web Audio 即時合成的 Lofi／咖啡廳曲目（沒有音檔，也沒有版權問題） =====
   每首曲子都有固定的和弦進行、速度、動機與長度，每一小節的內容由「曲目＋小節編號」決定，
   所以同一首每次聽都一樣，也可以拖進度條跳到任何位置。
   音色：鋼琴用帶不和諧泛音與琴槌聲的加法合成，電鋼琴用 FM 合成，整體再過一層錄音帶走音、
   飽和與 sidechain（大鼓響時其他聲音稍微讓開），聽起來比較像真的 lofi 唱片。 */
const Music = (() => {
  let ctx = null, master = null, verb = null, noise = null, timer = null, crackle = null;
  let playing = false, idx = 0, sess = null, pausedAt = 0, cut = 0; // cut：從小節中間開始播時，比這個時間早的音符不排
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(); } catch {} });
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const rngOf = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* ---------- 和弦 ---------- */
  const Q = { maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], 7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14], 13: [0, 4, 10, 14, 21], sus: [0, 5, 7, 10, 14], m11: [0, 3, 7, 10, 17], '6/9': [0, 4, 9, 14] };
  const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  // 每個和弦音都放到離中心音最近的八度，相鄰和弦自然會平順地接起來（不會整串跳上跳下）
  function chord(sym, center) {
    const m = sym.match(/^([A-G]b?)(.*)$/), root = NOTE[m[1]], iv = Q[m[2]];
    const bass = 48 + root - (root >= 5 ? 12 : 0); // 低音落在 F2–E3：手機喇叭也聽得到
    let tones = iv.slice(1).map(i => { const pc = (root + i) % 12; let n = center - 6 + ((pc - (center - 6)) % 12 + 12) % 12; return n; }).sort((a, b) => a - b);
    for (let i = 1; i < tones.length; i++) if (tones[i] - tones[i - 1] < 2) tones[i] += 12; // 半音、全音擠在一起時往上移一個八度
    tones = [...new Set(tones)].sort((a, b) => a - b);
    return { root, bass, tones, iv, pcs: new Set(iv.map(i => (root + i) % 12)) };
  }

  const PHRASES = {
    lofi: [
      [[0, 4, 3], [3, 3, 3], [6, 2, 6], [16, 3, 2], [18, 2, 2], [20, 1, 4], [24, 0, 8]],
      [[2, 2, 2], [4, 4, 4], [8, 5, 6], [16, 4, 3], [19, 2, 3], [22, 1, 10]],
      [[0, 7, 2], [2, 6, 2], [4, 4, 6], [12, 2, 4], [16, 3, 6], [24, 2, 8]],
      [[4, 2, 2], [6, 3, 2], [8, 4, 8], [20, 3, 2], [22, 1, 2], [24, 2, 8]],
    ],
    cafe: [
      [[0, 4, 2], [2, 5, 2], [4, 7, 4], [8, 6, 2], [10, 4, 2], [12, 5, 4], [16, 4, 2], [18, 2, 2], [20, 3, 2], [22, 1, 2], [24, 2, 8]],
      [[2, 0, 2], [4, 2, 2], [6, 4, 2], [8, 5, 4], [12, 4, 4], [18, 7, 2], [20, 6, 2], [22, 4, 2], [24, 5, 8]],
      [[0, 7, 4], [4, 5, 2], [6, 4, 2], [8, 2, 4], [14, 4, 2], [16, 5, 4], [20, 4, 2], [22, 2, 2], [24, 4, 8]],
    ],
    bossa: [
      [[0, 4, 3], [3, 5, 3], [6, 4, 2], [8, 2, 6], [16, 3, 3], [19, 4, 3], [22, 2, 2], [24, 1, 8]],
      [[2, 2, 2], [4, 4, 4], [10, 5, 2], [12, 4, 4], [18, 2, 2], [20, 3, 2], [22, 1, 2], [24, 0, 8]],
    ],
  };
  /* ---------- 曲目 ----------
     style：lofi（慵懶 swing 鼓、黑膠底噪、溫暖的電鋼琴）、cafe（爵士刷鼓與走路貝斯）、bossa（巴薩諾瓦撥弦） */
  const TRACKS = [
    { title: '月台晚風', mood: 'Lofi', style: 'lofi', bpm: 72, keys: 'rhodes', lead: 'piano', prog: ['Fmaj7', 'Em7', 'Dm9', 'Cmaj9'], scale: [0, 2, 4, 7, 9] },
    { title: '窗邊的拿鐵', mood: '咖啡廳爵士', style: 'cafe', bpm: 100, keys: 'piano', lead: 'piano', prog: ['Cm9', 'F13', 'Bbmaj7', 'Ebmaj7', 'Am7', 'D7', 'Gm7', 'G7'], scale: [10, 0, 2, 5, 7] },
    { title: '雨天區間車', mood: 'Lofi', style: 'lofi', bpm: 68, keys: 'rhodes', lead: 'rhodes', prog: ['Am9', 'Dm9', 'G13', 'Cmaj9'], scale: [9, 0, 2, 4, 7] },
    { title: '午後慢車', mood: '巴薩諾瓦', style: 'bossa', bpm: 108, keys: 'pluck', lead: 'piano', prog: ['Dmaj7', 'Bm7', 'Em9', 'A13'], scale: [2, 4, 6, 9, 11] },
    { title: '夜班列車', mood: 'Lofi', style: 'lofi', bpm: 64, keys: 'rhodes', lead: 'piano', prog: ['Ebmaj7', 'Cm9', 'Abmaj7', 'Bbsus'], scale: [3, 5, 7, 10, 0] },
    { title: '海線晴天', mood: '輕快咖啡廳', style: 'cafe', bpm: 112, keys: 'piano', lead: 'piano', prog: ['Cmaj7', 'Am7', 'Dm9', 'G13', 'Em7', 'A7', 'Dm7', 'G7'], scale: [0, 2, 4, 7, 9] },
    { title: '山線隧道', mood: 'Lofi', style: 'lofi', bpm: 76, keys: 'rhodes', lead: 'rhodes', prog: ['Gm9', 'Cm11', 'Fsus', 'Bbmaj7', 'Ebmaj7', 'Am7', 'D7', 'Gm9'], scale: [7, 10, 0, 2, 5] },
    { title: '鳳梨酥與冰咖啡', mood: '巴薩諾瓦', style: 'bossa', bpm: 116, keys: 'pluck', lead: 'piano', prog: ['Fmaj7', 'Gm7', 'Am7', 'Gm7', 'Bbmaj7', 'C9', 'Fmaj7', 'C9'], scale: [5, 7, 9, 0, 2] },
  ].map((t, i) => {
    const bar = 240 / t.bpm, bars = Math.max(32, Math.round(170 / bar / 8) * 8 + 4);
    return { ...t, id: i, bar, bars, dur: bars * bar, chords: t.prog.map(c => chord(c, 64)), motif: makeMotif(i, t) };
  });

  /* 旋律動機：手寫的兩小節樂句（16 分音符格 s、五聲音階級數 d、長度 len），每首挑一個，整首都從它變化出來。
     以前是隨機漫步產生的旋律，聽起來沒有方向；這些樂句有起伏、有呼吸（留白），比較像人寫的 */
  function makeMotif(id, t) {
    const list = PHRASES[t.style] || PHRASES.lofi, P = list[(id * 3 + 1) % list.length];
    return P.map(([s, d, len]) => ({ s, d, len }));
  }

  /* ---------- 音色 ---------- */
  function adsr(g, t, a, peak, d, sus, end, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(Math.max(0.0001, sus), t + a, d / 3);
    g.gain.setTargetAtTime(0.0001, Math.max(end, t + a + 0.01), rel / 4);
  }
  function osc(type, f, t, end, out, det = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
    o.connect(out); o.start(t); o.stop(end); return o;
  }
  // 鋼琴：每個音兩條微微走音的弦（豐富泛音的波形），濾波器由亮慢慢變暗、高音衰減比較快；加上很輕的琴槌聲。
  // 以前用四個正弦波疊出來，聽起來像電子琴
  let pianoWave = null, pianoCtx = null;
  function pianoWaveOf() {
    if (pianoCtx === ctx) return pianoWave;
    const N = 16, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = Math.pow(n, -1.35) * (n % 2 ? 1 : 0.82) * (n === 7 || n === 14 ? 0.3 : 1);
    pianoCtx = ctx; return (pianoWave = ctx.createPeriodicWave(re, im));
  }
  function piano(bus, m, t, len, vel) {
    if (t < cut) return;
    const f = hz(m), dec = Math.max(0.8, Math.min(5, 3.6 - (m - 60) * 0.07)), end = t + len, stopAt = end + 1.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
    const bright = Math.min(9000, f * (2.2 + vel * 4) + 600);
    lp.frequency.setValueAtTime(bright, t); lp.frequency.setTargetAtTime(Math.max(f * 1.6, bright * 0.35), t + 0.01, 0.35 + dec * 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.005);
    g.gain.setTargetAtTime(0.03 * vel, t + 0.005, 0.12); g.gain.setTargetAtTime(0.0001, t + 0.25, dec / 2.5);
    g.gain.setTargetAtTime(0.0001, end, 0.12);
    g.connect(lp); lp.connect(bus);
    const w = pianoWaveOf();
    for (const det of [-3.5, 3.5]) { const o = ctx.createOscillator(); o.setPeriodicWave(w); o.frequency.value = f; o.detune.value = det; o.connect(g); o.start(t); o.stop(stopAt); }
    const s = ctx.createBufferSource(); s.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(3500, f * 3); bp.Q.value = 0.9;
    const hg = ctx.createGain(); hg.gain.setValueAtTime(0.008 * vel, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    s.connect(bp); bp.connect(hg); hg.connect(bus); s.start(t, Math.random()); s.stop(t + 0.05);
  }
  // 電鋼琴（Rhodes）：FM 合成。調變量隨時間變小，起音帶一點金屬「叮」聲，之後變得圓潤
  function rhodes(bus, m, t, len, vel) {
    if (t < cut) return;
    const f = hz(m), end = t + len, stopAt = end + 1.2;
    // 調變量比以前小，起音的金屬聲也收斂，聲音比較圓、比較暖
    const g = ctx.createGain(); adsr(g, t, 0.006, 0.12 * vel, 1.4, 0.05 * vel, end, 0.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(8000, 2600 + f * 6); lp.Q.value = 0.4;
    g.connect(lp); lp.connect(bus);
    const car = ctx.createOscillator(); car.frequency.value = f; car.detune.value = (Math.random() - 0.5) * 5;
    const mod = ctx.createOscillator(); mod.frequency.value = f;
    const mi = ctx.createGain(); mi.gain.setValueAtTime(f * (0.7 + vel * 1.3), t); mi.gain.setTargetAtTime(f * 0.4, t, 0.4);
    const tine = ctx.createOscillator(); tine.frequency.value = f * 14;
    const ti = ctx.createGain(); ti.gain.setValueAtTime(f * 0.3 * vel, t); ti.gain.setTargetAtTime(0, t, 0.02);
    mod.connect(mi); mi.connect(car.frequency); tine.connect(ti); ti.connect(car.frequency);
    car.connect(g);
    [car, mod, tine].forEach(o => { o.start(t); o.stop(stopAt); });
  }
  // 尼龍弦吉他：三角波＋鋸齒波，濾波器快速關小，像手指撥弦
  function pluck(bus, m, t, len, vel) {
    if (t < cut) return;
    const f = hz(m), end = t + Math.min(len, 1.6), stopAt = end + 0.5;
    const g = ctx.createGain(); adsr(g, t, 0.003, 0.15 * vel, 0.5, 0.02 * vel, end, 0.25);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(900 + vel * 3500, t); lp.frequency.setTargetAtTime(500, t, 0.12);
    g.connect(lp); lp.connect(bus);
    osc('triangle', f, t, stopAt, g); const sg = ctx.createGain(); sg.gain.value = 0.35; sg.connect(g); osc('sawtooth', f, t, stopAt, sg, 4);
  }
  const KEYS = { rhodes, piano, pluck };
  // 貝斯：lofi 是圓潤的長音，咖啡廳／巴薩是撥起來會衰減的低音提琴
  function bass(bus, m, t, len, vel, upright) {
    if (t < cut) return;
    const f = hz(m), end = t + len, stopAt = end + 0.4;
    const g = ctx.createGain();
    if (upright) adsr(g, t, 0.006, 0.34 * vel, 0.35, 0.1 * vel, end, 0.15);
    else adsr(g, t, 0.02, 0.3 * vel, 0.8, 0.2 * vel, end, 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(upright ? 900 : 480, t); lp.frequency.setTargetAtTime(upright ? 380 : 320, t, 0.15);
    g.connect(lp); lp.connect(bus);
    osc('sine', f, t, stopAt, g); const hg = ctx.createGain(); hg.gain.value = 0.5; hg.connect(g); osc('triangle', f, t, stopAt, hg);
    osc('sine', f * 2, t, stopAt, (() => { const x = ctx.createGain(); x.gain.value = 0.25; x.connect(g); return x; })()); // 二倍頻：手機小喇叭也聽得出低音線
  }
  function noiseHit(bus, t, type, f, q, peak, dec, att = 0.001) {
    if (t < cut) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(0.0001, t + att, dec / 4);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + att + dec + 0.05);
  }
  // 大鼓：低頻正弦往下滑，加一點軟的鼓皮聲；比以前圓、比較不像電子音效
  function kick(S, t, vel) {
    if (t < cut) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.06); o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.65 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.03, 0.08);
    o.connect(g); g.connect(S.drums); o.start(t); o.stop(t + 0.55);
    noiseHit(S.drums, t, 'lowpass', 1200, 0.5, 0.06 * vel, 0.02); // 鼓槌的悶響
    // sidechain：大鼓響的瞬間，和弦與貝斯稍微讓開，再慢慢回來
    const d = S.duck.gain, depth = S.track.style === 'lofi' ? 0.7 : 0.85;
    d.setValueAtTime(1, t); d.linearRampToValueAtTime(depth, t + 0.02); d.setTargetAtTime(1, t + 0.04, 0.12);
  }
  // 小鼓：鼓身的音高加上中頻的響弦噪音，lofi 曲子再過低通，聽起來像取樣自老唱片
  function snare(S, t, vel) {
    if (t < cut) return;
    noiseHit(S.drums, t, 'bandpass', 2200, 0.8, 0.11 * vel, 0.13);
    noiseHit(S.drums, t, 'highpass', 4500, 0.5, 0.05 * vel, 0.1);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(175, t + 0.05);
    g.gain.setValueAtTime(0.16 * vel, t); g.gain.setTargetAtTime(0.0001, t + 0.005, 0.03); o.connect(g); g.connect(S.drums); o.start(t); o.stop(t + 0.2);
  }
  // 腳踏鈸：高通的短噪音，音量比以前小，不會一直嘶嘶響
  const hat = (S, t, vel, open) => noiseHit(S.drums, t, 'highpass', 6000, 0.6, (open ? 0.06 : 0.08) * vel, open ? 0.18 : 0.03);
  const brush = (S, t, vel, long) => noiseHit(S.drums, t, 'bandpass', 3600, 1.1, (long ? 0.016 : 0.022) * vel, long ? 0.16 : 0.08, long ? 0.03 : 0.004);
  function rim(S, t, vel) {
    if (t < cut) return;
    noiseHit(S.drums, t, 'bandpass', 1900, 7, 0.14 * vel, 0.04);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 820; g.gain.setValueAtTime(0.05 * vel, t); g.gain.setTargetAtTime(0.0001, t, 0.012);
    o.connect(g); g.connect(S.drums); o.start(t); o.stop(t + 0.08);
  }

  /* ---------- 一小節 ----------
     段落：前奏 4 小節（只有和弦）→ 每 8 小節一段：A 段旋律、A' 段旋律高八度、間奏（只有和弦與鼓）→ 中段 4 小節拿掉鼓 → 尾奏 4 小節 */
  function scheduleBar(S, k) {
    const T = S.track, t0 = S.startAt + k * T.bar, st = T.bar / 16;
    const R = rngOf(T.id * 7919 + k * 104729 + 17);
    const n = T.chords.length, C = T.chords[k % n], next = T.chords[(k + 1) % n];
    const intro = k < 4, outro = k >= T.bars - 4, mid = Math.floor(T.bars / 2 / 4) * 4, brk = k >= mid && k < mid + 4 && T.bars >= 40;
    const block = intro || outro ? -1 : Math.floor((k - 4) / 8) % 3; // 0：A 段、1：A' 段、2：器樂段
    const fade = outro ? Math.max(0.15, 1 - (k - (T.bars - 4)) / 4.5) : intro ? 0.8 + k * 0.05 : 1;
    const sw = T.style === 'bossa' ? 0.04 : T.style === 'cafe' ? 0.3 : 0.2; // 搖擺：反拍往後拖
    const at = s => t0 + s * st + (s % 2 ? sw * st : 0) + (R() - 0.5) * 0.012;
    const play = KEYS[T.keys], keysBus = S.keys;

    // 和弦
    if (T.style === 'lofi') {
      const roll = R() < 0.5 ? 0.025 : 0.012;
      C.tones.forEach((m, i) => play(keysBus, m, at(0) + i * roll, T.bar * 0.97, (0.62 + R() * 0.15) * fade));
      if (R() < 0.35 && !outro) C.tones.slice(-2).forEach((m, i) => play(keysBus, m, at(11) + i * 0.02, T.bar * 0.3, 0.3 * fade));
    } else if (T.style === 'cafe') {
      const pat = [[0, 6], [0, 7, 10], [3, 10], [0, 10, 14]][Math.floor(R() * 4)];
      pat.forEach((s, j) => C.tones.forEach((m, i) => play(keysBus, m, at(s) + i * 0.008, st * (j === pat.length - 1 ? 6 : 4), (j === 0 ? 0.55 : 0.42) * fade)));
    } else {
      [0, 3, 6, 10, 12].forEach((s, j) => C.tones.slice(0, 3).forEach((m, i) => play(keysBus, m, at(s) + i * 0.014, st * 2.4, (j % 2 ? 0.45 : 0.55) * fade)));
    }

    // 低音
    if (k >= 2) {
      if (T.style === 'cafe' && !brk && !intro) {
        const fifth = C.bass + 7 - (C.bass + 7 > 55 ? 12 : 0);
        const walk = [C.bass, R() < 0.5 ? fifth : C.bass + C.iv[1], R() < 0.5 ? C.bass + C.iv[2] : C.bass + 12 - 2, next.bass + (R() < 0.5 ? 1 : -1)];
        walk.forEach((m, b) => bass(S.low, m, at(b * 4), T.bar / 4 * 0.8, (b === 0 ? 0.9 : 0.75) * fade, true));
      } else if (T.style === 'bossa') {
        const fifth = C.bass + 7 - (C.bass + 7 > 55 ? 12 : 0);
        [[0, C.bass, 5], [6, fifth, 2], [8, fifth, 5], [14, C.bass, 2]].forEach(([s, m, l]) => bass(S.low, m, at(s), st * l, 0.8 * fade, true));
      } else {
        bass(S.low, C.bass, at(0), T.bar * 0.6, 0.85 * fade);
        if (R() < 0.55) bass(S.low, C.bass + (R() < 0.5 ? 7 : 12), at(10), T.bar * 0.22, 0.55 * fade);
        if (R() < 0.3) bass(S.low, next.bass + (next.bass > C.bass ? -1 : 1), at(14), st * 2, 0.45 * fade);
      }
    }

    // 鼓
    if (!intro && !outro && !brk) {
      const fill = (k - 4) % 8 === 7;
      if (T.style === 'lofi') {
        const kicks = R() < 0.5 ? [0, 7, 10] : [0, 3, 10];
        kicks.forEach((s, i) => kick(S, at(s), i ? 0.6 : 0.9));
        [4, 12].forEach(s => snare(S, at(s), 0.75));
        for (let s = 0; s < 16; s += 2) hat(S, at(s), (s % 4 ? 0.45 : 0.8) * (0.85 + R() * 0.3), s === 14 && R() < 0.2);
        if (fill) { snare(S, at(14), 0.35); snare(S, at(15), 0.45); }
        else if (R() < 0.3) hat(S, at(15), 0.3);
      } else if (T.style === 'cafe') {
        for (let b = 0; b < 4; b++) brush(S, at(b * 4), 0.8, true);
        [2, 6, 10, 14].forEach(s => brush(S, at(s), 0.45, false));
        [4, 12].forEach(s => rim(S, at(s), 0.45));
        kick(S, at(0), 0.35); if (R() < 0.5) kick(S, at(10), 0.25);
        if (fill) [13, 14, 15].forEach(s => rim(S, at(s), 0.3));
      } else {
        for (let s = 0; s < 16; s++) hat(S, at(s), s % 2 ? 0.25 : 0.45);
        [0, 6, 8, 14].forEach(s => kick(S, at(s), s % 8 ? 0.35 : 0.5));
        [0, 3, 6, 10, 12].forEach(s => rim(S, at(s), 0.35));
      }
    }

    // 旋律：兩小節的動機，第二次變奏，第四句回答；強拍落在和弦音上
    if (block === 0 || block === 1 || brk) {
      const lead = KEYS[T.lead], phrase = Math.floor((k - 4) / 2) % 4, half = (k - 4) % 2;
      const base = 72 + (T.scale[0] > 6 ? T.scale[0] - 12 : T.scale[0]) + (block === 1 && T.style !== 'lofi' ? 12 : 0);
      const sc = []; for (let o = -1; o <= 2; o++) T.scale.forEach(d => sc.push(base - T.scale[0] + d + 12 * o));
      sc.sort((a, b) => a - b);
      const zero = sc.indexOf(sc.find(x => x >= base - 5));
      const shift = phrase === 1 ? 1 : phrase === 3 ? -1 : 0;
      for (const nt of T.motif) {
        if ((nt.s >= 16) !== (half === 1)) continue;
        if (brk && R() < 0.5) continue;
        let di = zero + nt.d + shift;
        if (phrase === 2 && nt.s >= 20) di += R() < 0.5 ? 1 : -1;      // 第三句尾巴變一下
        if (phrase === 3 && nt.s >= 24) di = zero + 2;                  // 第四句收在主音附近
        di = Math.max(0, Math.min(sc.length - 1, di));
        let m = sc[di];
        if (nt.s % 8 === 0 && !C.pcs.has(m % 12)) { const up = sc[di + 1], dn = sc[di - 1]; m = up != null && C.pcs.has(up % 12) ? up : dn != null && C.pcs.has(dn % 12) ? dn : m; }
        const s = nt.s % 16;
        lead(S.lead, m, at(s), nt.len * st * 0.95, (nt.s % 8 === 0 ? 0.75 : 0.6) * fade * (brk ? 0.8 : 1));
      }
    }
  }

  /* ---------- 播放控制 ---------- */
  function makeImpulse(sec, damp) {
    // 殘響：雙聲道各自的噪音，指數衰減，而且越後面越悶（模擬房間吸掉高頻）
    const len = Math.floor(ctx.sampleRate * sec), ib = ctx.createBuffer(2, len, ctx.sampleRate), pre = Math.floor(ctx.sampleRate * 0.015);
    for (let ch = 0; ch < 2; ch++) {
      const d = ib.getChannelData(ch); let lp = 0;
      for (let i = pre; i < len; i++) { const x = i / len, a = 0.6 - 0.55 * x * damp; lp += (Math.random() * 2 - 1 - lp) * a; d[i] = lp * Math.pow(1 - x, 2.6); }
    }
    return ib;
  }
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    buildGraph();
  }
  function buildGraph() {
    master = ctx.createGain(); master.gain.value = 0.6;
    // 輕微飽和：讓聲音比較厚、比較「類比」
    const sat = ctx.createWaveShaper(), curve = new Float32Array(1024);
    // 以前推得太用力（整體失真、聲音發扁），現在只留一點溫暖的飽和，再用壓縮器黏合、限幅器擋住破音
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.1) / Math.tanh(1.1); }
    sat.curve = curve; sat.oversample = '4x';
    const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -20; glue.ratio.value = 2; glue.knee.value = 10; glue.attack.value = 0.03; glue.release.value = 0.25;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -3; comp.ratio.value = 20; comp.knee.value = 0; comp.attack.value = 0.002; comp.release.value = 0.1;
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(2.2, 1);
    const wet = ctx.createGain(); wet.gain.value = 0.26; verb.connect(wet); wet.connect(master);
    master.connect(glue); glue.connect(sat); sat.connect(comp); comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  }
  function endSession() {
    if (!sess) return;
    const s = sess, now = ctx.currentTime; sess = null;
    s.bus.gain.cancelScheduledValues(now); s.bus.gain.setValueAtTime(s.bus.gain.value, now); s.bus.gain.linearRampToValueAtTime(0, now + 0.25);
    s.stops.forEach(n => { try { n.stop(now + 0.3); } catch {} });
    setTimeout(() => { try { s.bus.disconnect(); s.send.disconnect(); } catch {} }, 4000);
  }
  function startSession(at) {
    endSession();
    const T = TRACKS[idx], now = ctx.currentTime, lofi = T.style === 'lofi';
    const k = Math.max(0, Math.min(T.bars - 1, Math.floor(at / T.bar)));
    // 訊號流：樂器 → (keys/lead 經過 sidechain duck) → 錄音帶走音 → 音色濾波 → 淡入淡出 → master；另送一份到殘響
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(1, now + (at > 0 ? 0.3 : 0.05));
    bus.connect(master);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = lofi ? 9500 : 14000; tone.Q.value = 0.5;
    const low = ctx.createBiquadFilter(); low.type = 'highshelf'; low.frequency.value = 6000; low.gain.value = lofi ? -2.5 : -1;
    tone.connect(low); low.connect(bus);
    const tape = ctx.createDelay(0.1); tape.delayTime.value = 0.02; tape.connect(tone);
    const stops = [];
    // 錄音帶走音（wow 慢、flutter 快）：用延遲時間的微小擺動讓音高輕輕飄
    [[0.45, lofi ? 0.0014 : 0.0005], [5.5, lofi ? 0.00012 : 0.00005]].forEach(([f, d]) => {
      const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = f; g.gain.value = d; l.connect(g); g.connect(tape.delayTime); l.start(now); stops.push(l);
    });
    const duck = ctx.createGain(); duck.connect(tape);
    // 以前低音太重（八成的能量在 150Hz 以下），手機喇叭放不出來，剩下的中頻又太小聲，聽起來又悶又糊。
    // 貝斯改走自己的音軌、音量降低並切掉超低頻；和弦與旋律拉高
    const keys = ctx.createGain(); keys.gain.value = T.keys === 'rhodes' ? 1.7 : 1.5; keys.connect(duck);
    const lead = ctx.createGain(); lead.gain.value = 1.5; lead.connect(duck);
    const lowBus = ctx.createGain(); lowBus.gain.value = 0.42;
    const lowHp = ctx.createBiquadFilter(); lowHp.type = 'highpass'; lowHp.frequency.value = 40; lowHp.Q.value = 0.6;
    lowBus.connect(lowHp); lowHp.connect(duck);
    // 電鋼琴的左右顫音（auto-pan）
    if (T.keys === 'rhodes') {
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { keys.disconnect(); keys.connect(pan); pan.connect(duck); const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = 3.2; g.gain.value = 0.3; l.connect(g); g.connect(pan.pan); l.start(now); stops.push(l); }
    }
    const drums = ctx.createGain(); drums.gain.value = lofi ? 0.5 : 0.45;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = lofi ? 10000 : 14000;
    drums.connect(dlp); dlp.connect(tape);
    const send = ctx.createGain(); send.gain.value = lofi ? 0.5 : 0.35; duck.connect(send); send.connect(verb);
    // 黑膠底噪：零星的爆音加上很輕的嘶聲，lofi 曲子才有
    if (lofi) {
      if (!crackle) {
        const n = ctx.sampleRate * 4; crackle = ctx.createBuffer(1, n, ctx.sampleRate); const d = crackle.getChannelData(0); let h = 0;
        for (let i = 0; i < n; i++) { h += ((Math.random() * 2 - 1) - h) * 0.25; d[i] = h * 0.05; }
        for (let c = 0; c < 70; c++) { const at = Math.floor(Math.random() * (n - 200)), a = (Math.random() < 0.15 ? 0.9 : 0.35) * (Math.random() < 0.5 ? 1 : -1); for (let j = 0; j < 40; j++) d[at + j] += a * Math.exp(-j / 6) * (j % 2 ? -0.6 : 1); }
      }
      const src = ctx.createBufferSource(); src.buffer = crackle; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 7000;
      const cg = ctx.createGain(); cg.gain.value = 0.09;
      src.connect(hp); hp.connect(lpf); lpf.connect(cg); cg.connect(bus); src.start(now); stops.push(src);
    }
    sess = { track: T, bus, send, duck, keys, lead, low: lowBus, drums, stops, startAt: now + 0.12 - Math.min(at, T.dur - 0.5), next: k };
    cut = now + 0.1;
    clearInterval(timer); timer = setInterval(tick, 100); tick();
  }
  function tick() {
    if (!sess) return;
    const S = sess, T = S.track, now = ctx.currentTime;
    while (S.next < T.bars && S.startAt + S.next * T.bar < now + 0.7) scheduleBar(S, S.next++);
    if (now > S.startAt + T.dur + 1.5) { idx = (idx + 1) % TRACKS.length; store('track', idx); startSession(0); emit(); }
  }
  function store(k, v) { try { localStorage.setItem('rp.music.' + k, JSON.stringify(v)); } catch {} }
  try { const v = JSON.parse(localStorage.getItem('rp.music.track')); if (Number.isInteger(v) && v >= 0 && v < TRACKS.length) idx = v; } catch {}

  /* 雨聲：濾波過的白噪音，跟著天氣調整音量（只在音樂開著時出聲） */
  /* 環境音：雨聲與雷聲。跟著天氣出聲，和音樂播放分開，有自己的開關 */
  let rainGain = null, rainLevel = 0, storm = false, ambOn = true;
  try { const v = JSON.parse(localStorage.getItem('rp.music.amb')); if (typeof v === 'boolean') ambOn = v; } catch {}
  const ambWanted = () => ambOn && rainLevel > 0;
  function applyRain() {
    if (!ctx) return;
    if (!rainGain) {
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      s.connect(bp); bp.connect(lp); lp.connect(rainGain); rainGain.connect(ctx.destination); s.start();
    }
    if (ambWanted() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    rainGain.gain.cancelScheduledValues(now); rainGain.gain.setValueAtTime(rainGain.gain.value, now);
    rainGain.gain.linearRampToValueAtTime(ambWanted() ? rainLevel * 0.08 : 0, now + 2);
    if (!ambWanted() && !playing) setTimeout(() => { if (!playing && !ambWanted() && ctx.state === 'running') ctx.suspend(); }, 2200);
  }
  // 雷聲：低頻的濾波噪音，先一聲裂響再拖長隆隆聲；閃電之後隔一下才傳到（光比聲音快）
  function thunder() {
    if (!ctx || !ambOn || !storm || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.4 + Math.random() * 1.6, len = 3 + Math.random() * 3, near = Math.random();
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(400 + near * 900, t); lp.frequency.exponentialRampToValueAtTime(90, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 + near * 0.35, t + 0.06 + (1 - near) * 0.4);
    // 隆隆聲中間幾次起伏
    for (let k = 1; k <= 3; k++) { const tk = t + len * k / 4.5; g.gain.linearRampToValueAtTime((0.15 + Math.random() * 0.25) * (1 - k / 5), tk); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(lp); lp.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + len + 0.1);
  }

  /* 離線算出一段音樂（測試與試聽用）：把整段的小節一次排好，用 OfflineAudioContext 算成音訊 */
  async function renderOffline(i, sec, from = 0) {
    const saved = { ctx, master, verb, noise, sess, idx, cut, timer, crackle };
    try {
      const SR = 44100; ctx = new OfflineAudioContext(2, Math.ceil(SR * sec), SR); sess = null; crackle = null;
      buildGraph(); idx = i;
      startSession(from); clearInterval(timer);
      const S = sess; while (S.next < S.track.bars && S.startAt + S.next * S.track.bar < sec + 1) scheduleBar(S, S.next++);
      return await ctx.startRendering();
    } finally { clearInterval(timer); ({ ctx, master, verb, noise, sess, idx, cut, timer, crackle } = saved); }
  }

  const api = {
    renderOffline,
    tracks: TRACKS.map(({ id, title, mood, dur }) => ({ id, title, mood, dur })),
    get playing() { return playing; },
    get index() { return idx; },
    position() { return sess && ctx ? Math.max(0, Math.min(sess.track.dur, ctx.currentTime - sess.startAt)) : pausedAt; },
    onChange(f) { listeners.add(f); },
    setRain(level, isStorm) { rainLevel = level; storm = !!isStorm; applyRain(); },
    get ambient() { return ambOn; },
    setAmbient(on) { ambOn = !!on; try { localStorage.setItem('rp.music.amb', JSON.stringify(ambOn)); } catch {} if (ambOn && !ctx) init(); applyRain(); emit(); },
    // 瀏覽器要在使用者點過畫面之後才能出聲：第一次點擊時建立音訊環境，雨聲才能單獨播放
    unlock() { if (!ambOn) return; if (!ctx) init(); if (ctx.state === 'suspended' && (playing || ambWanted())) ctx.resume().catch(() => {}); applyRain(); },
    thunder,
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
      setTimeout(() => { if (!playing && !ambWanted()) ctx.suspend(); }, 600);
    },
    toggle() { return playing ? api.stop() : api.start(); },
    next() { return api.play(idx + 1); },
    prev() { return api.position() > 4 ? api.play(null, 0) : api.play(idx - 1); },
    seek(sec) { pausedAt = Math.max(0, Math.min(TRACKS[idx].dur - 1, sec)); if (playing) startSession(pausedAt); emit(); },
  };
  return api;
})();
