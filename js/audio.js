// Ref whistle (synthesised, no files), beeps and spoken calls.
let ctx = null, master = null;
export const sound = { whistle: true, voice: true, volume: 0.8 };

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = sound.volume;
  return ctx;
}
export function unlock() { ac(); }

// a pea whistle: two close tones with a fast warble from the pea, plus breath noise
export function whistle(len = 0.55, blasts = 1) {
  if (!sound.whistle) return;
  const c = ac(); if (!c) return;
  for (let k = 0; k < blasts; k++) {
    const t0 = c.currentTime + k * (len + 0.12), t1 = t0 + len;
    const out = c.createGain(); out.connect(master);
    out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(0.32, t0 + 0.02);
    out.gain.setValueAtTime(0.32, t1 - 0.06); out.gain.linearRampToValueAtTime(0, t1);
    const trill = c.createGain(); trill.gain.value = 0.6; trill.connect(out);
    const lfo = c.createOscillator(), lfoAmt = c.createGain();
    lfo.frequency.value = 34; lfoAmt.gain.value = 0.4; lfo.connect(lfoAmt); lfoAmt.connect(trill.gain);
    for (const f of [2950, 3120]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const fm = c.createGain(); fm.gain.value = 40; lfo.connect(fm); fm.connect(o.frequency);
      o.connect(trill); o.start(t0); o.stop(t1);
    }
    const n = c.createBufferSource(), buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 3;
    const ng = c.createGain(); ng.gain.value = 0.25; n.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t0); n.stop(t1); lfo.start(t0); lfo.stop(t1);
  }
}

export function beep(freq = 880, len = 0.12, type = 'square', vol = 0.15) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len);
}
export function swish() { beep(660, 0.1, 'triangle', 0.18); setTimeout(() => beep(990, 0.18, 'triangle', 0.18), 90); }
export function tick() { beep(1400, 0.03, 'square', 0.05); }

export function say(text, delay = 0) {
  if (!sound.voice || !('speechSynthesis' in window)) return;
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text); u.rate = 1.08; u.pitch = 1; u.volume = sound.volume;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }, delay);
}
