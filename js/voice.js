// Ref voice packs: what the ref says, and how (speed / pitch of the device's speech voice).
//   coach:  calm and encouraging
//   hype:   a loud arena announcer
//   strict: a no-nonsense game ref
import { say } from './audio.js';

const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a);

export const PACKS = {
  coach: {
    name: 'Coach', desc: 'Calm and encouraging', rate: 1.0, pitch: 1.0,
    lines: {
      travel: ['Traveling. Pick a pivot foot.', 'That\'s a travel. Feet still when you hold it.'],
      double: 'Double dribble. Once you pick it up, pass or shoot.',
      carry: 'Carrying. Keep your hand on top of the ball.',
      out: 'Out of bounds. Watch the line.',
      lane: 'Three seconds. Keep moving through the lane.',
      shotclock: 'Shot clock. Look to attack sooner.',
      foul: (n) => `${n}. Defend with your feet.`,
      make: ['Nice shot!', 'Good bucket!', 'That\'s it!'],
      three: 'Great three!',
      streak: (k) => `${k} in a row, nice handle!`,
      onfire: (k) => `${k} straight. You're on fire!`,
      ft: (k) => `${k} free throws. Take your time.`,
      andone: 'And one! Go get the free throw.',
      levelup: (l) => `Level up! You're a ${l} now.`,
      win: (t) => `Game over. ${t} wins. Good game everyone.`,
      go: 'Let\'s go!', time: 'Time!',
      setshot: (n) => `${n}, set the shot.`, match: (n) => `${n}, match it.`, letter: (n, w) => `${n} has ${w.split('').join(' ')}.`, knocked: (n) => `${n} is out. Good try.`,
    },
  },
  hype: {
    name: 'Hype announcer', desc: 'Loud arena energy', rate: 1.15, pitch: 1.25,
    lines: {
      travel: ['Ohhh! TRAVELING! Too many steps!', 'Whoa whoa whoa, that\'s a WALK!'],
      double: 'DOUBLE DRIBBLE! You can\'t do that!',
      carry: 'CARRY! That\'s a palm job!',
      out: 'OUT OF BOUNDS! Turnover!',
      lane: 'THREE SECONDS! Get out of the paint!',
      shotclock: 'The shot clock BUZZES! Turnover!',
      foul: (n) => `${n}! WHISTLE BLOWN!`,
      make: ['BANG!', 'BUCKETS!', 'Count it!', 'Nothing but NET!'],
      three: ['FROM DOWNTOWN!', 'BANG! For THREE!'],
      streak: (k) => `${k} dribbles! Ankles are in DANGER!`,
      onfire: (k) => `${k} straight! HE'S ON FIRE!`,
      ft: (k) => `${k} shots at the line! The crowd goes quiet!`,
      andone: 'AND ONE! What a play!',
      levelup: (l) => `LEVEL UP! Say hello to the new ${l}!`,
      win: (t) => `THAT'S GAME! ${t} TAKES IT!`,
      go: 'IT\'S GAME TIME!', time: 'TIIIME!',
      setshot: (n) => `${n} steps up to SET THE SHOT!`, match: (n) => `Can ${n} MATCH IT?`, letter: (n, w) => `Ohhh! ${n} picks up a letter! ${w.split('').join(' ')}!`, knocked: (n) => `${n} is KNOCKED OUT!`,
    },
  },
  strict: {
    name: 'Strict ref', desc: 'Short, formal calls', rate: 0.95, pitch: 0.85,
    lines: {
      travel: 'Traveling. Turnover.', double: 'Double dribble. Turnover.', carry: 'Carrying violation.',
      out: 'Out of bounds.', lane: 'Three seconds.', shotclock: 'Shot clock violation.',
      foul: (n) => `${n}.`,
      make: 'Good.', three: 'Three points.',
      streak: (k) => `${k}.`, onfire: (k) => `${k} consecutive makes.`,
      ft: (k) => `${k} shots.`, andone: 'Basket counts. One shot.',
      levelup: (l) => `Promoted. ${l}.`, win: (t) => `Final. ${t} wins.`,
      go: 'Play.', time: 'Time.',
      setshot: (n) => `${n}. Set.`, match: (n) => `${n}. Match.`, letter: (n, w) => `${n}. ${w.split('').join(' ')}.`, knocked: (n) => `${n}. Eliminated.`,
    },
  },
};

let pack = PACKS.coach;
export function setPack(id) { pack = PACKS[id] || PACKS.coach; }
// call('make'), call('foul', 'Reach-in foul'), call('streak', 25) ...
export function call(key, a, b, delay = 0) {
  const l = pack.lines[key]; if (l == null) return;
  const text = typeof l === 'function' ? l(a, b) : pick(l);
  say(text, delay, { rate: pack.rate, pitch: pack.pitch });
}
export function preview(id) { const p = PACKS[id] || PACKS.coach; say(pick(p.lines.make) + ' ' + pick(p.lines.travel), 0, { rate: p.rate, pitch: p.pitch }); }
