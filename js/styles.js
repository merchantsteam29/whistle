// Unlockable ref styles: scoreboard themes, whistle sounds and celebrations. Each unlocks at a
// level, so it is earned by playing (no shop, no coins). The choice is saved per player.
export const THEMES = [
  { id: 'classic', name: 'Classic', lvl: 1, vars: {} },
  { id: 'street', name: 'Street', lvl: 3, vars: { '--bg': '#121212', '--panel': '#1c1c1c', '--panel2': '#242424', '--line': '#3a3a3a', '--orange': '#ffd23f', '--orange2': '#ffe170' } },
  { id: 'neon', name: 'Neon', lvl: 5, vars: { '--bg': '#0b0618', '--panel': '#150d2b', '--panel2': '#1d1339', '--line': '#3a2a6a', '--orange': '#2ee6d6', '--orange2': '#7ff3ea', '--gold': '#ff4fd8' } },
  { id: 'gold', name: 'Gold Court', lvl: 8, vars: { '--bg': '#0f0c05', '--panel': '#1c170b', '--panel2': '#252011', '--line': '#4a3d17', '--orange': '#f2c14e', '--orange2': '#f7d68a' } },
  { id: 'hof', name: 'Hall of Fame', lvl: 10, vars: { '--bg': '#0a0a0f', '--panel': '#16161f', '--panel2': '#1f1f2b', '--line': '#3b3b52', '--orange': '#e8e8f5', '--orange2': '#ffffff', '--gold': '#c9a227' } },
];
export const WHISTLES = [
  { id: 'pea', name: 'Pea whistle', lvl: 1 },
  { id: 'fox', name: 'Pealess whistle', lvl: 2 },
  { id: 'horn', name: 'Air horn', lvl: 4 },
  { id: 'buzzer', name: 'Arena buzzer', lvl: 6 },
];
export const CELEBRATIONS = [
  { id: 'none', name: 'None', lvl: 1 },
  { id: 'confetti', name: 'Confetti', lvl: 2 },
  { id: 'fire', name: 'Flames', lvl: 5 },
  { id: 'fireworks', name: 'Fireworks', lvl: 7 },
];
export const DEFAULT_STYLE = { theme: 'classic', whistle: 'pea', celebrate: 'confetti' };
const BASE = {};
export function applyTheme(id) {
  const root = document.documentElement, t = THEMES.find((x) => x.id === id) || THEMES[0];
  for (const k of Object.keys(BASE)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(t.vars)) { BASE[k] = 1; root.style.setProperty(k, v); }
}
// an unlocked choice, or the best fallback
export const allowed = (list, id, level) => { const it = list.find((x) => x.id === id); return it && it.lvl <= level ? it.id : list[0].id; };

// ---------- celebrations: a particle layer over the video ----------
let cv = null, g = null, parts = [], raf = 0;
function layer() {
  if (cv) return;
  cv = document.createElement('canvas'); cv.id = 'fx';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:7';
  document.body.appendChild(cv); g = cv.getContext('2d');
}
const COLS = ['#ff7a1a', '#ffc53d', '#22c983', '#3d9bff', '#ff4655', '#eef3fb'];
export function celebrate(kind, power = 1) {
  if (!kind || kind === 'none') return;
  layer(); cv.width = innerWidth; cv.height = innerHeight;
  const W = cv.width, H = cv.height, n = Math.round(70 * power);
  for (let i = 0; i < n; i++) {
    if (kind === 'confetti') parts.push({ k: 0, x: Math.random() * W, y: -20 - Math.random() * H * 0.3, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: COLS[i % COLS.length], life: 1 });
    else if (kind === 'fire') parts.push({ k: 1, x: W * (0.1 + Math.random() * 0.8), y: H + 10, vx: (Math.random() - 0.5) * 1.5, vy: -(4 + Math.random() * 6), s: 8 + Math.random() * 16, life: 1 });
  }
  if (kind === 'fireworks') for (let b = 0; b < 3 + power; b++) {
    const cx = W * (0.2 + Math.random() * 0.6), cy = H * (0.15 + Math.random() * 0.35), c = COLS[b % COLS.length];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, sp = 3 + Math.random() * 3; parts.push({ k: 2, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c, life: 1, d: b * 12 }); }
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  g.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    if (p.d > 0) { p.d--; continue; }
    p.x += p.vx; p.y += p.vy;
    if (p.k === 0) { p.vy += 0.03; p.r += p.vr; p.life -= 0.006; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.life * 2); g.fillRect(-5, -3, 10, 6); g.restore(); }
    else if (p.k === 1) { p.life -= 0.02; p.s *= 0.98; g.globalAlpha = p.life; const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.4, '#ff9a1a'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); }
    else { p.vy += 0.06; p.vx *= 0.985; p.life -= 0.015; g.globalAlpha = p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 2.5, 0, 7); g.fill(); }
    if (p.y > cv.height + 40) p.life = 0;
  }
  g.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(tick) : (g.clearRect(0, 0, cv.width, cv.height), 0);
}
