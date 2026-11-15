// Synthetic tests for game mode (js/game.js): identity, possession, fouls, scoring, free throws.
//   node tools/test-game.mjs
import { Game, Court } from '../js/game.js';

const A = 16 / 9, FPS = 30;
let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const nz = (a) => (rnd() - 0.5) * 2 * a;
const lerp = (a, b, u) => a + (b - a) * u;

// a player: hip X (aspect units), depth k (1 = normal size, <1 = further away), hands, feet
function player(hipX, k = 1, floorY = 0.93) {
  const S = 0.2 * k, hipY = floorY - 0.38 * k;
  return { hipX, k, S, hipY, shY: hipY - S, floorY,
    hands: [{ X: hipX - 0.1 * k, Y: hipY + 0.05 * k }, { X: hipX + 0.1 * k, Y: hipY + 0.05 * k }],
    feet: [{ X: hipX - 0.05 * k, Y: floorY }, { X: hipX + 0.05 * k, Y: floorY }] };
}
function pose(p) {
  const lm = Array.from({ length: 33 }, () => ({ x: p.hipX / A, y: p.hipY, visibility: 0.2 }));
  const put = (i, X, Y) => { lm[i] = { x: (X + nz(0.0015)) / A, y: Y + nz(0.0015), visibility: 0.95 }; };
  const k = p.k;
  put(0, p.hipX, p.shY - 0.12 * k);
  put(11, p.hipX - 0.07 * k, p.shY); put(12, p.hipX + 0.07 * k, p.shY);
  put(23, p.hipX - 0.05 * k, p.hipY); put(24, p.hipX + 0.05 * k, p.hipY);
  p.hands.forEach((h, i) => {
    const sx = p.hipX + (i ? 0.07 : -0.07) * k;
    put(13 + i, (sx + h.X) / 2, (p.shY + h.Y) / 2); // elbow halfway
    put(15 + i, h.X, h.Y - 0.02 * k); put(19 + i, h.X, h.Y + 0.01 * k);
  });
  p.feet.forEach((f, i) => { put(27 + i, f.X, f.Y - 0.02 * k); put(29 + i, f.X - 0.01, f.Y); });
  return lm;
}
const holdBall = (p) => { const b = { X: p.hipX, Y: p.shY + 0.1 * p.k }; p.hands = [{ X: b.X - 0.035 * p.k, Y: b.Y }, { X: b.X + 0.035 * p.k, Y: b.Y }]; return b; };
const dribbleBall = (p, u) => { const hand = { X: p.hipX + 0.13 * p.k, Y: p.hipY + 0.04 * p.k }; p.hands[1] = hand; const tri = 1 - Math.abs(2 * (u % 1) - 1); return { X: hand.X, Y: lerp(hand.Y + 0.035, p.floorY - 0.03, tri) }; };

// script: list of {dur, fn(state, u, t)}; state = {ps: [players], ball}
function run(name, setup, script, { format = '1v1', rules = {}, hoop = null, threeLine = null, lane = null, expect, answer }) {
  seed = 3;
  const g = new Game({ format, rules }), st = setup(), evs = [];
  let t = 0;
  for (const a of script) {
    const n = Math.max(1, Math.round(a.dur * FPS));
    for (let i = 0; i < n; i++) {
      a.fn(st, (i + 1) / n, t);
      const ball = st.ball ? { x: st.ball.X / A, y: st.ball.Y, r: 0.03 } : null;
      for (const e of g.update({ t, aspect: A, poses: st.ps.map((p) => p && pose(p)), ball, hoop, threeLine, lane })) {
        evs.push({ ...e, t: +t.toFixed(2) });
        if (e.type === 'needResult' && answer != null) for (const e2 of g.resolve(answer)) evs.push({ ...e2, t: +t.toFixed(2) });
      }
      t += 1 / FPS;
    }
  }
  const fails = [];
  for (const [k, want] of Object.entries(expect)) {
    let got;
    if (k === 'score') got = g.score.join('-');
    else if (k.startsWith('stat:')) { const [, i, f] = k.split(':'); got = g.stats[+i][f]; }
    else { const [type, kind] = k.split(':'); got = evs.filter((e) => e.type === type && (!kind || e.kind === kind || e.result === kind || String(e.who) === kind)).length; }
    const ok = Array.isArray(want) ? got >= want[0] && got <= want[1] : got === want;
    if (!ok) fails.push(`${k}: got ${got}, want ${JSON.stringify(want)}`);
  }
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name}`);
  if (fails.length || process.env.V) console.log('     ' + fails.join('; ') + '\n     ' + evs.filter((e) => process.env.ALL || !['dribble', 'release', 'gather', 'step', 'streakEnd'].includes(e.type)).map((e) => `${e.t}:${e.type}${e.kind ? '/' + e.kind : ''}${e.result ? '/' + e.result : ''}#${e.who}`).join(' '));
  return !fails.length;
}

