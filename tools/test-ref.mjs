// Synthetic tests for the ref engine: fake players (pose landmarks + ball) run through
// scripted plays at 30 fps with tracking noise, and we check the calls it makes.
//   node tools/test-ref.mjs
import { Ref } from '../js/ref.js';

const ASPECT = 16 / 9, FPS = 30, S = 0.2, HIPY = 0.55, SHY = HIPY - S, FLOOR = 0.93, R = 0.03;
let seed = 7, NOISE = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = (a) => (rnd() - 0.5) * 2 * a * NOISE;
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => u * u * (3 - 2 * u);

function newState() {
  return { hipX: 0.9, feet: [{ X: 0.85, Y: FLOOR }, { X: 0.95, Y: FLOOR }], hands: [{ X: 0.78, Y: HIPY + 0.05 }, { X: 1.02, Y: HIPY + 0.05 }], ball: null };
}

function pose(st) {
  const lm = Array.from({ length: 33 }, () => ({ x: st.hipX / ASPECT, y: HIPY, visibility: 0.2 }));
  const put = (i, X, Y) => { lm[i] = { x: (X + noise(0.002)) / ASPECT, y: Y + noise(0.002), visibility: 0.95 }; };
  put(0, st.hipX, SHY - 0.12);
  put(11, st.hipX - 0.07, SHY); put(12, st.hipX + 0.07, SHY);
  put(23, st.hipX - 0.05, HIPY); put(24, st.hipX + 0.05, HIPY);
  st.hands.forEach((h, i) => { put(15 + i, h.X, h.Y - 0.02); put(19 + i, h.X, h.Y + 0.01); });
  st.feet.forEach((f, i) => { put(27 + i, f.X, f.Y - 0.02); put(29 + i, f.X - 0.01, f.Y); });
  return lm;
}

