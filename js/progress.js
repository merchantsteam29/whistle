// Players, XP, levels, badges and session history. Saved in this browser (localStorage).
const KEY = 'whistle.v1';

export const LEVELS = [
  [0, 'Rookie'], [150, 'Bench'], [400, 'Sixth Man'], [800, 'Starter'], [1400, 'Varsity'],
  [2200, 'Captain'], [3300, 'All-Conference'], [4800, 'All-Star'], [7000, 'MVP'], [10000, 'Hall of Fame'],
];

export const XP = {
  dribble: 1, attempt: 3, make: 15, makeStreak: 5, clean: 4,
  streak: { 10: 5, 25: 15, 50: 30, 100: 60, 200: 100 },
  drillDone: 25, drillBest: 25,
  game: { point: 5, played: 15, win: 40 },
};

export const MODES = {
  free: { name: 'Free Play', desc: 'Every call is live. Dribble, shoot, move. No clock.' },
  dribble30: { name: 'Handles 30', desc: 'Most dribbles in 30 seconds. No travels or double dribbles.', secs: 30 },
  shoot10: { name: 'Ten Shots', desc: 'Take 10 shots. Mark the hoop and it scores them for you.', shots: 10 },
  game: { name: 'Game', desc: '1v1 or 2v2 on one camera: fouls, 2s and 3s, free throws.', game: true },
};

// badges: test(session, lifetimeStats) -> true when earned
export const BADGES = [
  { id: 'first', name: 'First Bucket', desc: 'Make your first shot', icon: 'ball', test: (s, L) => L.makes >= 1 },
  { id: 'hot', name: 'Hot Hand', desc: '3 makes in a row', icon: 'flame', test: (s) => s.bestMakeRun >= 3 },
  { id: 'fire', name: 'On Fire', desc: '5 makes in a row', icon: 'flame2', test: (s) => s.bestMakeRun >= 5 },
  { id: 'handles', name: 'Handles', desc: '25 dribbles in a row', icon: 'bounce', test: (s) => s.bestStreak >= 25 },
  { id: 'string', name: 'Ball on a String', desc: '50 dribbles in a row', icon: 'bounce2', test: (s) => s.bestStreak >= 50 },
  { id: 'metro', name: 'Metronome', desc: '100 dribbles in a row', icon: 'metro', test: (s) => s.bestStreak >= 100 },
  { id: 'k1', name: '1K Club', desc: '1,000 dribbles all-time', icon: 'k', test: (s, L) => L.dribbles >= 1000 },
  { id: 'k10', name: '10K Club', desc: '10,000 dribbles all-time', icon: 'k', test: (s, L) => L.dribbles >= 10000 },
  { id: 'sharp', name: 'Sharpshooter', desc: '10 makes in one session', icon: 'target', test: (s) => s.makes >= 10 },
  { id: 'century', name: 'Century', desc: '100 makes all-time', icon: 'hundred', test: (s, L) => L.makes >= 100 },
  { id: 'clean', name: 'Clean Sheet', desc: '3+ minutes, 50+ dribbles, zero violations', icon: 'shield', test: (s) => s.seconds >= 180 && s.dribbles >= 50 && s.travels + s.doubles === 0 },
  { id: 'feet', name: 'Footwork', desc: '20 clean pick-ups (no travel) in a session', icon: 'feet', test: (s) => s.clean >= 20 },
  { id: 'perfect', name: 'Perfect Ten', desc: '10 for 10 in Ten Shots', icon: 'star', test: (s) => s.mode === 'shoot10' && s.makes >= 10 },
  { id: 'quick', name: 'Quick Hands', desc: '60+ dribbles in Handles 30', icon: 'bolt', test: (s) => s.mode === 'dribble30' && s.dribbles >= 60 },
  { id: 'win', name: 'Winner', desc: 'Win a game', icon: 'trophy', test: (s) => s.mode === 'game' && s.won },
  { id: 'splash', name: 'Splash', desc: 'Hit a three in a game', icon: 'three', test: (s) => s.mode === 'game' && s.threes >= 1 },
  { id: 'cleangame', name: 'Lockdown', desc: 'Win a game without a foul', icon: 'shield', test: (s) => s.mode === 'game' && s.won && s.fouls === 0 },
  { id: 'rat', name: 'Gym Rat', desc: 'Finish 10 sessions', icon: 'cal', test: (s, L) => L.sessions >= 10 },
  { id: 'iron', name: 'Iron Player', desc: '60 minutes of practice all-time', icon: 'clock', test: (s, L) => L.seconds >= 3600 },
];