const wait = (d) => ({ dur: d, fn() {} });
const dribbleFor = (who, d, per = 0.5) => ({ dur: d, fn(st, u) { st.ball = dribbleBall(st.ps[who], (u * d) / per); } });
const hold = (who, d) => ({ dur: d, fn(st) { st.ball = holdBall(st.ps[who]); } });
const both = (who, d, fn) => ({ dur: d, fn(st, u, t) { st.ball = holdBall(st.ps[who]); fn(st, u, t); } });
const two = (k2 = 1, f2 = 0.93) => () => ({ ps: [player(0.75), player(1.0, k2, f2)], ball: null });
const far = () => ({ ps: [player(0.5), player(1.4)], ball: null });

// defender (1) hand swipes from its side into the holder's (0) forearm / body
const swipe = (dur = 0.15, target = 'arm') => ({ dur, fn(st, u) {
  const a = st.ps[0], b = st.ps[1];
  const tgt = target === 'arm' ? { X: a.hipX + 0.06, Y: a.shY + 0.07 } : { X: a.hipX + 0.03, Y: a.shY + 0.12 };
  const from = { X: b.hipX - 0.1, Y: b.hipY + 0.05 };
  b.hands[0] = { X: lerp(from.X, tgt.X, Math.min(1, u * 1.2)), Y: lerp(from.Y, tgt.Y, Math.min(1, u * 1.2)) };
} });
const handOn = (dur) => ({ dur, fn(st, u) { const a = st.ps[0], b = st.ps[1], k = Math.min(1, (u * dur) / 0.5); b.hands[0] = { X: lerp(b.hipX - 0.1, a.hipX + 0.065, k), Y: lerp(b.hipY + 0.05, a.shY + 0.05, k) }; } });
const handsOff = { dur: 0.05, fn(st) { const b = st.ps[1]; b.hands = [{ X: b.hipX - 0.1, Y: b.hipY + 0.05 }, { X: b.hipX + 0.1, Y: b.hipY + 0.05 }]; } };
const shove = (dur = 0.35) => ({ dur, fn(st, u) {
  const a = st.ps[0], b = st.ps[1];
  const k = Math.min(1, u / 0.5); b.hands[0] = { X: lerp(b.hipX - 0.1, a.hipX + 0.04, k), Y: lerp(b.hipY + 0.05, a.hipY - 0.03, k) }; if (u < 0.6) return;
  const dx = -0.02; a.hipX += dx; a.hands.forEach((h) => (h.X += dx)); a.feet.forEach((f) => (f.X += dx));
} });
const HOOP = { x1: 0.15 / A, y1: 0.12, x2: 0.25 / A, y2: 0.12 };
const shotAt = (who, make = true) => {
  let b0;
  return { dur: 1.6, fn(st, u) {
    const p = st.ps[who], tt = u * 1.6; if (!b0) b0 = holdBall(p);
    const rel = { X: p.hipX + 0.02, Y: p.shY - 0.15 };
    if (tt < 0.3) { st.ball = { X: lerp(b0.X, rel.X, tt / 0.3), Y: lerp(b0.Y, rel.Y, tt / 0.3) }; p.hands = [{ X: st.ball.X - 0.035, Y: st.ball.Y }, { X: st.ball.X + 0.035, Y: st.ball.Y }]; return; }
    p.hands = [{ X: rel.X - 0.035, Y: rel.Y }, { X: rel.X + 0.035, Y: rel.Y }];
    const k = (tt - 0.3) / 1.0, cx = (HOOP.x1 + HOOP.x2) / 2 * A + (make ? 0 : 0.15), peak = HOOP.y1 - 0.1;
    st.ball = { X: lerp(rel.X, cx, Math.min(k, 1.3)), Y: k <= 0.3 ? lerp(rel.Y, peak, 1 - (1 - k / 0.3) ** 2) : peak + (HOOP.y1 - peak) * ((k - 0.3) / 0.7) ** 2 };
  } };
};

