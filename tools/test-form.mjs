// Synthetic tests for the shooting form coach (js/form.js).  node tools/test-form.mjs
import { analyzeShot } from '../js/form.js';
const A = 16 / 9;
const lerp = (a, b, u) => a + (b - a) * u;

// a side-on shooter, right arm shooting. good = bend knees, L-shaped elbow, high release, hold the follow-through
function shot({ knees = true, lArm = true, high = true, follow = true, flare = false }) {
  const frames = [], hipX = 0.9, hipY0 = 0.55;
  for (let i = 0; i <= 60; i++) {
    const t = i / 30, u = t / 2; // 2 s: 0-0.8 dip, 0.8-1.1 rise + release (at 1.1), then follow-through
    const dip = knees ? Math.sin(Math.min(1, t / 0.8) * Math.PI) * 0.06 : 0;
    const hipY = hipY0 + dip, shY = hipY - 0.2;
    const lm = Array.from({ length: 33 }, () => ({ x: hipX / A, y: hipY, visibility: 0.2 }));
    const put = (k, X, Y) => (lm[k] = { x: X / A, y: Y, visibility: 0.95 });
    put(0, hipX + 0.02, shY - 0.12);
    put(11, hipX - 0.02, shY); put(12, hipX + 0.02, shY);
    put(23, hipX - 0.02, hipY); put(24, hipX + 0.02, hipY);
    // legs: knee forward when bent
    for (const s of [0, 1]) { put(25 + s, hipX + 0.02 + dip * 1.6, hipY + 0.19 - dip * 0.5); put(27 + s, hipX, 0.93); }
    // shooting arm (12 -> 14 -> 16)
    const sh = { X: hipX + 0.02, Y: shY };
    let el, wr;
    if (t < 0.8) { el = { X: sh.X + 0.05, Y: sh.Y + 0.12 }; wr = { X: sh.X + 0.1, Y: sh.Y + 0.05 }; }           // ball at the chest
    else if (t < 1.1) {                                                                                          // set point -> release
      const k = (t - 0.8) / 0.3;
      el = lArm ? { X: sh.X + 0.03 + (flare ? 0.1 : 0), Y: sh.Y - 0.02 } : { X: sh.X + 0.12, Y: sh.Y + 0.02 };
      wr = lArm ? { X: el.X - (flare ? 0.1 : 0), Y: lerp(sh.Y - 0.13, high ? sh.Y - 0.36 : sh.Y - 0.14, k) } : { X: sh.X + 0.2, Y: lerp(sh.Y - 0.02, high ? sh.Y - 0.2 : sh.Y - 0.05, k) };
      if (lArm && k > 0.6) el = { X: el.X, Y: lerp(sh.Y - 0.02, sh.Y - 0.17, (k - 0.6) / 0.4) };
    } else if (follow) { el = { X: sh.X + 0.03, Y: sh.Y - 0.18 }; wr = { X: sh.X + 0.06, Y: high ? sh.Y - 0.36 : sh.Y - 0.14 }; } // arm straight up
    else { el = { X: sh.X + 0.05, Y: sh.Y + 0.12 }; wr = { X: sh.X + 0.1, Y: sh.Y + 0.05 }; }               // drops right away
    put(14, el.X, el.Y); put(16, wr.X, wr.Y);
    put(13, hipX - 0.04, shY + 0.12); put(15, hipX - 0.04, shY + 0.22);
    frames.push({ t, lm });
  }
  return analyzeShot(frames, 1.1, A);
}

const cases = [
  ['good form', shot({}), (r) => r.score >= 8],
  ['no knee bend: legs tip', shot({ knees: false }), (r) => r.weakest === 'legs' && r.score <= 8],
  ['no follow-through: follow tip', shot({ follow: false }), (r) => r.parts.follow < 0.3 && r.score <= 8],
  ['pushed from the chest (low release)', shot({ high: false, follow: false }), (r) => r.parts.release < 0.5 && r.score <= 6],
  ['elbow flared out', shot({ flare: true }), (r) => r.parts.elbow < 0.8],
];
let bad = 0;
for (const [name, r, ok] of cases) {
  const pass = r && ok(r);
  if (!pass) bad++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}  -> ${r ? `${r.score}/10 legs ${r.parts.legs.toFixed(2)} elbow ${r.parts.elbow.toFixed(2)} release ${r.parts.release.toFixed(2)} follow ${r.parts.follow.toFixed(2)} (knee ${r.knee}°, elbow ${r.elbowAngle}°) tip: ${r.weakest}` : 'null'}`);
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
