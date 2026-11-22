export function createAudio() {
  let ctx = null;
  let muted = false;
  let rumble = null;
  let noiseBuffer = null;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      const length = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    const audio = ensure();
    if (!audio || muted) return;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), audio.currentTime + dur);
    amp.gain.value = gain;
    amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur + 0.02);
  }

  function noise(dur, gain, freq) {
    const audio = ensure();
    if (!audio || muted || !noiseBuffer) return;
    const src = audio.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const amp = audio.createGain();
    amp.gain.value = gain;
    amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(audio.destination);
    src.start();
    src.stop(audio.currentTime + dur + 0.02);
  }

  function rumbleGain(amount) {
    const audio = ensure();
    if (!audio || muted) return;
    if (!rumble) {
      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = 46;
      amp.gain.value = 0;
      osc.connect(amp);
      amp.connect(audio.destination);
      osc.start();
      rumble = amp;
    }
    rumble.gain.value = amount;
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(next) {
      muted = next;
      if (rumble) rumble.gain.value = 0;
    },
    muted() {
      return muted;
    },
    update(warn) {
      if (muted) return;
      rumbleGain(Math.max(0, warn - 0.25) * 0.08);
    },
    play(events) {
      for (let i = 0; i < events.length; i++) {
        const name = events[i];
        if (name === "jump") tone(220, 0.08, "square", 0.04, 140);
        else if (name === "land") noise(0.05, 0.05, 400);
        else if (name === "slap") noise(0.07, 0.08, 900);
        else if (name === "shot") noise(0.14, 0.2, 2200);
        else if (name === "reload") tone(320, 0.08, "square", 0.04, 180);
        else if (name === "hit") noise(0.09, 0.1, 500);
        else if (name === "parry") tone(160, 0.16, "square", 0.07, 70);
        else if (name === "eat") tone(90, 0.4, "sawtooth", 0.08, 36);
        else if (name === "fall") noise(0.2, 0.07, 240);
        else if (name === "burn") tone(180, 0.2, "square", 0.05, 70);
        else if (name === "checkpoint") {
          tone(523, 0.12, "sine", 0.05);
          tone(659, 0.16, "sine", 0.04);
        } else if (name === "cocoon" || name === "pickup") tone(880, 0.1, "sine", 0.04, 1320);
        else if (name === "spore") tone(740, 0.18, "sine", 0.04, 1180);
        else if (name === "banana") tone(420, 0.15, "triangle", 0.04, 180);
        else if (name === "mine") noise(0.22, 0.12, 180);
        else if (name === "jet") tone(280, 0.12, "sawtooth", 0.03, 520);
        else if (name === "windup") tone(98, 0.28, "sawtooth", 0.05, 180);
        else if (name === "code" || name === "lift") tone(494, 0.14, "triangle", 0.05, 740);
        else if (name === "badcode") tone(140, 0.14, "square", 0.04);
        else if (name === "hurt") tone(110, 0.1, "square", 0.05, 70);
        else if (name === "win") {
          tone(523, 0.16, "sine", 0.05);
          tone(659, 0.2, "sine", 0.05);
          tone(784, 0.28, "sine", 0.05);
        }
      }
    },
  };
}
