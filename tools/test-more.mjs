// Tests for tricks, career, calibration and leagues.  node tools/test-more.mjs
import { TrickRun, judge } from '../js/tricks.js';
import { CHAPTERS, passed, advance, careerOf } from '../js/career.js';
import { Calibrator } from '../js/calib.js';
import { isoWeek, weekDrills, leaguePoints } from '../js/league.js';
let bad = 0;
const check = (ok, name) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };

{ const r = new TrickRun(); r.dribble({ hand: 0 }, 0); r.dribble({ hand: 1 }, 0.4); r.dribble({ hand: 0, legs: true }, 0.8);
  check(r.moves.length === 2 && r.moves[1].kind === 'legs' && r.moves[1].combo === 1 && r.score === 1 + 4.5, `crossover then legs = a combo (${r.score} pts)`);
  // spin: shoulders squeeze then open within a second
  const s = new TrickRun(); let m = null;
  for (const [w, t] of [[0.8, 0], [0.5, 0.2], [0.25, 0.35], [0.3, 0.5], [0.7, 0.7]]) m = s.body(w * 0.2, 0.2, t, true) || m;
  check(m && m.kind === 'spin', 'spin move detected from the shoulders turning');
  const slow = new TrickRun(); let m2 = null;
  for (const [w, t] of [[0.25, 0], [0.25, 1.4], [0.8, 1.6]]) m2 = slow.body(w * 0.2, 0.2, t, true) || m2;
  check(!m2, 'standing side-on is not a spin');
  const cards = judge(r, 30, 3);
  check(cards.length === 3 && cards.every((c) => c >= 1 && c <= 10), `three judges' cards (${cards.join(', ')})`);
  const big = new TrickRun(); for (let i = 0; i < 30; i++) big.dribble({ hand: i % 2, legs: i % 3 === 0 }, i * 0.5);
  check(judge(big)[0] > judge(r)[0], 'more tricks = higher cards'); }

{ const p = {};
  check(careerOf(p).ch === 0 && passed(CHAPTERS[0], { score: 31 }) && !passed(CHAPTERS[0], { score: 20 }), 'career: chapter 1 needs 30 dribbles');
  check(passed(CHAPTERS[4], { won: true }) && !passed(CHAPTERS[4], { won: false }), 'career: rival chapters need a win');
  for (let i = 0; i < CHAPTERS.length - 1; i++) advance(p);
  const last = advance(p);
  check(last.champion && p.career.done, 'career: finishing the final = champion'); }

{ const c = new Calibrator(); let x = 0;
  for (let i = 0; i < 90; i++) { const j = Math.sin(i * 1.7) * 0.004; c.addStill([{ X: 0.8 + j, Y: 0.9 }, { X: 0.9 - j, Y: 0.9 }], 0.2, i / 30); }
  for (const t of [0, 0.5, 1.0, 1.5, 2.0]) c.addDribble(t);
  for (let i = 0; i < 20; i++) c.addBall({ r: 0.05 }, 0.2);
  const r = c.result();
  check(r.footV >= 1 && r.drPeriod === 0.5 && r.ballRR === 0.25, `calibration: footV ${r.footV}, dribble ${r.drPeriod}s, ball ${r.ballRR}`);
  const n = new Calibrator(); for (let i = 0; i < 90; i++) { const j = Math.sin(i * 2.3) * 0.03; n.addStill([{ X: 0.8 + j, Y: 0.9 }, { X: 0.9 - j, Y: 0.9 }], 0.2, i / 30); }
  check(n.result().footV > r.footV, 'shaky tracking = stricter step threshold'); }

{ check(isoWeek(new Date(2026, 10, 15)) === '2026-W46', `ISO week (${isoWeek(new Date(2026, 10, 15))})`);
  const d = weekDrills('2026-W46'); check(d.length === 3 && new Set(d).size === 3 && JSON.stringify(d) === JSON.stringify(weekDrills('2026-W46')), `3 different drills of the week (${d.join(', ')})`);
  const now = new Date(2026, 10, 15, 12), drills = weekDrills(isoWeek(now));
  const p = { history: [{ mode: drills[0], score: 40, at: now.getTime() - 3600e3 }, { mode: drills[0], score: 60, at: now.getTime() - 7200e3 }, { mode: drills[1], score: 999, at: now.getTime() }, { mode: drills[2], score: 50, at: now.getTime() - 30 * 864e5 }] };
  const lp = leaguePoints(p, now);
  check(lp.parts[0].best === 60 && lp.parts[1].pts === 150 && lp.parts[2].best === null, `league points: best this week, capped, old weeks ignored (${lp.total})`); }

console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
