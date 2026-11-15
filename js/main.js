// WHISTLE: screens, camera loop, HUD, calls and XP.
import { Ref } from './ref.js';
import { BallTracker, DEFAULT_COLOR } from './ball.js';
import { createPose, BONES } from './pose.js';
import { sound, unlock, whistle, say, beep, swish } from './audio.js';
import * as P from './progress.js';

const $ = (s) => document.querySelector(s);
const TEST = /[?&]test\b/.test(location.search);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cfg = P.settings();

// ---------- icons ----------
const IC = {
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 2.6 3 10.2 0 12.8M18.4 5.6c-3 2.6-3 10.2 0 12.8"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
  flame2: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/><path d="M12 18a2.5 2.5 0 0 0 2.5-2.5c0-2-2.5-3-2.5-5-1.5 1-2.5 3-2.5 5A2.5 2.5 0 0 0 12 18z"/>',
  bounce: '<circle cx="12" cy="6" r="3"/><path d="M4 21h16M12 10v6"/>',
  bounce2: '<circle cx="8" cy="6" r="3"/><circle cx="16" cy="14" r="3"/><path d="M3 21h18"/>',
  metro: '<path d="M8 21 11 3h2l3 18zM12 15l5-9"/>',
  k: '<path d="M4 4v16M14 4l-8 8 8 8M14 12h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  hundred: '<path d="M4 7l2-1v12M10 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM17 6h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V8"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  feet: '<path d="M7 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 15h3v3a1.5 1.5 0 0 1-3 0zM17 6c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 18h3v1.5a1.5 1.5 0 0 1-3 0z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  free: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/>',
  dribble30: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  shoot10: '<path d="M4 7h16M6 7l2 10h8l2-10M9 7l1 10M15 7l-1 10"/>',
};
const svg = (k, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ''}</svg>`;

// ---------- navigation ----------
function go(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  if (id === 'sHome') renderHome();
  if (id === 'sProfile') renderProfile();
  if (id === 'sSettings') renderSettings();
  if (id !== 'sSession') stopCamera();
}
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

// ---------- home ----------
let mode = 'free';
function jersey(p, size = '') {
  return `<div class="jersey ${size}" style="background:${p.color}">${esc(p.num || p.name[0]?.toUpperCase() || '?')}</div>`;
}
function renderHome() {
  const p = P.current();
  const card = $('#playerCard');
  if (!p) {
    card.innerHTML = `<div class="empty-player"><p>Add a player to start earning XP.</p><button class="btn primary" id="pcAdd">+ Add player</button></div>`;
    $('#pcAdd').onclick = openPlayers;
  } else {
    const L = P.levelOf(p.xp);
    card.innerHTML = `<div class="pc">${jersey(p)}<div class="who"><div class="name">${esc(p.name)}</div>
      <div class="lvl">Level ${L.n} · ${L.name}</div><div class="bar"><i style="width:${(L.pct * 100).toFixed(1)}%"></i></div>
      <div class="xpline"><span>${p.xp.toLocaleString()} XP</span><span>${L.next ? `${L.toNext.toLocaleString()} to ${P.LEVELS[L.n][1]}` : 'Max level'}</span></div></div></div>
      <div class="pc-actions"><button class="btn sm" id="pcSwitch">Switch player</button><span style="flex:1"></span><span style="color:var(--dim);font-size:13px;align-self:center">${Object.keys(p.badges).length}/${P.BADGES.length} badges</span></div>`;
    $('#pcSwitch').onclick = openPlayers;
  }
  $('#modes').innerHTML = Object.entries(P.MODES).map(([id, m]) => {
    const pb = p?.bests?.[id];
    return `<button class="mode ${id === mode ? 'sel' : ''}" data-mode="${id}"><div class="ic">${svg(id)}</div><div><b>${m.name}</b><span>${m.desc}</span></div>${pb != null ? `<div class="pb">BEST<em>${pb}</em></div>` : ''}</button>`;
  }).join('');
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; renderHome(); });
}
$('#btnStart').onclick = () => { unlock(); if (!P.current()) { openPlayers(); return; } enterSession(); };

// ---------- players modal ----------
function openPlayers() { renderPlayers(); $('#mPlayers').classList.add('on'); setTimeout(() => $('#npName').focus(), 50); }
function renderPlayers() {
  const cur = P.current();
  $('#plist').innerHTML = P.players().map((p) => {
    const L = P.levelOf(p.xp);
    return `<button class="pitem ${cur && p.id === cur.id ? 'sel' : ''}" data-pid="${p.id}">${jersey(p)}<div><b>${esc(p.name)}</b><span>Level ${L.n} · ${L.name} · ${p.xp.toLocaleString()} XP</span></div></button>`;
  }).join('') || '<p style="color:var(--dim);margin:0">No players yet.</p>';
  document.querySelectorAll('[data-pid]').forEach((b) => b.onclick = () => { P.select(b.dataset.pid); renderPlayers(); renderHome(); });
}
$('#mPlayersClose').onclick = () => { $('#mPlayers').classList.remove('on'); renderHome(); };
$('#mPlayers').addEventListener('click', (e) => { if (e.target.id === 'mPlayers') $('#mPlayersClose').click(); });
$('#newPlayer').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#npName').value.trim(); if (!name) return;
  P.addPlayer(name, $('#npNum').value); $('#npName').value = ''; $('#npNum').value = '';
  renderPlayers(); renderHome();
};

// ---------- settings ----------
function renderSettings() {
  $('#setSteps').value = String(cfg.stepsAllowed);
  $('#setWhistle').checked = cfg.whistle; $('#setVoice').checked = cfg.voice; $('#setVolume').value = cfg.volume;
  $('#setQuality').value = cfg.quality; $('#setSens').value = cfg.sensitivity; $('#setSkeleton').checked = cfg.skeleton; $('#setMirror').checked = cfg.mirror;
  $('#setBallTxt').innerHTML = cfg.ballColor ? `<span class="swatch" style="background:${hsvCss(cfg.ballColor)}"></span>Learned from your ball` : 'Standard orange';
}
function bindSetting(sel, key, read) {
  $(sel).addEventListener('input', () => { cfg[key] = read($(sel)); applySettings(); P.save(); });
}
bindSetting('#setSteps', 'stepsAllowed', (el) => Number(el.value));
bindSetting('#setWhistle', 'whistle', (el) => el.checked);
bindSetting('#setVoice', 'voice', (el) => el.checked);
bindSetting('#setVolume', 'volume', (el) => Number(el.value));
bindSetting('#setQuality', 'quality', (el) => el.value);
bindSetting('#setSens', 'sensitivity', (el) => Number(el.value));
bindSetting('#setSkeleton', 'skeleton', (el) => el.checked);
bindSetting('#setMirror', 'mirror', (el) => el.checked);
$('#setBallReset').onclick = () => { cfg.ballColor = null; applySettings(); P.save(); renderSettings(); };
$('#setVolume').addEventListener('change', () => beep(880, 0.1));
function applySettings() {
  sound.whistle = cfg.whistle; sound.voice = cfg.voice; sound.volume = cfg.volume;
  ref.setOptions({ stepsAllowed: cfg.stepsAllowed });
  tracker.tol = cfg.sensitivity; tracker.setColor(cfg.ballColor || DEFAULT_COLOR);
}
function hsvCss(c) { return `hsl(${c.h.toFixed(0)} ${(c.s * 100).toFixed(0)}% ${(c.v * 50).toFixed(0)}%)`; }

// ---------- session: camera + tracking ----------
const video = $('#video'), canvas = $('#overlay'), g = canvas.getContext('2d'), stage = $('#stage');
const ref = new Ref({ stepsAllowed: cfg.stepsAllowed });
const tracker = new BallTracker();
applySettings();

let stream = null, pose = null, running = false, phase = 'off'; // off | setup | count | live | paused | done
let session = null, lastPose = null, lastBall = null, lastFrameT = -1, tapMode = 'ball', hoopPts = [];
let bodyOkSince = 0, lastCall = null, lastShot = null, waveTimer = 0, askTimer = 0, endTimer = 0;

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser cannot use the camera.'), { name: 'NoCamera' });
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: cfg.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise((r) => { if (video.videoWidth) r(); else video.addEventListener('loadedmetadata', r, { once: true }); });
  const tr = stream.getVideoTracks()[0];
  const facing = tr?.getSettings?.().facingMode;
  stage.classList.toggle('mirror', cfg.mirror && facing !== 'environment' && cfg.facing !== 'environment');
  layout();
}
function stopCamera() {
  running = false;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  video.srcObject = null;
}

function layout() {
  const W = innerWidth, H = innerHeight, vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const sc = Math.min(W / vw, H / vh), w = Math.round(vw * sc), h = Math.round(vh * sc);
  Object.assign(stage.style, { width: w + 'px', height: h + 'px', left: ((W - w) >> 1) + 'px', top: ((H - h) >> 1) + 'px' });
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
}
addEventListener('resize', layout);

async function enterSession() {
  go('sSession');
  phase = 'setup'; tapMode = 'ball'; hoopPts = []; session = null; lastCall = null; lastShot = null;
  ref.reset();
  ['#scoreboard', '#poss', '#cPause', '#cWave', '#cFix', '#cAddShot', '#cEnd', '#ask', '#count'].forEach((s) => $(s).classList.add('hidden'));
  $('#setup').classList.remove('hidden'); $('#cBack').classList.remove('hidden'); $('#cFlip').classList.remove('hidden');
  updateSetup();
  showLoading('WARMING UP', 'Starting the camera…');
  try {
    await startCamera();
  } catch (e) {
    const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    showLoading('NO CAMERA', denied ? 'Camera access was blocked. Allow the camera for this site in the address bar, then try again.' : (e.name === 'NotFoundError' ? 'No camera was found on this device.' : e.message || 'The camera could not start.'), true);
    return;
  }
  showLoading('WARMING UP', 'Loading body tracking (first time takes a few seconds)…');
  try {
    pose = await createPose(cfg.quality);
  } catch (e) {
    console.warn(e);
    showLoading('TRACKING UNAVAILABLE', 'Body tracking could not load. You need internet the first time. Check your connection and try again.', true);
    return;
  }
  hideLoading();
  startLoop();
}
function showLoading(title, txt, err = false) {
  $('#loading').classList.remove('hidden'); $('#loadTitle').textContent = title; $('#loadTxt').textContent = txt;
  $('#loading .spin').style.display = err ? 'none' : '';
  if (err) $('#loadTxt').insertAdjacentHTML('afterend', `<div style="margin-top:16px" class="row" id="loadBtns"><button class="btn" data-go="sHome">Back</button><button class="btn primary" id="loadRetry">Try again</button></div>`);
  const r = $('#loadRetry'); if (r) r.onclick = () => { $('#loadBtns')?.remove(); enterSession(); };
}
function hideLoading() { $('#loading').classList.add('hidden'); $('#loadBtns')?.remove(); }

// ---------- frame loop ----------
let lastT = 0, loopGen = 0;
function startLoop() {
  const id = ++loopGen; running = true; lastT = performance.now();
  const tick = (now) => { if (!running || id !== loopGen) return; requestAnimationFrame(tick); frame(now); };
  requestAnimationFrame(tick);
}
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (phase === 'live' && session) session.seconds += dt;
  if (!pose || video.readyState < 2 || video.currentTime === lastFrameT) { drawOverlay(); return; }
  lastFrameT = video.currentTime;
  const t = now / 1000;
  try { lastPose = pose.detect(video, now); } catch (e) { lastPose = null; }
  tracker.grab(video);
  lastBall = tracker.detect(t, faceExclusion(lastPose));
  const aspect = video.videoWidth / video.videoHeight;
  if (phase === 'live') {
    const evs = ref.update({ t, aspect, pose: lastPose, ball: lastBall, hoop: cfg.hoop });
    for (const e of evs) onEvent(e);
    const m = P.MODES[session.mode];
    if (m.secs && session.seconds >= m.secs && !endTimer) { session.seconds = m.secs; session.complete = true; whistle(0.7, 2); say('Time!'); endTimer = setTimeout(endSession, 900); phase = 'done'; }
    updateHUD();
  } else if (phase === 'setup' || phase === 'count') {
    ref.update({ t, aspect, pose: lastPose, ball: lastBall, hoop: cfg.hoop }); // keeps feet / body scale warm, events ignored
    updateSetup();
  }
  drawOverlay();
}

function faceExclusion(lm) {
  if (!lm || !lm[0] || (lm[0].visibility ?? 1) < 0.5) return [];
  const torso = lm[11] && lm[23] ? Math.abs(lm[23].y - lm[11].y) : 0.2;
  return [{ x: lm[0].x, y: lm[0].y, r: Math.max(0.03, torso * 0.42) }];
}

// ---------- overlay drawing ----------
function drawOverlay() {
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const dpr = W / (stage.clientWidth || 1);
  const hoop = cfg.hoop;
  if (hoop || hoopPts.length) {
    g.lineWidth = 4 * dpr; g.strokeStyle = '#ff7a1a'; g.fillStyle = '#ff7a1a';
    const pts = hoop && tapMode !== 'hoop' ? [{ x: hoop.x1, y: hoop.y1 }, { x: hoop.x2, y: hoop.y2 }] : hoopPts;
    if (pts.length === 2) {
      g.beginPath(); g.moveTo(pts[0].x * W, pts[0].y * H); g.lineTo(pts[1].x * W, pts[1].y * H); g.stroke();
      // net hint
      g.lineWidth = 1.5 * dpr; g.strokeStyle = 'rgba(255,255,255,.35)';
      const w = (pts[1].x - pts[0].x) * W;
      g.beginPath(); g.moveTo(pts[0].x * W, pts[0].y * H); g.lineTo(pts[0].x * W + w * 0.2, pts[0].y * H + Math.abs(w) * 0.7);
      g.lineTo(pts[1].x * W - w * 0.2, pts[1].y * H + Math.abs(w) * 0.7); g.lineTo(pts[1].x * W, pts[1].y * H); g.stroke();
    }
    for (const p of pts) { g.beginPath(); g.arc(p.x * W, p.y * H, 6 * dpr, 0, Math.PI * 2); g.fill(); }
  }
  const lm = lastPose;
  if (lm && cfg.skeleton) {
    g.lineCap = 'round';
    g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(238,243,251,.75)';
    g.beginPath();
    for (const [a, b] of BONES) {
      const A = lm[a], B = lm[b];
      if (!A || !B || (A.visibility ?? 1) < 0.4 || (B.visibility ?? 1) < 0.4) continue;
      g.moveTo(A.x * W, A.y * H); g.lineTo(B.x * W, B.y * H);
    }
    g.stroke();
    // feet: gold while moving
    const st = ref.state();
    [27, 28].forEach((i, k) => {
      const A = lm[i]; if (!A || (A.visibility ?? 1) < 0.4) return;
      g.fillStyle = st.feetMoving[k] ? '#ffc53d' : (st.held && st.pivot === k ? '#3d9bff' : 'rgba(238,243,251,.9)');
      g.beginPath(); g.arc(A.x * W, A.y * H, (st.held && st.pivot === k ? 9 : 6) * dpr, 0, Math.PI * 2); g.fill();
    });
    [15, 16].forEach((i) => {
      const A = lm[i]; if (!A || (A.visibility ?? 1) < 0.4) return;
      g.fillStyle = 'rgba(238,243,251,.9)'; g.beginPath(); g.arc(A.x * W, A.y * H, 5 * dpr, 0, Math.PI * 2); g.fill();
    });
  }
  if (lastBall && (cfg.skeleton || phase === 'setup')) {
    const st = ref.state();
    g.lineWidth = 3 * dpr; g.strokeStyle = st.held ? '#ffc53d' : st.dribbling ? '#22c983' : '#ff7a1a';
    g.beginPath(); g.arc(lastBall.x * W, lastBall.y * H, Math.max(6 * dpr, lastBall.r * H * 1.15), 0, Math.PI * 2); g.stroke();
  }
}

// ---------- setup ----------
function updateSetup() {
  const lm = lastPose, now = performance.now();
  const full = lm && [0, 27, 28].every((i) => lm[i] && (lm[i].visibility ?? 1) > 0.5) && lm[0].y > 0.01 && Math.max(lm[27].y, lm[28].y) < 0.99;
  if (full) { if (!bodyOkSince) bodyOkSince = now; } else bodyOkSince = 0;
  const bodyOk = bodyOkSince && now - bodyOkSince > 400;
  setChk('#chkBody', bodyOk, !bodyOk, bodyOk ? 'Got you. Head to feet in view.' : (lm ? 'Almost. Step back until your feet are in the picture.' : 'Stand 3 to 5 m from the camera, head to feet in the picture.'));
  const ballSet = !!cfg.ballColor || ballDefaultChosen;
  const seen = lastBall ? ' · <b style="color:var(--green);display:inline">ball seen</b>' : ' · <span style="color:var(--faint)">ball not seen</span>';
  setChk('#chkBall', ballSet, tapMode === 'ball' && !ballSet, ballSet ? `<span class="swatch" style="background:${hsvCss(tracker.color)}"></span>${cfg.ballColor ? 'Colour learned. Tap again to redo.' : 'Standard orange.'}${seen}` : 'Hold the ball up and tap it on screen so WHISTLE learns its colour.' + seen);
  const hoopTxt = tapMode === 'hoop' ? (hoopPts.length ? 'Now tap the RIGHT edge of the rim.' : 'Tap the LEFT edge of the rim.') : cfg.hoop ? 'Hoop marked. Shots get scored automatically.' : 'For auto-scored shots: tap the left edge of the rim, then the right. Skip it and you mark shots yourself.';
  setChk('#chkHoop', !!cfg.hoop && tapMode !== 'hoop', tapMode === 'hoop', hoopTxt);
  $('#hoopMark').textContent = cfg.hoop ? 'Redo hoop' : 'Mark hoop';
  $('#hoopClear').classList.toggle('hidden', !cfg.hoop);
}
let ballDefaultChosen = false;
function setChk(sel, ok, act, html) {
  const el = $(sel); el.classList.toggle('ok', !!ok); el.classList.toggle('act', !!act && !ok);
  const span = el.querySelector('span[id]'); if (span.dataset.h !== html) { span.innerHTML = html; span.dataset.h = html; }
  el.querySelector('.dot').textContent = ok ? '✓' : el.dataset.n || (el.dataset.n = el.querySelector('.dot').textContent);
}
$('#ballDefault').onclick = () => { cfg.ballColor = null; ballDefaultChosen = true; applySettings(); P.save(); updateSetup(); };
$('#hoopMark').onclick = () => { tapMode = 'hoop'; hoopPts = []; updateSetup(); };
$('#hoopClear').onclick = () => { cfg.hoop = null; tapMode = 'ball'; hoopPts = []; P.save(); updateSetup(); };

stage.addEventListener('pointerdown', (e) => {
  if (phase !== 'setup' && !(phase === 'paused' && tapMode === 'hoop')) return;
  const r = stage.getBoundingClientRect();
  let nx = (e.clientX - r.left) / r.width; const ny = (e.clientY - r.top) / r.height;
  if (stage.classList.contains('mirror')) nx = 1 - nx;
  if (tapMode === 'hoop') {
    hoopPts.push({ x: nx, y: ny });
    if (hoopPts.length === 2) {
      const [a, b] = hoopPts[0].x <= hoopPts[1].x ? hoopPts : [hoopPts[1], hoopPts[0]];
      cfg.hoop = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; P.save(); tapMode = 'ball'; hoopPts = []; beep(1200, 0.08);
    }
  } else {
    const c = tracker.sample(nx, ny);
    if (!c) return;
    if (c.s < 0.25 || c.v < 0.15) { toast('That spot is too grey or dark to be the ball. Tap the ball itself.'); return; }
    cfg.ballColor = c; applySettings(); P.save(); beep(1200, 0.08);
    toast('Ball colour learned', true);
  }
  updateSetup();
});

$('#btnGo').onclick = () => {
  unlock();
  if (!cfg.ballColor) ballDefaultChosen = true;
  tapMode = 'ball'; hoopPts = [];
  $('#setup').classList.add('hidden'); $('#cFlip').classList.add('hidden');
  phase = 'count';
  let n = 3; const c = $('#count'); c.classList.remove('hidden'); c.textContent = n; beep(660, 0.15);
  const iv = setInterval(() => {
    n--;
    if (n > 0) { c.textContent = n; beep(660, 0.15); return; }
    clearInterval(iv); c.textContent = 'GO'; whistle(0.45); setTimeout(() => c.classList.add('hidden'), 600);
    startLive();
  }, 800);
};

function startLive() {
  session = P.newSession(mode); ref.reset(); applySettings();
  lastCall = null; lastShot = null; endTimer = 0;
  phase = 'live';
  ['#scoreboard', '#poss', '#cPause', '#cEnd'].forEach((s) => $(s).classList.remove('hidden'));
  $('#cBack').classList.add('hidden');
  $('#cAddShot').classList.toggle('hidden', !!cfg.hoop && session.mode !== 'shoot10');
  $('#cPauseT').textContent = 'Pause';
  $('#sbClockLbl').textContent = P.MODES[mode].secs ? 'Left' : P.MODES[mode].shots ? 'Shots' : 'Time';
  $('#sbClockWrap').classList.toggle('clock', !!P.MODES[mode].secs);
  updateHUD();
}

$('#cBack').onclick = () => go('sHome');
$('#cFlip').onclick = async () => {
  const prev = cfg.facing; cfg.facing = cfg.facing === 'user' ? 'environment' : 'user';
  try { await startCamera(); P.save(); startLoop(); } catch { cfg.facing = prev; toast("No other camera on this device"); try { await startCamera(); startLoop(); } catch {} }
};
$('#cPause').onclick = () => {
  if (phase === 'live') { phase = 'paused'; $('#cPauseT').textContent = 'Resume'; $('#pillTxt').textContent = 'PAUSED'; }
  else if (phase === 'paused') { phase = 'live'; ref.reset(); $('#cPauseT').textContent = 'Pause'; }
};
$('#cEnd').onclick = () => { if (session) endSession(); };
$('#cWave').onclick = () => {
  if (!lastCall || !session) return;
  if (lastCall.kind === 'travel') session.travels = Math.max(0, session.travels - 1); else session.doubles = Math.max(0, session.doubles - 1);
  ref.dead = 0; ref.deadPending = false; lastCall = null; hideCall(); $('#cWave').classList.add('hidden');
  toast('Call waved off', true); updateHUD();
};
$('#cFix').onclick = () => {
  if (!lastShot || !session) return;
  if (lastShot.made) { session.makes--; session.makeRun = 0; P.addXP(session, 'shots', -lastShot.xp); lastShot.made = false; lastShot.xp = 0; toast('Changed to a miss'); }
  else made(true);
  updateFix(); updateHUD();
};
$('#cAddShot').onclick = () => { if (phase !== 'live') return; onEvent({ type: 'shot', manual: true }); askShot(); };
$('#askYes').onclick = () => { closeAsk(); made(false); };
$('#askNo').onclick = () => { closeAsk(); missed(); };
function askShot() { $('#ask').classList.remove('hidden'); clearTimeout(askTimer); askTimer = setTimeout(() => { closeAsk(); missed(); }, 7000); }
function closeAsk() { clearTimeout(askTimer); $('#ask').classList.add('hidden'); }

// ---------- events -> stats, XP, calls ----------
function onEvent(e) {
  const s = session; if (!s) return;
  switch (e.type) {
    case 'dribble': {
      s.dribbles++; s.bestStreak = Math.max(s.bestStreak, e.streak);
      P.addXP(s, 'dribbles', P.XP.dribble);
      const bonus = P.XP.streak[e.streak];
      if (bonus) { P.addXP(s, 'streaks', bonus); showCall('info', `${e.streak} IN A ROW`, `+${bonus} XP streak bonus`, 1100); say(`${e.streak}!`); }
      break;
    }
    case 'streakEnd': if (e.streak >= 10 && e.reason !== 'violation') toast(`${e.streak}-dribble streak`); break;
    case 'clean': s.clean++; P.addXP(s, 'footwork', P.XP.clean); break;
    case 'shot':
      s.shots++; P.addXP(s, 'shots', P.XP.attempt);
      lastShot = { made: false, xp: 0, pending: true }; updateFix();
      break;
    case 'shotResult':
      if (e.made === true) made(false);
      else if (e.made === false) missed();
      else askShot();
      break;
    case 'violation': {
      if (e.kind === 'travel') s.travels++; else s.doubles++;
      s.makeRun = 0; lastCall = e;
      whistle(0.6);
      showCall('bad', e.title, `${e.why}<em>${e.signal} · ${e.tip}</em>`, 2600);
      say(e.kind === 'travel' ? 'Traveling!' : 'Double dribble!', 350);
      $('#cWave').classList.remove('hidden'); clearTimeout(waveTimer); waveTimer = setTimeout(() => $('#cWave').classList.add('hidden'), 9000);
      break;
    }
  }
}
function made(fixing) {
  const s = session; if (!s) return;
  if (!lastShot) lastShot = { made: false, xp: 0 };
  s.makes++; s.makeRun++; s.bestMakeRun = Math.max(s.bestMakeRun, s.makeRun);
  const bonus = s.makeRun >= 2 ? P.XP.makeStreak * (s.makeRun - 1) : 0;
  const xp = P.XP.make + Math.min(bonus, 30);
  P.addXP(s, 'shots', xp); lastShot.made = true; lastShot.pending = false; lastShot.xp = xp;
  swish(); showCall('good', s.makeRun >= 3 ? 'ON FIRE' : 'BUCKET', `+${xp} XP${s.makeRun >= 2 ? ` · ${s.makeRun} in a row` : ''}`, 1500);
  if (!fixing) say(s.makeRun >= 3 ? `${s.makeRun} straight!` : 'Bucket!');
  updateFix(); checkShotDrill();
}
function missed() {
  const s = session; if (!s) return;
  s.makeRun = 0; if (lastShot) { lastShot.pending = false; lastShot.made = false; }
  toast('Miss. Shake it off'); updateFix(); checkShotDrill();
}
function checkShotDrill() {
  const s = session;
  if (s.mode === 'shoot10' && s.shots >= 10 && !endTimer) { s.complete = true; phase = 'done'; endTimer = setTimeout(() => { whistle(0.6, 2); endSession(); }, 1600); }
}
function updateFix() {
  $('#cFix').classList.toggle('hidden', !lastShot || lastShot.pending);
  $('#cFixT').textContent = lastShot?.made ? 'Was a miss' : 'Was a make';
}

let callTimer = 0;
function showCall(kind, title, sub, ms) {
  const c = $('#call'); c.className = 'call show ' + (kind === 'good' ? 'good' : kind === 'info' ? 'info' : '');
  $('#callTag').textContent = title; $('#callSub').innerHTML = sub; $('#callSub').style.display = sub ? '' : 'none';
  clearTimeout(callTimer); callTimer = setTimeout(hideCall, ms);
}
function hideCall() { $('#call').classList.remove('show'); }
function toast(msg, good) {
  const d = document.createElement('div'); d.textContent = msg; if (good) d.className = 'g';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 2300);
}

// ---------- HUD ----------
const hudCache = {};
function setText(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).textContent = v; } }
function updateHUD() {
  const s = session; if (!s) return;
  const m = P.MODES[s.mode];
  setText('#sbClock', m.secs ? String(Math.max(0, Math.ceil(m.secs - s.seconds))) : m.shots ? `${s.shots}/${m.shots}` : fmtTime(s.seconds));
  setText('#sbDribbles', String(s.dribbles));
  setText('#sbStreak', String(ref.streak));
  setText('#sbFG', `${s.makes}/${s.shots}`);
  setText('#sbXP', String(s.xp));
  if (phase === 'paused') return;
  const st = ref.state(), pill = $('#pill');
  let cls = '', txt;
  if (!st.body) txt = 'Step into view';
  else if (st.dead) { cls = 'dead'; txt = 'Dead ball'; }
  else if (st.shot) { cls = 'air'; txt = 'Shot up'; }
  else if (st.held) { cls = 'hold'; txt = st.mode === 'moving' ? 'Holding · on the move' : st.pivot != null ? `Pivot: ${st.pivot ? 'right' : 'left'} foot` : 'Holding · set'; if (st.pickedUp) txt += ' · dribble used'; }
  else if (st.dribbling) { cls = 'live'; txt = 'Dribbling'; }
  else txt = st.ball ? 'Ready' : 'Find the ball';
  if (hudCache.pillCls !== cls) { hudCache.pillCls = cls; pill.className = 'pill ' + cls; }
  setText('#pillTxt', txt);
  const showSteps = st.held && !st.dead;
  $('#stepsPill').classList.toggle('hidden', !showSteps);
  if (showSteps) {
    setText('#stepsTxt', st.mode === 'moving' ? `Steps ${st.steps}/${st.allowed}` : 'Steps');
    const key = `${st.mode}|${st.steps}|${st.allowed}`;
    if (hudCache.feet !== key) {
      hudCache.feet = key;
      const n = st.mode === 'moving' ? st.allowed : 0;
      $('#feet').innerHTML = Array.from({ length: n }, (_, i) => `<u class="${i < st.steps ? 'on' : ''}"></u>`).join('');
    }
  }
  setText('#trackPill', `${st.body ? 'Body ✓' : 'Body –'}   ${st.ball ? 'Ball ✓' : 'Ball –'}${cfg.hoop ? '   Hoop ✓' : ''}`);
}

// ---------- end + summary ----------
function endSession() {
  clearTimeout(endTimer); endTimer = 0; closeAsk(); hideCall();
  const s = session; if (!s) return;
  session = null; phase = 'off';
  const res = P.finish(s);
  stopCamera();
  renderSummary(s, res);
  go('sSummary');
}

function coachTips(s) {
  const t = [];
  if (s.travels) t.push('<b>Footwork:</b> when you pick up the ball, freeze one foot (your pivot). Turn on it, don\'t walk.');
  if (s.doubles) t.push('<b>Pick-up rule:</b> your dribble is over once both hands hold the ball. Look to pass or shoot.');
  if (s.dribbles >= 20 && s.bestStreak < 15) t.push('<b>Handles:</b> push the ball with your fingertips, not your palm, and keep it below your waist.');
  if (s.shots >= 5 && s.makes / s.shots < 0.3) t.push('<b>Shooting:</b> elbow under the ball, eyes on the rim, and hold your follow-through ("hand in the cookie jar").');
  if (s.shots >= 5 && s.makes / s.shots >= 0.5) t.push('<b>Nice shooting!</b> Take one step back next time.');
  if (s.bestStreak >= 25) t.push('<b>Great handle.</b> Try it with your other hand, or without looking at the ball.');
  if (!t.length) t.push('Keep going. Every session counts toward your next level.');
  return t;
}

function renderSummary(s, res) {
  const m = P.MODES[s.mode];
  const lv = res?.after, up = res && res.after.n > res.before.n;
  const fg = s.shots ? Math.round((100 * s.makes) / s.shots) + '%' : '–';
  const drill = res?.drill;
  const drillLine = drill?.score != null ? `<div class="card" style="margin-bottom:14px;text-align:center"><p class="label" style="margin-bottom:4px">${m.name} score</p><div style="font:800 56px/1 var(--display)">${drill.score}${drill.isBest ? '<span class="pbflag">NEW BEST</span>' : ''}</div><div style="color:var(--dim)">${drill.prev != null ? `Previous best: ${drill.prev}` : 'First time. That is your best to beat.'}</div></div>` : '';
  const xpRows = [['Dribbles', s.xpBy.dribbles], ['Streak bonuses', s.xpBy.streaks], ['Shots & makes', s.xpBy.shots], ['Clean footwork', s.xpBy.footwork], ['Drill', s.xpBy.drill]].filter(([, v]) => v);
  $('#summary').innerHTML = `
    <div class="sumhead"><div class="k">${m.name} · ${fmtTime(s.seconds)}${s.complete === false && (m.secs || m.shots) ? ' · ended early' : ''}</div>
      <h2>Session over</h2><div class="xp">+${s.xp} XP</div></div>
    ${up ? `<div class="lvlup">Level up! Level ${lv.n} · ${lv.name}</div>` : ''}
    ${drillLine}
    ${res ? `<div class="card" style="margin-bottom:14px"><div class="pc">${jersey(res.player)}<div class="who"><div class="name">${esc(res.player.name)}</div><div class="lvl">Level ${lv.n} · ${lv.name}</div>
      <div class="bar"><i id="sumBar" style="width:${(up ? 0 : res.before.pct * 100).toFixed(1)}%"></i></div><div class="xpline"><span>${res.player.xp.toLocaleString()} XP</span><span>${lv.next ? `${lv.toNext.toLocaleString()} to ${P.LEVELS[lv.n][1]}` : 'Max level'}</span></div></div></div></div>` : ''}
    <div class="stats">
      <div class="stat"><b>${s.dribbles}</b><span>Dribbles</span></div>
      <div class="stat"><b>${s.bestStreak}</b><span>Best streak</span></div>
      <div class="stat"><b>${s.makes}/${s.shots}</b><span>FG · ${fg}</span></div>
      <div class="stat"><b>${s.clean}</b><span>Clean pick-ups</span></div>
      <div class="stat ${s.travels ? 'bad' : ''}"><b>${s.travels}</b><span>Travels</span></div>
      <div class="stat ${s.doubles ? 'bad' : ''}"><b>${s.doubles}</b><span>Double dribbles</span></div>
    </div>
    ${res?.earned.length ? `<p class="label" style="margin-top:20px">New badges</p><div class="badges">${res.earned.map((b) => badgeHTML(b, true, true)).join('')}</div>` : ''}
    <div class="grid2" style="margin-top:16px">
      <div class="card"><p class="label">XP earned</p><div class="xprows">${xpRows.map(([k, v]) => `<div class="xprow"><span>${k}</span><b>+${v}</b></div>`).join('') || '<div class="xprow"><span>No XP this time</span></div>'}</div></div>
      <div class="card"><p class="label">Coach says</p><ul class="tips" style="margin:0;padding-left:18px">${coachTips(s).map((t) => `<li>${t}</li>`).join('')}</ul></div>
    </div>
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn primary" id="again">Play again</button></div>`;
  $('#again').onclick = () => enterSession();
  if (res) requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('#sumBar'); if (b) b.style.width = (res.after.pct * 100).toFixed(1) + '%'; }));
  if (up) { whistle(0.3); setTimeout(() => say(`Level up! ${lv.name}!`), 400); }
  else if (res?.earned.length) say(`New badge: ${res.earned[0].name}`);
}

