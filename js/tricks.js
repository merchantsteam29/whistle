// Trick contest: a 30-second run per kid. WHISTLE spots the moves, chains combos, and three judges
// hold up cards out of 10. Pure logic: feed it dribble/shot events and the body every frame.
export const TRICKS = {
  cross: { name: 'Crossover', pts: 1 },
  legs: { name: 'Between the legs', pts: 3 },
  spin: { name: 'Spin move', pts: 5 },
  layup: { name: 'Finish', pts: 4 },
  three: { name: 'Deep three', pts: 6 },
};
export class TrickRun {
  constructor() { this.moves = []; this.score = 0; this.combo = 0; this.lastT = -9; this.lastHand = null; this.spin = { min: 9, armed: false, t: 0 }; this.violations = 0; }
  add(kind, t) {
    this.combo = t - this.lastT < 1.6 ? this.combo + 1 : 0; this.lastT = t;
    const mult = 1 + Math.min(this.combo, 4) * 0.5, pts = Math.round(TRICKS[kind].pts * mult * 10) / 10;
    this.score += pts; const m = { kind, t, pts, combo: this.combo }; this.moves.push(m); return m;
  }
  // a dribble event (hand, legs) -> maybe a trick
  dribble(e, t) {
    let m = null;
    if (e.hand != null && this.lastHand != null && e.hand !== this.lastHand) m = this.add(e.legs ? 'legs' : 'cross', t);
    if (e.hand != null) this.lastHand = e.hand;
    return m;
  }
  // body each frame while dribbling: a spin = the shoulders squeeze together (side-on) and open up again quickly
  body(shoulderW, S, t, dribbling) {
    if (!dribbling || !S) return null;
    const w = shoulderW / S, sp = this.spin;
    if (w < 0.35) { if (!sp.armed) { sp.armed = true; sp.t = t; } }
    else if (sp.armed && w > 0.65) { sp.armed = false; if (t - sp.t < 1.0 && t - (sp.last || -9) > 1.2) { sp.last = t; return this.add('spin', t); } }
    if (sp.armed && t - sp.t > 1.5) sp.armed = false;
    return null;
  }
  made(three, t) { return this.add(three ? 'three' : 'layup', t); }
}
// three judges' cards out of 10: variety and combos matter, violations cost
export function judge(run, secs = 30, seed = 1) {
  const kinds = new Set(run.moves.map((m) => m.kind)).size;
  const base = Math.min(10, (run.score / secs) * 4 + kinds * 0.6 + Math.max(...run.moves.map((m) => m.combo), 0) * 0.3) - run.violations * 1.5;
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  return [0, 1, 2].map(() => Math.max(1, Math.min(10, Math.round((base + (rnd() - 0.5) * 1.2) * 2) / 2)));
}
