// Tests for drills, daily challenge and streaks (js/drills.js).  node tools/test-drills.mjs
import { newDrillState, onDribble, SlideCounter, dailyChallenge, completeDaily, dailyStreak } from '../js/drills.js';
let bad = 0;
const check = (ok, name) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };
{ const d = newDrillState(); for (const h of [1, 1, 0, 1, 0, 0]) onDribble(d, { hand: h }, 0);
  check(d.weak === 3 && d.cross === 3 && d.hands[1] === 3, `weak hand + crossovers counted (weak ${d.weak}, cross ${d.cross})`); }
{ const d = newDrillState(); onDribble(d, { hand: 0 }, 0); onDribble(d, { hand: 1, legs: true }, 0); onDribble(d, { hand: 1, legs: true }, 0); onDribble(d, { hand: 0, legs: true }, 0);
  check(d.legs === 2, 'between the legs needs a hand switch + a bounce between the feet'); }
{ const c = new SlideCounter(); const S = 0.2; let n = 0;
  for (let rep = 0; rep < 6; rep++) for (let i = 0; i <= 20; i++) { const u = i / 20; n = c.push((rep % 2 ? 1 - u : u) * 0.5 + 0.5, S); }
  check(n === 5, `6 slide legs = 5 direction changes (${n})`);
  const c2 = new SlideCounter(); let m = 0; for (let i = 0; i < 200; i++) m = c2.push(0.8 + Math.sin(i) * 0.03, S);
  check(m === 0, 'swaying in place is not a slide'); }
{ const a = dailyChallenge('2026-11-15'), b = dailyChallenge('2026-11-15'), c = dailyChallenge('2026-11-16');
  check(a.text === b.text && a.target > 0, `daily challenge is the same all day (${a.text})`);
  const days = new Set(Array.from({ length: 10 }, (_, i) => dailyChallenge(`2026-12-${String(i + 1).padStart(2, '0')}`).mode));
  check(days.size >= 3, `challenges vary across days (${[...days].join(', ')})`); }
{ const p = {};
  check(completeDaily(p, '2026-11-14').streak === 1, 'first day: streak 1');
  check(completeDaily(p, '2026-11-14') === null, 'same day twice: no double reward');
  check(completeDaily(p, '2026-11-15').streak === 2 && dailyStreak(p, '2026-11-16') === 2, 'next day: streak 2, still alive the day after');
  check(completeDaily(p, '2026-11-18').streak === 1 && p.daily.best === 2, 'missed days: streak restarts, best kept'); }
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