// ---- actions: each is { dur, fn(st, u, t) } ----
const wait = (dur) => ({ dur, fn() {} });
const dribble = (n, period = 0.5) => ({
  dur: n * period,
  fn(st, u, t) {
    const hand = { X: st.hipX + 0.13, Y: HIPY + 0.04 };
    st.hands[1] = hand; st.hands[0] = { X: st.hipX - 0.1, Y: HIPY + 0.05 };
    const p = ((u * n) % 1), tri = 1 - Math.abs(2 * p - 1); // 0 at hand, 1 at floor
    st.ball = { X: hand.X, Y: lerp(hand.Y + R + 0.005, FLOOR - R, tri) };
  },
});
// a real dribble: the hand pushes down and comes back up with the ball. hide = the ball is only
// seen near the hand (it is behind the body / blurred for the rest of the bounce)
const dribblePump = (n, period = 0.5, hide = false) => ({
  dur: n * period,
  fn(st, u) {
    const p = ((u * n) % 1), tri = 1 - Math.abs(2 * p - 1);
    const hand = { X: st.hipX + 0.13, Y: HIPY + 0.02 + 0.09 * Math.max(0, Math.sin(2 * Math.PI * p)) };
    st.hands[1] = hand; st.hands[0] = { X: st.hipX - 0.1, Y: HIPY + 0.05 };
    st.ball = hide && p > 0.12 && p < 0.88 ? null : { X: hand.X, Y: lerp(HIPY + 0.02 + R + 0.005, FLOOR - R, tri) };
  },
});
// both hands together with the ball hidden between them (most real pick-ups)
const holdHidden = (dur) => ({ dur, fn(st) { st.ball = null; const c = { X: st.hipX, Y: SHY + 0.1 }; st.hands = [{ X: c.X - 0.04, Y: c.Y }, { X: c.X + 0.04, Y: c.Y }]; } });
const stepHidden = (foot) => { const a = step(foot); return { dur: a.dur, fn(st, u, t, total) { a.fn(st, u, t, total); st.ball = null; } }; };
// carrying: mid-dribble the hand goes under the ball and lifts it up to the chest
const carryLift = (dur = 0.5) => ({ dur, fn(st, u) {
  const y = lerp(HIPY + 0.12, SHY + 0.05, u);
  st.ball = { X: st.hipX + 0.13, Y: y };
  st.hands[1] = { X: st.hipX + 0.13, Y: y + R + 0.02 }; // palm under the ball
} });
// move the ball (and hands) to the chest with both hands
const pickUp = (dur = 0.25) => {
  let from;
  return { dur, fn(st, u) {
    if (!from) from = { ...st.ball };
    const tgt = { X: st.hipX, Y: SHY + 0.1 };
    st.ball = { X: lerp(from.X, tgt.X, ease(u)), Y: lerp(from.Y, tgt.Y, ease(u)) };
    st.hands = [{ X: st.ball.X - 0.035, Y: st.ball.Y }, { X: st.ball.X + 0.035, Y: st.ball.Y }];
  } };
};
const hold = (dur) => ({ dur, fn(st) { const b = { X: st.hipX, Y: SHY + 0.1 }; st.ball = b; st.hands = [{ X: b.X - 0.035, Y: b.Y }, { X: b.X + 0.035, Y: b.Y }]; } });
// one step with one foot (0 = left, 1 = right), carrying the ball (or dribbling if dribbleToo)
const step = (foot, dist = 0.12, dur = 0.25, rest = 0.2, carry = true) => {
  let start, hip0;
  return { dur: dur + rest, fn(st, u, t, total) {
    if (start == null) { start = st.feet[foot].X; hip0 = st.hipX; }
    const k = Math.min(1, (u * total) / dur);
    st.feet[foot] = { X: start + dist * ease(k), Y: FLOOR - 0.04 * Math.sin(Math.PI * k) };
    st.hipX = hip0 + (dist / 2) * ease(k);
    if (carry) { const b = { X: st.hipX, Y: SHY + 0.1 }; st.ball = b; st.hands = [{ X: b.X - 0.035, Y: b.Y }, { X: b.X + 0.035, Y: b.Y }]; }
  } };
};
// dribble while walking: steps alternate, ball keeps bouncing
const dribbleWalk = (nSteps, period = 0.45) => {
  const stepDur = 0.45; let hip0, feet0;
  return { dur: nSteps * stepDur, fn(st, u, t, total) {
    if (hip0 == null) { hip0 = st.hipX; feet0 = st.feet.map((f) => f.X); }
    const tt = u * total, k = Math.min(nSteps - 1e-9, tt / stepDur), i = Math.floor(k), f = i % 2, uu = Math.min(1, (k - i) / 0.6);
    const moved = [0, 0];
    for (let j = 0; j < i; j++) moved[j % 2] += 0.12;
    moved[f] += 0.12 * ease(uu);
    st.feet = [0, 1].map((j) => ({ X: feet0[j] + moved[j], Y: j === f ? FLOOR - 0.04 * Math.sin(Math.PI * uu) : FLOOR }));
    st.hipX = hip0 + (moved[0] + moved[1]) / 2;
    const hand = { X: st.hipX + 0.13, Y: HIPY + 0.04 };
    st.hands = [{ X: st.hipX - 0.1, Y: HIPY + 0.05 }, hand];
    const p = (tt / period) % 1, tri = 1 - Math.abs(2 * p - 1);
    st.ball = { X: hand.X, Y: lerp(hand.Y + R + 0.005, FLOOR - R, tri) };
  } };
};
// shoot from the chest at the hoop: hands rise with the ball, release, ball flies through (or past) the rim
const shoot = (hoop, make = true) => {
  let b0;
  return { dur: 1.6, fn(st, u, t, total) {
    if (!b0) b0 = { ...st.ball };
    const tt = u * total;
    const rel = { X: st.hipX + 0.02, Y: SHY - 0.15 };
    if (tt < 0.3) {
      const k = ease(tt / 0.3);
      st.ball = { X: lerp(b0.X, rel.X, k), Y: lerp(b0.Y, rel.Y, k) };
      st.hands = [{ X: st.ball.X - 0.035, Y: st.ball.Y + 0.01 }, { X: st.ball.X + 0.035, Y: st.ball.Y + 0.01 }];
      return;
    }
    st.hands = [{ X: rel.X - 0.035, Y: rel.Y + 0.01 }, { X: rel.X + 0.035, Y: rel.Y + 0.01 }];
    const k = (tt - 0.3) / 1.0;
    const cx = (hoop.x1 + hoop.x2) / 2 * ASPECT + (make ? 0 : 0.12), rimY = hoop.y1;
    // parabola from rel to (cx, rimY) with peak 0.12 above the rim, then keeps falling
    const X = lerp(rel.X, cx, Math.min(k, 1.3));
    const peak = rimY - 0.1;
    const a = k <= 0.3 ? lerp(rel.Y, peak, 1 - (1 - k / 0.3) ** 2) : peak + (rimY - peak) * ((k - 0.3) / 0.7) ** 2;
    st.ball = { X, Y: a };
  } };
};

