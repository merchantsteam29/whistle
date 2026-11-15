// Tests for HORSE / Knockout (js/turns.js).  node tools/test-turns.mjs
import { Turns } from '../js/turns.js';
let bad = 0;
const check = (ok, name) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };

{ // HORSE, 2 players: A sets and makes, B misses five times -> A wins
  const g = new Turns({ kind: 'horse', players: 2 });
  for (let k = 0; k < 5; k++) { g.shot(true, { x: 0.3, y: 0.9 }); g.shot(false); }
  check(g.winner === 0 && g.letters[1] === 5 && g.letters[0] === 0, 'HORSE: miss 5 matches = H-O-R-S-E, the setter wins');
}
{ // a missed set passes the setter role on and gives no letter
  const g = new Turns({ kind: 'horse', players: 3 });
  g.shot(false);
  const st = g.state();
  check(st.who === 1 && st.role === 'set' && g.letters[0] === 0, 'HORSE: missed set = next player sets, no letter');
}
{ // a made match gives no letter; after everyone matched, the setter rotates
  const g = new Turns({ kind: 'horse', players: 3 });
  g.shot(true, { x: 0.2, y: 0.9 });
  check(g.state().role === 'match' && g.state().who === 1, 'HORSE: after a made set, player 2 matches');
  g.shot(true); g.shot(false);
  check(g.letters[1] === 0 && g.letters[2] === 1 && g.state().role === 'set' && g.state().who === 0, 'HORSE: made match = no letter; the setter sets again');
}
{ // PIG is shorter
  const g = new Turns({ kind: 'horse', players: 2, word: 'PIG' });
  for (let k = 0; k < 3; k++) { g.shot(true); g.shot(false); }
  check(g.winner === 0, 'PIG: three letters and out');
}
{ // knockout: 3 players, round 1 A makes, B misses, C makes -> B out
  const g = new Turns({ kind: 'knockout', players: 3 });
  const ev = [...g.shot(true), ...g.shot(false), ...g.shot(true)];
  check(g.out[1] && !g.out[0] && !g.out[2] && ev.some((e) => e.type === 'out' && e.who === 1), 'Knockout: a miss when others made = out');
  // round 2: both miss -> replay, nobody out
  g.shot(false); g.shot(false);
  check(!g.out[0] && !g.out[2] && g.roundNo === 3, 'Knockout: everyone misses = nobody out');
  g.shot(true); g.shot(false);
  check(g.winner === 0, 'Knockout: last one standing wins');
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
