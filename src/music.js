/* ===== 背景音樂：以 Web Audio 即時合成的抒情鋼琴與和弦鋪底（無版權素材） ===== */
const Music = (() => {
  let ctx = null, master = null, wet = null, timer = null, playing = false;
  let nextChord = 0, nextNote = 0, chordIdx = 0, lastNote = 7;
  const BAR = 8; // 每個和弦秒數
  // Fmaj7 → Em7 → Dm7 → Cmaj7 → Am7 → Dm7 → Gsus → Cmaj7（以 MIDI 音高表示）
  const CHORDS = [
    [41, 57, 60, 64, 69], [40, 55, 59, 62, 67], [38, 53, 57, 60, 65], [36, 52, 55, 59, 64],
    [45, 55, 60, 64, 67], [38, 53, 57, 60, 65], [43, 55, 60, 62, 67], [36, 52, 55, 59, 64],
  ];
  const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]; // C 大調五聲音階
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function impulse(sec) {
    const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    const rev = ctx.createConvolver(); rev.buffer = impulse(4.5);
    wet = ctx.createGain(); wet.gain.value = 0.55;
    const dry = ctx.createGain(); dry.gain.value = 0.7;
    master.connect(dry); master.connect(rev); rev.connect(wet);
    dry.connect(comp); wet.connect(comp); comp.connect(ctx.destination);
  }
  /* 和弦鋪底：多個微微走音的三角波，經低通濾波，慢起慢收 */
  function pad(notes, t) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.5);
    g.gain.setValueAtTime(0.05, t + BAR - 1.5);
    g.gain.linearRampToValueAtTime(0, t + BAR + 2.5);
    lp.connect(g); g.connect(master);
    notes.slice(1).forEach(m => [-6, 5].forEach(det => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + BAR + 2.6);
    }));
    // 低音
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = hz(notes[0]);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.09, t + 1.5); bg.gain.linearRampToValueAtTime(0, t + BAR + 1);
    b.connect(bg); bg.connect(master); b.start(t); b.stop(t + BAR + 1.1);
  }
  /* 鋼琴音色：基音加泛音，快起、指數衰減 */
  function piano(m, t, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.connect(lp); lp.connect(master);
    [[1, 'sine', 1], [2, 'triangle', 0.25], [3, 'sine', 0.08]].forEach(([mul, type, amp]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m) * mul;
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 3.7);
    });
  }
  function schedule() {
    const ahead = ctx.currentTime + 0.4;
    while (nextChord < ahead) {
      const c = CHORDS[chordIdx % CHORDS.length];
      pad(c, nextChord);
      // 每個和弦開頭輕輕撥一次分解和弦
      c.slice(1, 4).forEach((m, i) => piano(m + 12, nextChord + 0.05 + i * 0.22, 0.45));
      nextChord += BAR; chordIdx++;
    }
    while (nextNote < ahead) {
      const chord = CHORDS[(chordIdx - 1 + CHORDS.length) % CHORDS.length];
      if (Math.random() < 0.62) {
        // 旋律在音階上小步移動，偏好和弦音
        let step = Math.round((Math.random() - 0.5) * 4);
        lastNote = Math.max(0, Math.min(SCALE.length - 1, lastNote + step));
        let m = SCALE[lastNote];
        if (Math.random() < 0.4) { const ct = chord.slice(2).map(x => x + 12).sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0]; m = ct; }
        piano(m, nextNote, 0.55 + Math.random() * 0.35);
      }
      nextNote += [0.6, 0.9, 1.2, 1.2, 1.8][Math.floor(Math.random() * 5)];
    }
  }
  return {
    get playing() { return playing; },
    async start() {
      if (!ctx) init();
      if (ctx.state === 'suspended') await ctx.resume();
      playing = true;
      nextChord = Math.max(nextChord, ctx.currentTime + 0.1); nextNote = Math.max(nextNote, ctx.currentTime + 1.2);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.75, ctx.currentTime + 3);
      clearInterval(timer); timer = setInterval(schedule, 120); schedule();
    },
    stop() {
      if (!ctx) return;
      playing = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      clearInterval(timer);
      setTimeout(() => { if (!playing) ctx.suspend(); }, 1700);
    },
  };
})();