const blankStats = () => ({ sessions: 0, seconds: 0, dribbles: 0, bestStreak: 0, makes: 0, shots: 0, travels: 0, doubles: 0, clean: 0, games: 0, wins: 0, points: 0, fouls: 0 });
const DEFAULT_SETTINGS = { aiBall: false, trackView: false, threeLine: null, gameRules: { format: '1v1', toPoints: 11, foulOut: 5, bonusAt: 5 }, roster: [], stepsAllowed: 2, whistle: true, voice: true, volume: 0.8, skeleton: true, sensitivity: 1, quality: 'fast', facing: 'user', mirror: true, ballColor: null, hoop: null };
const COLORS = ['#ff7a1a', '#2f8cff', '#19c37d', '#e5484d', '#a259ff', '#ffc53d', '#14b8c4', '#f472b6'];

let data = null;
function blank() { return { players: [], current: null, settings: { ...DEFAULT_SETTINGS } }; }
export function load() {
  if (data) return data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { data = blank(); }
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  data.players ||= [];
  for (const p of data.players) { p.stats = { ...blankStats(), ...(p.stats || {}) }; p.badges ||= {}; p.bests ||= {}; p.history ||= []; }
  return data;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }
export const settings = () => load().settings;

export function players() { return load().players; }
export function current() { const d = load(); return d.players.find((p) => p.id === d.current) || d.players[0] || null; }
export function select(id) { load().current = id; save(); }
export function addPlayer(name, num) {
  const d = load();
  const p = { id: Math.random().toString(36).slice(2, 10), name: (name || 'Player').trim().slice(0, 18), num: String(num ?? '').replace(/\D/g, '').slice(0, 2),
    color: COLORS[d.players.length % COLORS.length], xp: 0, created: Date.now(), stats: blankStats(), badges: {}, bests: {}, history: [] };
  d.players.push(p); d.current = p.id; save(); return p;
}
export function removePlayer(id) {
  const d = load(); d.players = d.players.filter((p) => p.id !== id);
  if (d.current === id) d.current = d.players[0]?.id || null; save();
}

export function levelOf(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const floor = LEVELS[i][0], next = LEVELS[i + 1]?.[0] ?? null;
  return { n: i + 1, name: LEVELS[i][1], floor, next, pct: next ? (xp - floor) / (next - floor) : 1, toNext: next ? next - xp : 0 };
}

// a running session: main.js feeds it ref events and it adds up stats + XP
export function newSession(mode) {
  return { mode, start: Date.now(), seconds: 0, dribbles: 0, bestStreak: 0, makes: 0, shots: 0, makeRun: 0, bestMakeRun: 0, travels: 0, doubles: 0, clean: 0,
    xp: 0, xpBy: { dribbles: 0, streaks: 0, shots: 0, footwork: 0, drill: 0 } };
}
export function addXP(s, kind, n) { s.xp += n; s.xpBy[kind] = (s.xpBy[kind] || 0) + n; return n; }

// finish: add the session into the player's lifetime totals, check badges and bests
export function finish(s, pid) {
  const p = pid ? load().players.find((q) => q.id === pid) : current(); if (!p) return null;
  const before = levelOf(p.xp);
  const L = p.stats;
  const drill = { isBest: false, score: null, prev: null };
  if (s.mode === 'dribble30' && s.complete) drill.score = s.dribbles;
  if (s.mode === 'shoot10' && s.complete) drill.score = s.makes;
  if (drill.score != null) {
    addXP(s, 'drill', XP.drillDone);
    drill.prev = p.bests[s.mode] ?? null;
    if (drill.prev == null || drill.score > drill.prev) { drill.isBest = drill.prev != null || drill.score > 0; p.bests[s.mode] = drill.score; if (drill.isBest) addXP(s, 'drill', XP.drillBest); }
  }
  L.sessions++; L.seconds += Math.round(s.seconds); L.dribbles += s.dribbles; L.bestStreak = Math.max(L.bestStreak, s.bestStreak);
  L.makes += s.makes; L.shots += s.shots; L.travels += s.travels; L.doubles += s.doubles; L.clean += s.clean;
  if (s.mode === 'game') { L.games++; if (s.won) L.wins++; L.points += s.points || 0; L.fouls += s.fouls || 0; }
  p.xp += s.xp;
  const earned = [];
  for (const b of BADGES) if (!p.badges[b.id] && b.test(s, L)) { p.badges[b.id] = Date.now(); earned.push(b); }
  p.history.unshift({ at: s.start, mode: s.mode, seconds: Math.round(s.seconds), dribbles: s.dribbles, bestStreak: s.bestStreak, makes: s.makes, shots: s.shots, travels: s.travels, doubles: s.doubles, xp: s.xp, ...(s.mode === 'game' ? { score: s.score, won: s.won, points: s.points, fouls: s.fouls } : {}) });
  p.history.length = Math.min(p.history.length, 40);
  save();
  return { player: p, before, after: levelOf(p.xp), earned, drill };
}