globalThis.DBG = process.env.DBG;
const R = [
  run('players far apart: dribbling, no fouls', far, [wait(0.3), dribbleFor(0, 4)], { expect: { foul: 0, 'stat:0:dr': [7, 8], possession: 1 } }),
  run('reach-in: defender swipes the holder\'s arm', two(), [wait(0.3), hold(0, 0.8), both(0, 0.15, swipe(0.15).fn), wait(0.5)], { expect: { 'foul:reach': 1, 'foul:sideOut': 1, 'stat:1:pf': 1, ftStart: 0 } }),
  run('same swipe but the defender is further back (behind) = no foul', two(0.8, 0.86), [wait(0.3), hold(0, 0.8), both(0, 0.15, swipe(0.15).fn), wait(0.5)], { expect: { foul: 0 } }),
  run('holding: hand stays on the arm for a second', two(), [wait(0.3), hold(0, 0.6), both(0, 1.2, handOn(1.2).fn), wait(0.3)], { expect: { 'foul:hold': 1 } }),
  run('hand on the ball (a steal try) = no foul', two(), [wait(0.3), hold(0, 0.6), both(0, 0.6, (st) => { const a = st.ps[0], b = st.ps[1]; b.hands[0] = { X: a.hipX + 0.05, Y: a.shY + 0.1 }; }), handsOff, wait(0.3)], { expect: { foul: 0 } }),
  run('pushing: hand on the body, then shoved away', two(), [wait(0.3), hold(0, 0.6), both(0, 0.9, shove(0.9).fn), wait(0.4)], { expect: { 'foul:push': 1 } }),
  run('make from behind the 3-point line = 3 points', far, [wait(0.3), dribbleFor(0, 1.5), hold(0, 0.5), shotAt(0, true), wait(0.8)], { hoop: HOOP, threeLine: { x: 0.35 / A, y: 0.9 }, expect: { score: '3-0', 'stat:0:tpm': 1 } }),
  run('make from inside the line = 2 points', far, [wait(0.3), dribbleFor(0, 1.5), hold(0, 0.5), shotAt(0, true), wait(0.8)], { hoop: HOOP, threeLine: { x: 0.65 / A, y: 0.9 }, expect: { score: '2-0', 'stat:0:fgm': 1 } }),
  run('no hoop: asks, answer "made" = 2 points', far, [wait(0.3), dribbleFor(0, 1.5), hold(0, 0.5), shotAt(0, true), wait(3.2)], { answer: true, expect: { needResult: 1, score: '2-0' } }),
  run('bonus: 5th team foul = 2 free throws', two(), [wait(0.3), ...Array.from({ length: 5 }, () => [hold(0, 0.6), both(0, 0.15, swipe(0.15).fn), handsOff, wait(2.2)]).flat()], { rules: { bonusAt: 5, foulOut: 0 }, expect: { 'foul:reach': 5, 'foul:bonus': 1, ftStart: 1, 'stat:1:pf': 5 } }),
  run('foul out at 5', two(), [wait(0.3), ...Array.from({ length: 5 }, () => [hold(0, 0.6), both(0, 0.15, swipe(0.15).fn), handsOff, wait(2.2)]).flat()], { rules: { bonusAt: 0, foulOut: 5 }, expect: { fouledOut: 1 } }),
  run('free throws: 2 shots, both made = 2 points', two(), [wait(0.3), ...Array.from({ length: 5 }, () => [hold(0, 0.6), both(0, 0.15, swipe(0.15).fn), handsOff, wait(2.2)]).flat(), (() => { return { dur: 0.01, fn(st) { st.ps[1] = player(1.6); } }; })(), hold(0, 1.0), shotAt(0, true), wait(1), hold(0, 0.6), shotAt(0, true), wait(1)], { rules: { bonusAt: 5, foulOut: 0 }, hoop: HOOP, expect: { ftResult: 2, score: '2-0', 'stat:0:ftm': 2, ftDone: 1 } }),
  run('game to 3: one three ends it', far, [wait(0.3), dribbleFor(0, 1.5), hold(0, 0.5), shotAt(0, true), wait(0.8)], { rules: { toPoints: 3 }, hoop: HOOP, threeLine: { x: 0.35 / A, y: 0.9 }, expect: { gameOver: 1 } }),
  run('3 seconds: standing in the lane with the ball', far, [wait(0.3), dribbleFor(0, 4.5)], { lane: { x1: 0.4 / A, x2: 0.6 / A }, expect: { 'violation:lane': 1 } }),
  run('outside the lane: no 3 seconds', far, [wait(0.3), dribbleFor(0, 4.5)], { lane: { x1: 0.8 / A, x2: 1.0 / A }, expect: { 'violation:lane': 0 } }),
  run('defender in the lane is fine (only the team with the ball)', () => ({ ps: [player(0.3), player(1.0)], ball: null }), [wait(0.3), dribbleFor(0, 4.5)], { lane: { x1: 0.9 / A, x2: 1.1 / A }, expect: { 'violation:lane': 0 } }),
  run('shot clock (5 s) runs out', far, [wait(0.3), dribbleFor(0, 6.5)], { rules: { shotClock: 5 }, expect: { 'violation:shotclock': 1 } }),
  run('shot clock resets on a shot', far, [wait(0.3), dribbleFor(0, 3), hold(0, 0.4), shotAt(0, false), wait(0.4), dribbleFor(0, 3)], { rules: { shotClock: 5 }, hoop: HOOP, expect: { 'violation:shotclock': 0, shot: 1 } }),
];

// identity: two players cross; shirts keep them apart
{
  const c = new Court(2); let ok = true; const shirts = [{ h: 0, s: 0.8, v: 0.6 }, { h: 220, s: 0.7, v: 0.5 }];
  let t = 0; const ps = [player(0.6), player(1.2)];
  c.assign(ps.map((p, i) => ({ lm: pose(p), shirt: shirts[i] })), t, A); c.lock();
  for (let i = 0; i < 90; i++) { // they walk past each other (swap sides over 3 s), the list order also flips
    t += 1 / FPS; const u = i / 89;
    ps[0] = player(lerp(0.6, 1.2, u)); ps[1] = player(lerp(1.2, 0.6, u));
    const list = ps.map((p, j) => ({ lm: pose(p), shirt: shirts[j] })); if (i % 2) list.reverse();
    const out = c.assign(list, t, A);
    const x0 = out[0] && (out[0][23].x + out[0][24].x) / 2 * A;
    if (Math.abs(x0 - ps[0].hipX) > 0.05) ok = false;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} identity: two players cross paths, Home stays Home`); R.push(ok);
}
const bad = R.filter((r) => !r).length;
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
