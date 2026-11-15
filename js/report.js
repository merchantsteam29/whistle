// Parent report + team reports: a kid's last week (or any number of days) in one page, to share as a
// link or print. The link carries the numbers itself (in the address), so nothing is stored online.
import { levelOf, BADGES, MODES } from './progress.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (a, k) => a.reduce((x, h) => x + (h[k] || 0), 0);

export function buildReport(p, days = 7, now = Date.now()) {
  const from = now - days * 864e5, hist = p.history.filter((h) => h.at >= from);
  const shots = sum(hist, 'shots'), makes = sum(hist, 'makes');
  const forms = hist.map((h) => h.formAvg).filter((v) => v != null);
  const L = levelOf(p.xp);
  return {
    v: 1, name: p.name, num: p.num || '', days, at: now,
    level: L.n, levelName: L.name, xp: p.xp, xpWeek: sum(hist, 'xp'),
    sessions: hist.length, minutes: Math.round(sum(hist, 'seconds') / 60), dribbles: sum(hist, 'dribbles'),
    bestStreak: hist.reduce((m, h) => Math.max(m, h.bestStreak || 0), 0), makes, shots,
    form: forms.length ? +(forms.reduce((a, b) => a + b, 0) / forms.length).toFixed(1) : null,
    violations: hist.reduce((a, h) => a + (h.travels || 0) + (h.doubles || 0), 0),
    games: hist.filter((h) => h.mode === 'game').length, wins: hist.filter((h) => h.mode === 'game' && h.won).length,
    badges: Object.entries(p.badges || {}).filter(([, t]) => t >= from).map(([id]) => BADGES.find((b) => b.id === id)?.name).filter(Boolean),
    bests: p.bests || {}, daily: p.daily?.streak || 0,
    modes: [...new Set(hist.map((h) => MODES[h.mode]?.name || h.mode))],
  };
}

// URL-safe base64 of the JSON (UTF-8 safe)
export function encodeReport(r) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(r)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function decodeReport(s) {
  try { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))); } catch { return null; }
}

export function reportHTML(r, extra = '') {
  const fg = r.shots ? Math.round((100 * r.makes) / r.shots) + '%' : '–';
  const best = Object.entries(r.bests || {}).map(([m, v]) => `<li>${esc(MODES[m]?.name || m)}: <b>${esc(v)}</b></li>`).join('');
  const wins = [];
  if (r.sessions >= 5) wins.push(`Practised ${r.sessions} times this ${r.days === 7 ? 'week' : `${r.days} days`}. Great habit!`);
  if (r.bestStreak >= 25) wins.push(`Dribbled ${r.bestStreak} times in a row.`);
  if (r.shots >= 10 && r.makes / r.shots >= 0.45) wins.push(`Shot ${fg} from the floor.`);
  if (r.form >= 7) wins.push(`Shooting form averaged ${r.form}/10.`);
  if (r.daily >= 3) wins.push(`${r.daily}-day challenge streak.`);
  if (r.badges.length) wins.push(`Earned ${r.badges.length} new badge${r.badges.length > 1 ? 's' : ''}: ${r.badges.map(esc).join(', ')}.`);
  if (!wins.length) wins.push(r.sessions ? 'Getting reps in. Keep it going!' : 'No practice logged in this period yet.');
  const next = r.violations > r.sessions ? 'Footwork: freeze one foot (the pivot) when holding the ball.'
    : r.form != null && r.form < 6 ? 'Shooting form: bend the knees and hold the follow-through.'
    : r.shots < 10 ? 'Take more shots. Try the Ten Shots drill.' : 'Try a harder drill: Weak Hand 30 or Between the Legs.';
  return `<div class="report">
    <div class="rp-head"><div class="jersey" style="background:var(--orange)">${esc(r.num || r.name[0] || '?')}</div><div><h2>${esc(r.name)}</h2><p>Level ${r.level} · ${esc(r.levelName)} · ${Number(r.xp).toLocaleString()} XP (+${r.xpWeek} in ${r.days} days)</p><p class="rp-date">${new Date(r.at - r.days * 864e5).toLocaleDateString()} – ${new Date(r.at).toLocaleDateString()}</p></div></div>
    <div class="stats">
      <div class="stat"><b>${r.sessions}</b><span>Sessions</span></div>
      <div class="stat"><b>${r.minutes}</b><span>Minutes</span></div>
      <div class="stat"><b>${Number(r.dribbles).toLocaleString()}</b><span>Dribbles</span></div>
      <div class="stat"><b>${r.bestStreak}</b><span>Best streak</span></div>
      <div class="stat"><b>${r.makes}/${r.shots}</b><span>FG · ${fg}</span></div>
      <div class="stat"><b>${r.form ?? '–'}</b><span>Form /10</span></div>
      ${r.games ? `<div class="stat"><b>${r.wins}-${r.games - r.wins}</b><span>Games</span></div>` : ''}
      <div class="stat"><b>${r.daily}</b><span>Day streak</span></div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="card"><p class="label">Highlights</p><ul class="tips" style="margin:0;padding-left:18px">${wins.map((w) => `<li>${w}</li>`).join('')}</ul></div>
      <div class="card"><p class="label">Next goal</p><p style="margin:0">${esc(next)}</p>${best ? `<p class="label" style="margin-top:12px">Personal bests</p><ul style="margin:0;padding-left:18px">${best}</ul>` : ''}</div>
    </div>${extra}</div>`;
}