function run(name, actions, { opts = {}, hoop = null, expect, jitter = 1, bounds = null }) {
  NOISE = jitter;
  seed = 7;
  const ref = new Ref(opts), st = newState(), events = [];
  let t = 0;
  for (const a of actions) {
    const n = Math.max(1, Math.round(a.dur * FPS));
    for (let i = 0; i < n; i++) {
      a.fn(st, (i + 1) / n, t, a.dur);
      const ball = st.ball ? { x: (st.ball.X + noise(0.0015)) / ASPECT, y: st.ball.Y + noise(0.0015), r: R } : null;
      for (const e of ref.update({ t, aspect: ASPECT, pose: pose(st), ball, hoop, bounds })) events.push({ ...e, t: +t.toFixed(2) });
      t += 1 / FPS;
    }
  }
  const count = (type, extra) => events.filter((e) => e.type === type && (!extra || Object.entries(extra).every(([k, v]) => e[k] === v))).length;
  const fails = [];
  for (const [key, want] of Object.entries(expect)) {
    const [type, kind] = key.split(':');
    const got = kind ? count(type, type === 'shotResult' ? { made: kind === 'make' } : { kind }) : count(type);
    const ok = Array.isArray(want) ? got >= want[0] && got <= want[1] : got === want;
    if (!ok) fails.push(`${key}: got ${got}, want ${JSON.stringify(want)}`);
  }
  const brief = events.filter((e) => e.type !== 'dribble' && e.type !== 'release').map((e) => `${e.t}:${e.type}${e.kind ? '/' + e.kind : ''}${e.made != null ? '/' + e.made : ''}${e.type === 'step' ? '/' + 'LR'[e.foot] + e.steps : ''}`).join(' ');
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name}  [dribbles ${count('dribble')}]`);
  if (fails.length || process.env.V) console.log('     ' + fails.join('; ') + '\n     ' + brief);
  return fails.length === 0;
}

const HOOP = { x1: (0.9 + 0.55) / ASPECT, y1: 0.12, x2: (0.9 + 0.65) / ASPECT, y2: 0.12 };
const results = [
  run('10 dribbles standing still', [wait(0.5), dribble(10)], { expect: { dribble: [9, 10], 'violation:travel': 0, 'violation:double': 0 } }),
  run('dribble, pick up, walk 4 steps = TRAVEL', [wait(0.5), dribble(4), pickUp(), hold(0.4), step(1), step(0), step(1), step(0)], { expect: { dribble: [3, 4], 'violation:travel': 1, 'violation:double': 0 } }),
  run('dribble, pick up, dribble again = DOUBLE', [wait(0.5), dribble(4), pickUp(), hold(0.6), dribble(3)], { expect: { 'violation:double': 1, 'violation:travel': 0 } }),
  run('dribble, pick up, shoot through the hoop = MAKE', [wait(0.5), dribble(4), pickUp(), hold(0.5), shoot(HOOP, true), wait(1)], { hoop: HOOP, expect: { shot: 1, 'shotResult:make': 1, 'violation:travel': 0, 'violation:double': 0 } }),
  run('shoot wide of the rim = MISS', [wait(0.5), dribble(3), pickUp(), hold(0.5), shoot(HOOP, false), wait(1)], { hoop: HOOP, expect: { shot: 1, 'shotResult:make': 0, shotResult: 1 } }),
  run('standing pivot: free foot steps 3x, no call', [wait(0.5), dribble(3), pickUp(), hold(0.6), step(0, 0.12), step(0, -0.12), step(0, 0.12)], { expect: { 'violation:travel': 0 } }),
  run('standing pivot: free foot then pivot foot = TRAVEL', [wait(0.5), dribble(3), pickUp(), hold(0.6), step(0, 0.12), step(1, 0.12), wait(0.5)], { expect: { 'violation:travel': 1 } }),
  run('dribble on the move, gather, 2 steps, shoot = legal', [wait(0.5), dribbleWalk(5), pickUp(0.2), step(1, 0.12, 0.25, 0.05), step(0, 0.12, 0.25, 0.05), shoot(HOOP, true), wait(1)], { hoop: HOOP, expect: { 'violation:travel': 0, shot: 1 } }),
  run('dribble on the move, gather, 3 steps = TRAVEL', [wait(0.5), dribbleWalk(5), pickUp(0.2), step(1, 0.12, 0.25, 0.05), step(0, 0.12, 0.25, 0.05), step(1, 0.12, 0.25, 0.05), wait(0.5)], { expect: { 'violation:travel': 1 } }),
  run('beginner mode (3 steps allowed): 3 steps = legal', [wait(0.5), dribbleWalk(5), pickUp(0.2), step(1, 0.12, 0.25, 0.05), step(0, 0.12, 0.25, 0.05), step(1, 0.12, 0.25, 0.05), wait(0.5)], { opts: { stepsAllowed: 3 }, expect: { 'violation:travel': 0 } }),
  run('walking while dribbling = legal', [wait(0.5), dribbleWalk(8)], { expect: { 'violation:travel': 0, dribble: [6, 9] } }),
  run('catch and walk without dribbling = TRAVEL', [wait(0.5), hold(0.6), step(1), step(0), step(1), step(0)], { expect: { 'violation:travel': 1, 'violation:double': 0 } }),
  run('dribble with the ball hidden most of each bounce (hand pumps count)', [wait(0.5), dribblePump(12, 0.5, true)], { expect: { dribble: [10, 12], 'violation:double': 0 } }),
  run('dribble fully visible + hand pumping: no double counting', [wait(0.5), dribblePump(12, 0.5, false)], { expect: { dribble: [11, 12] } }),
  run('fast dribble (3 per second), hidden', [wait(0.5), dribblePump(15, 0.33, true)], { expect: { dribble: [12, 15] } }),
  run('pick up with the ball hidden in both hands, walk = TRAVEL', [wait(0.5), dribblePump(4, 0.5, true), holdHidden(0.6), stepHidden(1), stepHidden(0), stepHidden(1), stepHidden(0)], { expect: { 'violation:travel': 1, 'violation:double': 0 } }),
  run('normal dribbling is never a carry', [wait(0.5), dribblePump(12, 0.5, false), dribble(10)], { expect: { 'violation:carry': 0 } }),
  run('hand scoops under the ball mid-dribble = CARRYING', [wait(0.5), dribble(4), carryLift(0.5), wait(0.3)], { expect: { 'violation:carry': 1 } }),
  run('dribble across the sideline = OUT OF BOUNDS', [wait(0.5), dribbleWalk(8)], { bounds: { x1: 1.3 / ASPECT, y1: 0.5, x2: 1.3 / ASPECT, y2: 1.0, side: 1 }, expect: { 'violation:out': 1 } }),
  run('dribbling inside the lines = no call', [wait(0.5), dribbleWalk(8)], { bounds: { x1: 1.9 / ASPECT, y1: 0.5, x2: 1.9 / ASPECT, y2: 1.0, side: 1 }, expect: { 'violation:out': 0 } }),
  run('holding still 6 s with shaky tracking = no call', [wait(0.5), dribble(3), pickUp(), hold(6)], { jitter: 3, expect: { 'violation:travel': 0, step: 0 } }),
  run('dribbling 20x with shaky tracking', [wait(0.5), dribble(20)], { jitter: 3, expect: { dribble: [18, 20], 'violation:travel': 0, 'violation:double': 0 } }),
];
const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
