// Ref whistle (synthesised, no files), beeps and spoken calls.
let ctx = null, master = null;
export const sound = { whistle: true, voice: true, volume: 0.8, kind: 'pea' }; // kind: pea | fox | horn | buzzer (unlockable)

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

// the ref's whistle. pea: two close tones with a fast warble from the pea, plus breath noise
export function whistle(len = 0.55, blasts = 1) {
  if (!sound.whistle) return;
  const c = ac(); if (!c) return;
  if (sound.kind === 'fox') return tones([3150, 3330], len, blasts, 'sine', 0.28);
  if (sound.kind === 'horn') return tones([233, 294, 349], len * 1.2, blasts, 'sawtooth', 0.12);
  if (sound.kind === 'buzzer') return tones([110, 220], len * 1.3, blasts, 'square', 0.1);
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

export function say(text, delay = 0, opts = {}) {
  if (!sound.voice || !('speechSynthesis' in window)) return;
  setTimeout(() => {
    sound.onSpeak?.(text.length * 70 + 900);
    const u = new SpeechSynthesisUtterance(text); u.rate = opts.rate ?? 1.08; u.pitch = opts.pitch ?? 1; u.volume = sound.volume;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }, delay);
}

// plain tone stacks: pealess whistle, air horn, arena buzzer
function tones(freqs, len, blasts, type, vol) {
  const c = ac(); if (!c) return;
  for (let k = 0; k < blasts; k++) {
    const t0 = c.currentTime + k * (len + 0.12), t1 = t0 + len;
    const out = c.createGain(); out.connect(master);
    out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    out.gain.setValueAtTime(vol, t1 - 0.05); out.gain.linearRampToValueAtTime(0, t1);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = type === 'sine' ? 8000 : 2400; lp.connect(out);
    for (const f of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t0); o.stop(t1); }
  }
}
export function buzzer(len = 1.1) { const k = sound.kind; sound.kind = 'buzzer'; tones([110, 220], len, 1, 'square', 0.12); sound.kind = k; }

// ---------- arena mode: a crowd that murmurs, roars on big plays and groans at turnovers ----------
let crowd = null;
function noiseBuffer(c, secs) {
  const b = c.createBuffer(2, Math.ceil(c.sampleRate * secs), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let last = 0; for (let i = 0; i < d.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 8; } }
  return b;
}
export function crowdOn() {
  const c = ac(); if (!c || crowd) return;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 4); src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = 0;
  const lfo = c.createOscillator(), la = c.createGain(); lfo.frequency.value = 0.13; la.gain.value = 0.012; lfo.connect(la); la.connect(g.gain);
  src.connect(bp); bp.connect(g); g.connect(master); src.start(); lfo.start();
  g.gain.linearRampToValueAtTime(0.05, c.currentTime + 2);
  crowd = { src, g, bp, lfo };
}
export function crowdOff() {
  if (!crowd) return; const c = ac(), k = crowd; crowd = null;
  k.g.gain.cancelScheduledValues(c.currentTime); k.g.gain.setValueAtTime(k.g.gain.value, c.currentTime); k.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
  setTimeout(() => { try { k.src.stop(); k.lfo.stop(); } catch {} }, 1000);
}
// level 1 = a nice play, 3 = huge
export function cheer(level = 1) {
  const c = ac(); if (!c || !crowd) return;
  const t = c.currentTime, g = crowd.g.gain, peak = 0.05 + 0.07 * level;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(peak, t + 0.25); g.linearRampToValueAtTime(peak * 0.7, t + 1 + level * 0.4); g.linearRampToValueAtTime(0.05, t + 2.5 + level);
  crowd.bp.frequency.cancelScheduledValues(t); crowd.bp.frequency.setValueAtTime(700, t); crowd.bp.frequency.linearRampToValueAtTime(1300, t + 0.3); crowd.bp.frequency.linearRampToValueAtTime(700, t + 2.5);
}
export function groan() {
  const c = ac(); if (!c || !crowd) return;
  const t = c.currentTime, g = crowd.g.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.09, t + 0.2); g.linearRampToValueAtTime(0.05, t + 1.6);
  crowd.bp.frequency.cancelScheduledValues(t); crowd.bp.frequency.setValueAtTime(900, t); crowd.bp.frequency.exponentialRampToValueAtTime(350, t + 1.2); crowd.bp.frequency.linearRampToValueAtTime(700, t + 2);
}
