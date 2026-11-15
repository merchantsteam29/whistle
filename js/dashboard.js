// Coach dashboard: each kid's progress over their sessions, as small line charts (one measure each,
// so no dual axes), with a hover readout, the latest value labelled, and a table view.
import { levelOf, MODES } from './progress.js';

const LINE = '#e8650a'; // validated against the dark panel (lightness band + contrast)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const METRICS = [
  { id: 'dribbles', name: 'Dribbles per session', get: (h) => h.dribbles, fmt: (v) => Math.round(v) },
  { id: 'streak', name: 'Best dribble streak', get: (h) => h.bestStreak, fmt: (v) => Math.round(v) },
  { id: 'fg', name: 'Shooting %', get: (h) => (h.shots >= 2 ? (100 * h.makes) / h.shots : null), fmt: (v) => Math.round(v) + '%', max: 100 },
  { id: 'form', name: 'Shooting form (out of 10)', get: (h) => h.formAvg ?? null, fmt: (v) => v.toFixed(1), max: 10 },
  { id: 'viol', name: 'Violations per 10 min', get: (h) => (h.seconds >= 60 ? ((h.travels + h.doubles + (h.fouls || 0)) * 600) / h.seconds : null), fmt: (v) => v.toFixed(1), lowerBetter: true },
  { id: 'xp', name: 'XP per session', get: (h) => h.xp, fmt: (v) => Math.round(v) },
];

export function renderDashboard(el, players, pid, range, onChange) {
  if (!players.length) { el.innerHTML = '<div class="card empty-player"><p>No players yet. Add a player and play a few sessions.</p></div>'; return; }
  const p = players.find((x) => x.id === pid) || players[0];
  const hist = p.history.slice(0, range).reverse(); // oldest -> newest
  const week = p.history.filter((h) => Date.now() - h.at < 7 * 864e5);
  const L = levelOf(p.xp);
  el.innerHTML = `
    <div class="dash-bar">
      <select id="dashWho">${players.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}${x.num ? ' #' + esc(x.num) : ''}</option>`).join('')}</select>
      <div class="seg" id="dashRange">${[10, 20, 40].map((n) => `<button data-n="${n}" class="${n === range ? 'on' : ''}">Last ${n}</button>`).join('')}</div>
      <span style="flex:1"></span><button class="btn sm" id="dashTable">Table view</button>
    </div>
    <div class="stats" style="margin:14px 0">
      <div class="stat"><b>${week.length}</b><span>Sessions this week</span></div>
      <div class="stat"><b>${Math.round(week.reduce((a, h) => a + h.seconds, 0) / 60)}</b><span>Minutes this week</span></div>
      <div class="stat"><b>${L.n}</b><span>Level · ${esc(L.name)}</span></div>
      <div class="stat"><b>${p.stats.bestStreak}</b><span>Best streak ever</span></div>
      <div class="stat"><b>${p.stats.shots ? Math.round((100 * p.stats.makes) / p.stats.shots) + '%' : '–'}</b><span>All-time FG</span></div>
    </div>
    ${hist.length < 2 ? '<div class="card"><p style="color:var(--dim);margin:0">Play at least 2 sessions to see progress charts.</p></div>' : `<div class="charts">${METRICS.map((m) => chartHTML(m, hist)).join('')}</div>`}
    <div class="card scroll-x hidden" id="dashTbl" style="margin-top:14px;padding:6px 10px">${tableHTML(hist)}</div>`;
  el.querySelector('#dashWho').onchange = (e) => onChange(e.target.value, range);
  el.querySelectorAll('#dashRange button').forEach((b) => b.onclick = () => onChange(p.id, +b.dataset.n));
  el.querySelector('#dashTable').onclick = () => el.querySelector('#dashTbl').classList.toggle('hidden');
  el.querySelectorAll('.chart').forEach((c) => wireHover(c, hist));
}

function chartHTML(m, hist) {
  const W = 320, H = 150, padL = 34, padR = 40, padT = 14, padB = 22;
  const pts = hist.map((h, i) => ({ i, v: m.get(h), h })).filter((p) => p.v != null && isFinite(p.v));
  if (pts.length < 2) return `<div class="card chart-card"><p class="label">${m.name}</p><p style="color:var(--faint);font-size:13px;margin:30px 0">Not enough data yet${m.id === 'form' ? ' (shots needed)' : m.id === 'fg' ? ' (take 2+ shots in a session)' : ''}.</p></div>`;
  const vmax = m.max ?? niceMax(Math.max(...pts.map((p) => p.v)));
  const n = Math.max(1, hist.length - 1);
  const x = (i) => padL + ((W - padL - padR) * i) / n, y = (v) => padT + (H - padT - padB) * (1 - v / vmax);
  const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1], first = pts[0];
  const delta = last.v - first.v, better = m.lowerBetter ? delta < 0 : delta > 0;
  const trend = Math.abs(delta) < 1e-9 ? 'steady' : `${better ? '▲ better' : '▼ worse'} since the first session shown`;
  const grid = [0, 0.5, 1].map((f) => `<line x1="${padL}" x2="${W - padR}" y1="${y(vmax * f)}" y2="${y(vmax * f)}" class="gl"/><text x="${padL - 6}" y="${y(vmax * f) + 4}" class="ax" text-anchor="end">${m.fmt(vmax * f)}</text>`).join('');
  return `<div class="card chart-card"><p class="label">${m.name}</p><p class="trend ${Math.abs(delta) < 1e-9 ? '' : better ? 'up' : 'down'}">${trend}</p>
    <svg class="chart" viewBox="0 0 ${W} ${H}" data-m="${m.id}" data-pad="${padL},${padR}" role="img" aria-label="${m.name}: latest ${m.fmt(last.v)}">
      ${grid}
      <text x="${padL}" y="${H - 6}" class="ax">${day(hist[0].at)}</text><text x="${W - padR}" y="${H - 6}" class="ax" text-anchor="end">${day(hist[hist.length - 1].at)}</text>
      <path d="${path}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p) => `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${p === last ? 4.5 : 3}" fill="${LINE}" stroke="var(--panel)" stroke-width="2"/>`).join('')}
      <text x="${x(last.i) + 8}" y="${y(last.v) + 4}" class="lv">${m.fmt(last.v)}</text>
      <line class="xh" y1="${padT}" y2="${H - padB}" x1="0" x2="0" style="display:none"/>
      <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" class="hit"/>
    </svg><div class="tip hidden"></div></div>`;
}
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

