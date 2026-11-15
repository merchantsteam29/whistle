// Shooting form coach. Pure (no DOM): give it the last ~2 s of body poses around a shot and it
// scores four things out of 10 total, with one tip for the weakest part.
//   LEGS:    the knees bend before the shot (power comes from the legs)
//   ELBOW:   at the set point the shooting elbow is about 90° and under the ball, not flared out
//   RELEASE: the ball leaves the hand above the head
//   FOLLOW:  the arm stays up and straight after the shot ("hand in the cookie jar")
// Angles are measured in the picture, so a camera from the side or the front both work. It is a
// guide, not a lab measurement.

const ang = (a, b, c) => {
  const v1x = a.X - b.X, v1y = a.Y - b.Y, v2x = c.X - b.X, v2y = c.Y - b.Y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  return d ? (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))) * 180) / Math.PI : 180;
};
const lin = (v, at0, at1) => Math.max(0, Math.min(1, (v - at0) / (at1 - at0)));

export const FORM_TIPS = {
  legs: 'Bend your knees and jump into the shot. Your power comes from your legs.',
  elbow: 'Elbow under the ball, pointing at the rim. Make an "L" with your shooting arm.',
  release: 'Release higher, above your head, so it is harder to block and has more arc.',
  follow: 'Hold your follow-through: arm straight, wrist floppy, "hand in the cookie jar".',
};
export const FORM_NAMES = { legs: 'Legs', elbow: 'Elbow', release: 'Release', follow: 'Follow-through' };

// frames: [{t, lm}] (33 landmarks, normalised), tShot: when the shot was seen
export function analyzeShot(frames, tShot, aspect = 16 / 9) {
  const P = (lm, i) => (lm[i] && (lm[i].visibility ?? 1) > 0.3 ? { X: lm[i].x * aspect, Y: lm[i].y } : null);
  const win = frames.filter((f) => f.t >= tShot - 1.3 && f.t <= tShot + 0.8 && f.lm);
  if (win.length < 6) return null;
  // the shooting arm: the wrist that gets highest around the shot
  let side = 0, best = 9;
  for (const f of win) if (Math.abs(f.t - tShot) < 0.45) for (const s of [0, 1]) { const w = P(f.lm, 15 + s); if (w && w.Y < best) { best = w.Y; side = s; } }
  const SH = 11 + side, EL = 13 + side, WR = 15 + side;
  const torso = (lm) => { const a = P(lm, 11), b = P(lm, 12), c = P(lm, 23), d = P(lm, 24); return a && b && c && d ? Math.hypot((a.X + b.X - c.X - d.X) / 2, (a.Y + b.Y - c.Y - d.Y) / 2) : null; };
  const S = win.map((f) => torso(f.lm)).filter(Boolean).sort((a, b) => a - b)[0 | (win.length / 2)] || 0.2;

  // LEGS: the deepest knee bend before the shot
  let knee = 180;
  for (const f of win) if (f.t <= tShot + 0.1) {
    const ks = [[23, 25, 27], [24, 26, 28]].map(([h, k, a]) => { const H = P(f.lm, h), K = P(f.lm, k), A = P(f.lm, a); return H && K && A ? ang(H, K, A) : null; }).filter((v) => v != null);
    if (ks.length) knee = Math.min(knee, ks.reduce((x, y) => x + y, 0) / ks.length);
  }
  const legs = 1 - lin(knee, 142, 170);

  // ELBOW: at the set point (wrist above the shoulder, before release), elbow angle and alignment
  let setF = null, setAng = 999;
  for (const f of win) if (f.t <= tShot + 0.05) {
    const s = P(f.lm, SH), e = P(f.lm, EL), w = P(f.lm, WR);
    if (!s || !e || !w || w.Y > s.Y) continue;
    const a = ang(s, e, w); if (a < setAng) { setAng = a; setF = { s, e, w }; }
  }
  let elbow = 0;
  if (setF) {
    const angleOk = setAng >= 65 && setAng <= 110 ? 1 : setAng < 65 ? lin(setAng, 35, 65) : 1 - lin(setAng, 110, 150);
    const flare = Math.abs(setF.e.X - setF.w.X) / S; // elbow sticking out sideways from under the ball
    elbow = 0.65 * angleOk + 0.35 * (1 - lin(flare, 0.2, 0.55));
  }

  // RELEASE: how high the wrist gets above the nose
  let rel = -9;
  for (const f of win) if (Math.abs(f.t - tShot) < 0.5) { const w = P(f.lm, WR), n = P(f.lm, 0); if (w && n) rel = Math.max(rel, (n.Y - w.Y) / S); }
  const release = lin(rel, 0.0, 0.45);

  // FOLLOW-THROUGH: time after the shot with the arm straight and the hand still up
  let held = 0, prevT = null;
  for (const f of win) if (f.t >= tShot - 0.05) {
    const s = P(f.lm, SH), e = P(f.lm, EL), w = P(f.lm, WR), n = P(f.lm, 0);
    const up = s && e && w && n && ang(s, e, w) > 140 && w.Y < n.Y;
    if (up && prevT != null) held += f.t - prevT;
    prevT = f.t;
  }
  const follow = lin(held, 0.05, 0.3);

  const parts = { legs, elbow, release, follow };
  const score = Math.round((10 * (legs + elbow + release + follow)) / 4);
  const worst = Object.entries(parts).sort((a, b) => a[1] - b[1])[0];
  return { score, parts, side, tip: worst[1] < 0.75 ? FORM_TIPS[worst[0]] : 'Great form. Keep it the same every time.', weakest: worst[1] < 0.75 ? worst[0] : null, knee: Math.round(knee), elbowAngle: setF ? Math.round(setAng) : null };
}
