(function () {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function unlock() {
    ensureCtx();
  }

  function tone(ac, type, freq, start, dur, vol, slideTo) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noiseBurst(ac, start, dur, vol) {
    const bufferSize = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(start);
    src.stop(start + dur + 0.01);
  }

  function playDiceRoll() {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    for (let i = 0; i < 7; i++) {
      noiseBurst(ac, t0 + i * 0.045, 0.05, 0.07 + Math.random() * 0.03);
      tone(ac, "triangle", 220 + Math.random() * 180, t0 + i * 0.045, 0.04, 0.04);
    }
    tone(ac, "sine", 340, t0 + 0.32, 0.14, 0.1, 180);
  }

  function playPawnMove() {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    tone(ac, "sine", 640, t0, 0.09, 0.09, 420);
    tone(ac, "triangle", 880, t0 + 0.03, 0.07, 0.05, 520);
  }

  function playPawnStep() {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    tone(ac, "sine", 520, t0, 0.05, 0.045, 380);
  }

  window.LudoSounds = {
    unlock,
    playDiceRoll,
    playPawnMove,
    playPawnStep,
  };
})();
