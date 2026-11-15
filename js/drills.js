// Skill drills, the daily challenge, "Beat the Pro" targets and practice plans. Pure logic.

// counters a drill session keeps (fed from ref events and the body position)
export function newDrillState() { return { hands: [0, 0], weak: 0, cross: 0, legs: 0, slides: 0, lastHand: null, legHand: null }; }

// a dribble event -> drill counters. weakHand: 0 = left, 1 = right
export function onDribble(d, e, weakHand) {
  if (e.hand == null) return;
  d.hands[e.hand]++;
  if (e.hand === weakHand) d.weak++;
  if (d.lastHand != null && e.hand !== d.lastHand) { d.cross++; if (e.legs) d.legs++; }
  d.lastHand = e.hand;
}

// defensive slides: count each change of direction after moving at least ~1 torso length sideways
export class SlideCounter {
  constructor() { this.reset(); }
  reset() { this.x = null; this.ext = null; this.dir = 0; this.count = 0; }
  // hipX in aspect units, S torso length. A rep = turning back after going at least 1 torso length
  push(hipX, S) {
    if (this.x == null) { this.x = this.ext = hipX; return 0; }
    this.x += (hipX - this.x) * 0.5;
    if (this.dir === 0) { if (Math.abs(this.x - this.ext) > 1.0 * S) { this.dir = Math.sign(this.x - this.ext); this.ext = this.x; } }
    else if ((this.x - this.ext) * this.dir > 0) this.ext = this.x;              // still going: the far point moves
    else if ((this.ext - this.x) * this.dir > 1.0 * S) { this.count++; this.dir = -this.dir; this.ext = this.x; } // turned back far enough
    return this.count;
  }
}

// drills: added to the session modes; score() reads the finished session
export const DRILL_MODES = {
  weak30: { name: 'Weak Hand 30', desc: 'Dribble with your weaker hand only. Most dribbles in 30 s.', secs: 30, unit: 'dribbles', drill: true, pro: 70, score: (s) => s.drill.weak },
  cross30: { name: 'Crossovers 30', desc: 'Switch hands every dribble. Most crossovers in 30 s.', secs: 30, unit: 'crossovers', drill: true, pro: 45, score: (s) => s.drill.cross },
  legs30: { name: 'Between the Legs', desc: 'Bounce it through your legs from hand to hand. 30 s.', secs: 30, unit: 'reps', drill: true, pro: 24, score: (s) => s.drill.legs },
  layup60: { name: 'Layup Lines', desc: 'Most makes in 60 s. Mark the hoop first for auto scoring.', secs: 60, unit: 'makes', drill: true, pro: 22, score: (s) => s.makes },
  slides30: { name: 'Defensive Slides', desc: 'Slide side to side, low and fast. Most direction changes in 30 s.', secs: 30, unit: 'slides', drill: true, pro: 30, score: (s) => s.drill.slides },
};
// pro targets for the existing drills too
export const PRO = { dribble30: 85, shoot10: 9, ...Object.fromEntries(Object.entries(DRILL_MODES).map(([k, v]) => [k, v.pro])) };

// ---------- daily challenge: the same for everyone on a given day ----------
const TEMPLATES = [
  ['dribble30', 40, 75, 'dribbles in Handles 30'],
  ['shoot10', 4, 7, 'makes in Ten Shots'],
  ['weak30', 25, 50, 'weak-hand dribbles in 30 s'],
  ['cross30', 15, 32, 'crossovers in 30 s'],
  ['slides30', 12, 24, 'defensive slides in 30 s'],
  ['layup60', 6, 14, 'layups in 60 s'],
];
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
export function dailyChallenge(date = todayStr()) {
  const h = hash('whistle-daily-' + date), [mode, lo, hi, what] = TEMPLATES[h % TEMPLATES.length];
  const target = lo + ((h >>> 8) % (hi - lo + 1));
  return { date, mode, target, text: `${target} ${what}` };
}
// p.daily = { last: 'YYYY-MM-DD' (last day completed), streak, best }
export function completeDaily(p, date = todayStr()) {
  const d = (p.daily ||= { last: null, streak: 0, best: 0 });
  if (d.last === date) return null; // already done today
  const y = new Date(date + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
  d.streak = d.last === todayStr(y) ? d.streak + 1 : 1;
  d.last = date; d.best = Math.max(d.best, d.streak);
  return { streak: d.streak, xp: 50 + Math.min(10, d.streak - 1) * 10 };
}
export function dailyStreak(p, date = todayStr()) {
  const d = p.daily; if (!d || !d.last) return 0;
  const y = new Date(date + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
  return d.last === date || d.last === todayStr(y) ? d.streak : 0;
}

// ---------- practice plans: stations in a row, with a short rest between ----------
export const PLANS = {
  quick10: { name: 'Quick 10', desc: '10 minutes: warm-up, handles, shooting, defense', steps: [{ mode: 'free', secs: 90, name: 'Warm-up dribbling' }, { mode: 'dribble30' }, { mode: 'cross30' }, { mode: 'weak30' }, { mode: 'shoot10' }, { mode: 'slides30' }] },
  handles20: { name: 'Handles 20', desc: '20 minutes of ball handling', steps: [{ mode: 'free', secs: 120, name: 'Warm-up dribbling' }, { mode: 'dribble30' }, { mode: 'weak30' }, { mode: 'cross30' }, { mode: 'legs30' }, { mode: 'weak30' }, { mode: 'cross30' }, { mode: 'legs30' }, { mode: 'dribble30' }, { mode: 'free', secs: 120, name: 'Free play: moves' }] },
  shooter20: { name: 'Shooter 20', desc: '20 minutes of shooting with form coaching', steps: [{ mode: 'free', secs: 90, name: 'Form shots close in' }, { mode: 'shoot10' }, { mode: 'layup60' }, { mode: 'shoot10' }, { mode: 'layup60' }, { mode: 'shoot10' }] },
  complete30: { name: 'Complete 30', desc: '30 minutes: everything, like a real practice', steps: [{ mode: 'free', secs: 120, name: 'Warm-up' }, { mode: 'dribble30' }, { mode: 'cross30' }, { mode: 'weak30' }, { mode: 'legs30' }, { mode: 'slides30' }, { mode: 'shoot10' }, { mode: 'layup60' }, { mode: 'slides30' }, { mode: 'shoot10' }, { mode: 'free', secs: 180, name: 'Free play' }] },
};
export const REST_SECS = 12;