function badgeHTML(b, got, isNew) {
  return `<div class="badge ${got ? 'got' : 'locked'} ${isNew ? 'new' : ''}"><div class="bi">${svg(b.icon)}</div><div><b>${b.name}</b><span>${b.desc}</span></div></div>`;
}

// ---------- profile ----------
function renderProfile() {
  const p = P.current(), el = $('#profile');
  if (!p) { el.innerHTML = '<div class="card empty-player"><p>No player yet.</p><button class="btn primary" id="prAdd">+ Add player</button></div>'; $('#prAdd').onclick = openPlayers; return; }
  const L = P.levelOf(p.xp), S = p.stats;
  const fg = S.shots ? Math.round((100 * S.makes) / S.shots) + '%' : '–';
  const modeName = (id) => P.MODES[id]?.name || id;
  el.innerHTML = `
    <div class="card"><div class="pc">${jersey(p)}<div class="who"><div class="name">${esc(p.name)}${p.num ? ` <span style="color:var(--dim)">#${esc(p.num)}</span>` : ''}</div><div class="lvl">Level ${L.n} · ${L.name}</div>
      <div class="bar"><i style="width:${(L.pct * 100).toFixed(1)}%"></i></div><div class="xpline"><span>${p.xp.toLocaleString()} XP</span><span>${L.next ? `${L.toNext.toLocaleString()} to ${P.LEVELS[L.n][1]}` : 'Max level'}</span></div></div></div>
      <div class="pc-actions"><button class="btn sm" id="prSwitch">Switch player</button><span style="flex:1"></span><button class="btn sm ghost danger" id="prDel">Delete player</button></div></div>
    <p class="label" style="margin-top:20px">All-time</p>
    <div class="stats">
      <div class="stat"><b>${S.sessions}</b><span>Sessions</span></div>
      <div class="stat"><b>${Math.round(S.seconds / 60)}</b><span>Minutes</span></div>
      <div class="stat"><b>${S.dribbles.toLocaleString()}</b><span>Dribbles</span></div>
      <div class="stat"><b>${S.bestStreak}</b><span>Best streak</span></div>
      <div class="stat"><b>${S.makes}/${S.shots}</b><span>FG · ${fg}</span></div>
      <div class="stat"><b>${S.travels + S.doubles}</b><span>Violations</span></div>
    </div>
    <p class="label" style="margin-top:20px">Personal bests</p>
    <div class="stats">${['dribble30', 'shoot10'].map((id) => `<div class="stat"><b>${p.bests[id] ?? '–'}</b><span>${modeName(id)}</span></div>`).join('')}</div>
    <p class="label" style="margin-top:20px">Badges · ${Object.keys(p.badges).length}/${P.BADGES.length}</p>
    <div class="badges">${P.BADGES.map((b) => badgeHTML(b, !!p.badges[b.id])).join('')}</div>
    <p class="label" style="margin-top:20px">Recent sessions</p>
    <div class="card scroll-x" style="padding:6px 10px">${p.history.length ? `<table class="hist"><tr><th>Date</th><th>Mode</th><th>Time</th><th>Dribbles</th><th>Streak</th><th>FG</th><th>Calls</th><th>XP</th></tr>
      ${p.history.map((h) => `<tr><td>${new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td>${modeName(h.mode)}</td><td>${fmtTime(h.seconds)}</td><td>${h.dribbles}</td><td>${h.bestStreak}</td><td>${h.makes}/${h.shots}</td><td>${h.travels + h.doubles}</td><td>+${h.xp}</td></tr>`).join('')}</table>` : '<p style="color:var(--dim)">No sessions yet.</p>'}</div>`;
  $('#prSwitch').onclick = openPlayers;
  $('#prDel').onclick = () => { if (confirm(`Delete ${p.name} and all their progress?`)) { P.removePlayer(p.id); renderProfile(); } };
}

// ---------- boot ----------
renderHome();
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'live') $('#cPause').click(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#mPlayers').classList.contains('on')) $('#mPlayersClose').click();
  if (!$('#sSession').classList.contains('on')) return;
  if (e.key === ' ' && (phase === 'live' || phase === 'paused')) { e.preventDefault(); $('#cPause').click(); }
});
if (TEST) window.__wh = { ref, tracker, P, onEvent, get session() { return session; }, get phase() { return phase; }, startLive: () => { mode = mode || 'free'; startLive(); }, endSession, go, enterSession };
