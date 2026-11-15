// Online leagues: friends in different houses share a league code. Every week has 3 "drills of the
// week"; your league points = for each, your best this week as a % of the pro score (max 150).
// Points go on the league's weekly board through the Game Library's sync.js (GameSync.postScore).
import { PRO } from './drills.js';

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
// ISO week, e.g. 2026-W46
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
export function weekStart(d = new Date()) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.getTime(); }
const POOL = ['dribble30', 'shoot10', 'weak30', 'cross30', 'legs30', 'layup60', 'slides30'];
export function weekDrills(week = isoWeek()) {
  const pool = POOL.slice(), out = []; let h = hash('league-' + week);
  while (out.length < 3) { out.push(pool.splice(h % pool.length, 1)[0]); h = Math.imul(h, 2654435761) >>> 0; }
  return out;
}
// p.history entries carry {mode, score, at}
export function leaguePoints(p, now = new Date()) {
  const from = weekStart(now), drills = weekDrills(isoWeek(now));
  const parts = drills.map((m) => {
    const best = Math.max(-1, ...p.history.filter((h) => h.mode === m && h.at >= from && h.score != null).map((h) => h.score));
    return { mode: m, best: best < 0 ? null : best, pts: best < 0 ? 0 : Math.min(150, Math.round((100 * best) / PRO[m])) };
  });
  return { week: isoWeek(now), parts, total: parts.reduce((a, q) => a + q.pts, 0) };
}
export const leagueBoard = (code, week = isoWeek()) => `league-${code}-${week}`;
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newLeagueCode = () => Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