function wireHover(svg, hist) {
  const m = METRICS.find((q) => q.id === svg.dataset.m), [padL, padR] = svg.dataset.pad.split(',').map(Number);
  const tip = svg.parentElement.querySelector('.tip'), xh = svg.querySelector('.xh');
  const W = 320, n = Math.max(1, hist.length - 1);
  const show = (clientX) => {
    const r = svg.getBoundingClientRect(), sx = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(hist.length - 1, Math.round(((sx - padL) / (W - padL - padR)) * n)));
    const h = hist[i], v = m.get(h), X = padL + ((W - padL - padR) * i) / n;
    xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.style.display = '';
    tip.replaceChildren();
    const b = document.createElement('b'); b.textContent = v == null ? '–' : m.fmt(v);
    const s = document.createElement('span'); s.textContent = `${day(h.at)} · ${MODES[h.mode]?.name || h.mode}`;
    tip.append(b, s); tip.classList.remove('hidden');
    tip.style.left = Math.min(r.width - 120, Math.max(0, (X / W) * r.width - 50)) + 'px';
  };
  const hide = () => { xh.style.display = 'none'; tip.classList.add('hidden'); };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.tabIndex = 0;
  svg.addEventListener('focus', () => { const r = svg.getBoundingClientRect(); show(r.right - 1); });
  svg.addEventListener('blur', hide);
}

function tableHTML(hist) {
  const rows = hist.slice().reverse();
  return `<table class="hist"><tr><th>Date</th><th>Mode</th>${METRICS.map((m) => `<th>${m.name}</th>`).join('')}</tr>
    ${rows.map((h) => `<tr><td>${day(h.at)}</td><td>${esc(MODES[h.mode]?.name || h.mode)}</td>${METRICS.map((m) => { const v = m.get(h); return `<td>${v == null ? '–' : m.fmt(v)}</td>`; }).join('')}</tr>`).join('')}</table>`;
}
