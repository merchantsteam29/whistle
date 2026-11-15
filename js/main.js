// WHISTLE: screens, camera loop, HUD, calls, XP, and game mode.
import { Ref } from './ref.js';
import { BallTracker, BallFinder, DEFAULT_COLOR } from './ball.js';
import { createPose, createBallDetector, BONES } from './pose.js';
import { Game, Court } from './game.js';
import { sound, unlock, whistle, say, beep, swish } from './audio.js';
import * as P from './progress.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEBUG = Q.has('debug');
// a recorded video instead of the camera: ?src=clip.mp4 (tests) or "Ref a recorded video" in setup
let videoSrc = Q.get('src');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cfg = P.settings();
const TEAM_COLORS = ['#ff7a1a', '#3d9bff'];

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
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  three: '<path d="M8 5h6a3 3 0 0 1 0 6h-3 3a3 3 0 0 1 0 6H8"/>',
  free: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/>',
  dribble30: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  shoot10: '<path d="M4 7h16M6 7l2 10h8l2-10M9 7l1 10M15 7l-1 10"/>',
  game: '<circle cx="7" cy="6" r="2.5"/><circle cx="17" cy="6" r="2.5"/><path d="M4 21v-6l3-5 3 5v6M14 21v-6l3-5 3 5v6"/>',
};
const svg = (k, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ''}</svg>`;

// ---------- navigation ----------
function go(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  if (id === 'sHome') renderHome();
  if (id === 'sProfile') renderProfile();
  if (id === 'sSettings') renderSettings();
  if (id !== 'sSession') { stopCamera(); dropVideo(); }
}
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

// ---------- home ----------
let mode = 'free';
function jersey(p) { return `<div class="jersey" style="background:${p.color}">${esc(p.num || p.name[0]?.toUpperCase() || '?')}</div>`; }
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
    const right = m.game && p ? `<div class="pb">RECORD<em>${p.stats.wins}-${p.stats.games - p.stats.wins}</em></div>` : pb != null ? `<div class="pb">BEST<em>${pb}</em></div>` : '';
    return `<button class="mode ${id === mode ? 'sel' : ''}" data-mode="${id}"><div class="ic">${svg(id)}</div><div><b>${m.name}</b><span>${m.desc}</span></div>${right}</button>`;
  }).join('');
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; renderHome(); });
}
$('#btnStart').onclick = () => {
  unlock();
  if (mode === 'game') { openGameSetup(); return; }
  if (!P.current()) { openPlayers(); return; }
  enterSession();
};

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
$('#mPlayersClose').onclick = () => { $('#mPlayers').classList.remove('on'); renderHome(); if ($('#mGame').classList.contains('on')) renderGameSetup(); };
$('#mPlayers').addEventListener('click', (e) => { if (e.target.id === 'mPlayers') $('#mPlayersClose').click(); });
$('#newPlayer').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#npName').value.trim(); if (!name) return;
  P.addPlayer(name, $('#npNum').value); $('#npName').value = ''; $('#npNum').value = '';
  renderPlayers(); renderHome();
};

// ---------- game setup modal ----------
const GR = cfg.gameRules;
function openGameSetup() { renderGameSetup(); $('#mGame').classList.add('on'); }
function slotCount() { return GR.format === '2v2' ? 4 : 2; }
function teamOfSlot(i) { return GR.format === '2v2' ? (i < 2 ? 0 : 1) : i; }
function renderGameSetup() {
  document.querySelectorAll('#gFormat button').forEach((b) => b.classList.toggle('on', b.dataset.v === GR.format));
  const n = slotCount(), players = P.players();
  cfg.roster = Array.from({ length: n }, (_, i) => cfg.roster[i] ?? null);
  const opt = (i) => `<select data-slot="${i}"><option value="">Guest ${i < n / 2 ? 'H' : 'A'}${(i % (n / 2)) + 1} (no XP)</option>${players.map((p) => `<option value="${p.id}" ${cfg.roster[i] === p.id ? 'selected' : ''}>${esc(p.name)}${p.num ? ' #' + esc(p.num) : ''}</option>`).join('')}</select>`;
  $('#gHome').innerHTML = Array.from({ length: n / 2 }, (_, k) => opt(k)).join('') + '<button class="btn sm ghost" data-addp>+ New player</button>';
  $('#gAway').innerHTML = Array.from({ length: n / 2 }, (_, k) => opt(n / 2 + k)).join('');
  document.querySelectorAll('[data-slot]').forEach((s) => s.onchange = () => { cfg.roster[+s.dataset.slot] = s.value || null; P.save(); });
  $('[data-addp]').onclick = openPlayers;
  $('#gTo').value = String(GR.toPoints); $('#gFoulOut').value = String(GR.foulOut); $('#gBonus').value = String(GR.bonusAt);
}
document.querySelectorAll('#gFormat button').forEach((b) => b.onclick = () => { GR.format = b.dataset.v; P.save(); renderGameSetup(); });
$('#gTo').onchange = () => { GR.toPoints = +$('#gTo').value; P.save(); };
$('#gFoulOut').onchange = () => { GR.foulOut = +$('#gFoulOut').value; P.save(); };
$('#gBonus').onchange = () => { GR.bonusAt = +$('#gBonus').value; P.save(); };
$('#mGameClose').onclick = () => $('#mGame').classList.remove('on');
$('#gGo').onclick = () => {
  const ids = cfg.roster.slice(0, slotCount()).filter(Boolean);
  if (new Set(ids).size !== ids.length) { toast('The same player is picked twice'); return; }
  $('#mGame').classList.remove('on'); enterSession();
};

// ---------- settings ----------
function renderSettings() {
  $('#setSteps').value = String(cfg.stepsAllowed);
  $('#setWhistle').checked = cfg.whistle; $('#setVoice').checked = cfg.voice; $('#setVolume').value = cfg.volume;
  $('#setQuality').value = cfg.quality; $('#setSens').value = cfg.sensitivity; $('#setSkeleton').checked = cfg.skeleton; $('#setMirror').checked = cfg.mirror;
  $('#setAI').checked = cfg.aiBall; $('#setTrack').checked = !!cfg.trackView;
  $('#setBallTxt').innerHTML = cfg.ballColor ? `<span class="swatch" style="background:${hsvCss(cfg.ballColor)}"></span>Learned from your ball` : 'Learned automatically (AI) or standard orange';
}
function bindSetting(sel, key, read) { $(sel).addEventListener('input', () => { cfg[key] = read($(sel)); applySettings(); P.save(); }); }
bindSetting('#setSteps', 'stepsAllowed', (el) => Number(el.value));
bindSetting('#setWhistle', 'whistle', (el) => el.checked);
bindSetting('#setVoice', 'voice', (el) => el.checked);
bindSetting('#setVolume', 'volume', (el) => Number(el.value));
bindSetting('#setQuality', 'quality', (el) => el.value);
bindSetting('#setSens', 'sensitivity', (el) => Number(el.value));
bindSetting('#setSkeleton', 'skeleton', (el) => el.checked);
bindSetting('#setMirror', 'mirror', (el) => el.checked);
bindSetting('#setAI', 'aiBall', (el) => el.checked);
bindSetting('#setTrack', 'trackView', (el) => el.checked);
$('#setBallReset').onclick = () => { cfg.ballColor = null; applySettings(); P.save(); renderSettings(); };
$('#setVolume').addEventListener('change', () => beep(880, 0.1));
function applySettings() {
  sound.whistle = cfg.whistle; sound.voice = cfg.voice; sound.volume = cfg.volume;
  ref.setOptions({ stepsAllowed: cfg.stepsAllowed });
  tracker.tol = cfg.sensitivity;
  tracker.setColor(cfg.ballColor || DEFAULT_COLOR);
  finder.autoColor = !cfg.ballColor; finder.useAI = cfg.aiBall;
}
function hsvCss(c) { return `hsl(${c.h.toFixed(0)} ${(c.s * 100).toFixed(0)}% ${(c.v * 50).toFixed(0)}%)`; }

// ---------- session state ----------
const video = $('#video'), canvas = $('#overlay'), g = canvas.getContext('2d'), stage = $('#stage');
const ref = new Ref({ stepsAllowed: cfg.stepsAllowed });
const tracker = new BallTracker();
const finder = new BallFinder(tracker);
applySettings();

let stream = null, pose = null, running = false, phase = 'off'; // off | setup | count | live | paused | done
let session = null, game = null, court = new Court(1), slotPoses = [], lastPose = null, lastBall = null, tapMode = 'ball', hoopPts = [];
let bodyOkSince = 0, lastCall = null, lastShot = null, waveTimer = 0, askTimer = 0, endTimer = 0, askFor = null;
const fpsM = { n: 0, t0: 0, fps: 0, slowSince: 0 };
const isGame = () => mode === 'game';

async function startCamera() {
  stopCamera();
  if (videoSrc) {
    // a video file stands in for the camera (?src=clip.mp4[&rate=0.5], or one picked in setup)
    video.srcObject = null; video.src = videoSrc; video.loop = false; video.muted = true;
    video.playbackRate = Number(Q.get('rate')) || 1;
    await new Promise((r, j) => { if (video.videoWidth) r(); else { video.addEventListener('loadedmetadata', r, { once: true }); video.addEventListener('error', () => j(new Error('Video failed to load')), { once: true }); } });
    video.pause(); video.currentTime = 0.01;
    stage.classList.remove('mirror'); layout(); return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser cannot use the camera.'), { name: 'NoCamera' });
  // a smaller picture is much faster to track; the models shrink it anyway
  const big = cfg.quality === 'accurate';
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: cfg.facing, width: { ideal: big ? 1280 : 854 }, height: { ideal: big ? 720 : 480 }, frameRate: { ideal: 30 } } });
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise((r) => { if (video.videoWidth) r(); else video.addEventListener('loadedmetadata', r, { once: true }); });
  const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  stage.classList.toggle('mirror', cfg.mirror && facing !== 'environment' && cfg.facing !== 'environment');
  layout();
}
function stopCamera() {
  running = false;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  video.srcObject = null;
  $('#tags').innerHTML = '';
}

// forget a picked video file when leaving the session screen
function dropVideo() {
  if (!videoSrc || Q.get('src')) return;
  video.pause(); if (videoSrc.startsWith('blob:')) URL.revokeObjectURL(videoSrc);
  videoSrc = null; video.removeAttribute('src'); video.load();
}
function layout() {
  const W = innerWidth, H = innerHeight, vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const sc = Math.min(W / vw, H / vh), w = Math.round(vw * sc), h = Math.round(vh * sc);
  Object.assign(stage.style, { width: w + 'px', height: h + 'px', left: ((W - w) >> 1) + 'px', top: ((H - h) >> 1) + 'px' });
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const tags = $('#tags'); Object.assign(tags.style, { left: stage.style.left, top: stage.style.top, width: w + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
}
addEventListener('resize', layout);

async function enterSession() {
  go('sSession');
  phase = 'setup'; tapMode = 'ball'; hoopPts = []; session = null; game = null; lastCall = null; lastShot = null;
  court = new Court(isGame() ? slotCount() : 1);
  ref.reset(); finder.reset();
  ['#scoreboard', '#gameboard', '#poss', '#cPause', '#cWave', '#cFix', '#cAddShot', '#cRef', '#refPad', '#cEnd', '#ask', '#count'].forEach((s) => $(s).classList.add('hidden'));
  $('#setup').classList.remove('hidden'); $('#cBack').classList.remove('hidden'); $('#cFlip').classList.remove('hidden');
  $('#chkThree').classList.toggle('hidden', !isGame());
  $('#chkBodyTitle').textContent = isGame() ? `All ${slotCount()} players in view` : 'Whole body in view';
  updateSetup();
  showLoading('WARMING UP', 'Starting the camera…');
  try { await startCamera(); } catch (e) {
    const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    showLoading('NO CAMERA', denied ? 'Camera access was blocked. Allow the camera for this site in the address bar, then try again.' : (e.name === 'NotFoundError' ? 'No camera was found on this device.' : e.message || 'The camera could not start.'), true);
    return;
  }
  showLoading('WARMING UP', 'Loading body tracking and the AI ball finder (first time takes a few seconds)…');
  try {
    const [p, d] = await Promise.all([createPose(cfg.quality, isGame() ? slotCount() : 1), cfg.aiBall ? createBallDetector().catch((e) => { console.warn('AI ball finder unavailable', e); return null; }) : null]);
    pose = p; finder.det = d;
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
  $('#loadBtns')?.remove();
  if (err) $('#loadTxt').insertAdjacentHTML('afterend', `<div style="margin-top:16px" class="row" id="loadBtns"><button class="btn" data-go="sHome">Back</button><button class="btn primary" id="loadRetry">Try again</button></div>`);
  const r = $('#loadRetry'); if (r) r.onclick = () => { $('#loadBtns')?.remove(); enterSession(); };
}
function hideLoading() { $('#loading').classList.add('hidden'); $('#loadBtns')?.remove(); }

// ---------- loop: tracking runs once per NEW camera frame; drawing + clock every screen frame ----------
let lastT = 0, loopGen = 0, lastFrameT = -1;
function startLoop() {
  const id = ++loopGen; running = true; lastT = performance.now();
  const useVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  const tick = (now) => {
    if (!running || id !== loopGen) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (phase === 'live') { if (session) session.seconds += dt; if (game) gameClock += dt; }
    if (!useVFC && video.currentTime !== lastFrameT) { lastFrameT = video.currentTime; process(now); }
    drawOverlay();
  };
  requestAnimationFrame(tick);
  if (useVFC) {
    const vf = (now) => { if (!running || id !== loopGen) return; video.requestVideoFrameCallback(vf); process(performance.now()); };
    video.requestVideoFrameCallback(vf);
  }
}

function process(now) {
  if (!pose || video.readyState < 2 || !video.videoWidth) return;
  const t0 = performance.now();
  const t = videoSrc ? video.currentTime : now / 1000;
  const aspect = video.videoWidth / video.videoHeight;
  let all = [];
  try { all = pose.detectAll(video, now); } catch (e) { all = []; }
  tracker.grab(video);
  slotPoses = court.assign(all.map((lm) => ({ lm, shirt: shirtOf(lm) })), t, aspect, stage.classList.contains('mirror'));
  lastPose = slotPoses[0] || null;
  const people = slotPoses.filter(Boolean).map((lm) => personOf(lm, aspect));
  lastBall = finder.find(t, video, now, people, aspect);
  // speed: frames per second, and drop to Fast tracking if Accurate can't keep up
  fpsM.n++; if (now - fpsM.t0 > 1000) { fpsM.fps = Math.round((fpsM.n * 1000) / (now - fpsM.t0)); fpsM.n = 0; fpsM.t0 = now; checkSpeed(now); }
  if (TEST) { const S = TSTATS; S.frames++; if (lastPose) S.pose++; if (lastBall) S.ball++; if (lastBall?.src === 'ai') S.ai++; S.ms += performance.now() - t0; }
  if (phase === 'live') {
    if (game) handleGame(game.update({ t, aspect, poses: slotPoses, ball: lastBall, hoop: cfg.hoop, threeLine: cfg.threeLine }));
    else {
      for (const e of ref.update({ t, aspect, pose: lastPose, ball: lastBall, hoop: cfg.hoop })) onEvent(e);
      const m = P.MODES[session.mode];
      if (m.secs && session.seconds >= m.secs && !endTimer) { session.seconds = m.secs; session.complete = true; whistle(0.7, 2); say('Time!'); endTimer = setTimeout(endSession, 900); phase = 'done'; }
    }
    updateHUD();
  } else if (phase === 'setup' || phase === 'count') {
    if (!isGame()) ref.update({ t, aspect, pose: lastPose, ball: lastBall, hoop: cfg.hoop }); // keeps feet / body scale warm
    updateSetup();
  }
  if (isGame()) placeTags();
}

async function checkSpeed(now) {
  if (videoSrc || phase === 'off') return;
  if (cfg.quality === 'accurate' && fpsM.fps < 12) {
    if (!fpsM.slowSince) fpsM.slowSince = now;
    if (now - fpsM.slowSince > 4000) {
      fpsM.slowSince = 0; cfg.quality = 'fast'; P.save();
      try { pose = await createPose('fast', isGame() ? slotCount() : 1); toast('Switched to Fast tracking to keep up'); } catch {}
    }
  } else fpsM.slowSince = 0;
}

// the colour of a player's shirt (helps tell players apart when they cross)
function shirtOf(lm) {
  if (!lm[11] || !lm[23]) return null;
  const x = (lm[11].x + lm[12].x + lm[23].x + lm[24].x) / 4, y = (lm[11].y + lm[12].y) / 2 * 0.6 + (lm[23].y + lm[24].y) / 2 * 0.4;
  return tracker.sample(x, y);
}
// what the ball finder needs to know about a person (normalised coords)
function personOf(lm, aspect) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) if ((p.visibility ?? 1) > 0.4) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const sx = (lm[11].x + lm[12].x) / 2, sy = (lm[11].y + lm[12].y) / 2, hx = (lm[23].x + lm[24].x) / 2, hy = (lm[23].y + lm[24].y) / 2;
  const S = Math.max(0.03, Math.hypot((sx - hx) * aspect, sy - hy));
  const hand = (w, i) => (lm[w] && (lm[w].visibility ?? 1) > 0.3 ? { x: lm[w].x + (lm[i].x - lm[w].x) * 0.6, y: lm[w].y + (lm[i].y - lm[w].y) * 0.6 } : null);
  const face = lm[0] && (lm[0].visibility ?? 1) > 0.5 ? { x: lm[0].x, y: lm[0].y, r: Math.max(0.03, S * 0.42) } : null;
  // body parts the ball tracker ignores (skin / clothes can be ball-coloured): legs, feet, upper arms, face
  const ok = (i) => lm[i] && (lm[i].visibility ?? 1) > 0.4;
  const cap = (a, b, r) => (ok(a) && ok(b) ? { x: lm[a].x, y: lm[a].y, x2: lm[b].x, y2: lm[b].y, r: r * S } : null);
  const ex = [cap(23, 25, 0.15), cap(24, 26, 0.15), cap(25, 27, 0.11), cap(26, 28, 0.11), cap(27, 31, 0.08), cap(28, 32, 0.08), cap(11, 13, 0.09), cap(12, 14, 0.09), face].filter(Boolean);
  // for motion, also the torso, forearms and hands (they move, the ball must move apart from them)
  const exMove = ex.concat([cap(11, 23, 0.14), cap(12, 24, 0.14), cap(11, 12, 0.12), cap(23, 24, 0.14), cap(13, 15, 0.09), cap(14, 16, 0.09), cap(15, 19, 0.12), cap(16, 20, 0.12)].filter(Boolean));
  return { box: { x0, y0, x1, y1 }, hands: [hand(15, 19), hand(16, 20)], S, face, ex, exMove };
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
      g.lineWidth = 1.5 * dpr; g.strokeStyle = 'rgba(255,255,255,.35)';
      const w = (pts[1].x - pts[0].x) * W;
      g.beginPath(); g.moveTo(pts[0].x * W, pts[0].y * H); g.lineTo(pts[0].x * W + w * 0.2, pts[0].y * H + Math.abs(w) * 0.7);
      g.lineTo(pts[1].x * W - w * 0.2, pts[1].y * H + Math.abs(w) * 0.7); g.lineTo(pts[1].x * W, pts[1].y * H); g.stroke();
    }
    for (const p of pts) { g.beginPath(); g.arc(p.x * W, p.y * H, 6 * dpr, 0, Math.PI * 2); g.fill(); }
  }
  if (isGame() && cfg.threeLine) {
    const x = cfg.threeLine.x * W, y = cfg.threeLine.y * H;
    g.setLineDash([10 * dpr, 8 * dpr]); g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(255,197,61,.8)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - H * 0.55); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffc53d'; g.beginPath(); g.arc(x, y, 7 * dpr, 0, Math.PI * 2); g.fill();
  }
  if (cfg.skeleton || phase === 'setup') {
    slotPoses.forEach((lm, i) => {
      if (!lm) return;
      const col = isGame() ? TEAM_COLORS[teamOfSlot(i)] : 'rgba(238,243,251,.8)';
      g.lineCap = 'round'; g.lineWidth = 4 * dpr; g.strokeStyle = col; g.globalAlpha = isGame() ? 0.85 : 1;
      g.beginPath();
      for (const [a, b] of BONES) {
        const A = lm[a], B = lm[b];
        if (!A || !B || (A.visibility ?? 1) < 0.4 || (B.visibility ?? 1) < 0.4) continue;
        g.moveTo(A.x * W, A.y * H); g.lineTo(B.x * W, B.y * H);
      }
      g.stroke(); g.globalAlpha = 1;
      const r = game ? game.refs[i] : ref, st = r.state();
      [27, 28].forEach((k, f) => {
        const A = lm[k]; if (!A || (A.visibility ?? 1) < 0.4) return;
        g.fillStyle = st.feetMoving[f] ? '#ffc53d' : (st.held && st.pivot === f ? '#3d9bff' : 'rgba(238,243,251,.9)');
        g.beginPath(); g.arc(A.x * W, A.y * H, (st.held && st.pivot === f ? 9 : 6) * dpr, 0, Math.PI * 2); g.fill();
      });
    });
  }
  if (lastBall && (cfg.skeleton || phase === 'setup')) {
    const st = game ? { held: false, dribbling: false } : ref.state();
    g.lineWidth = 3 * dpr; g.strokeStyle = st.held ? '#ffc53d' : st.dribbling ? '#22c983' : '#ff7a1a';
    g.beginPath(); g.arc(lastBall.x * W, lastBall.y * H, Math.max(6 * dpr, lastBall.r * H * 1.15), 0, Math.PI * 2); g.stroke();
  }
  if (DEBUG || cfg.trackView) {
    g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(255,70,85,.9)';
    for (const b of finder.bg) { g.beginPath(); g.arc(b.x * W, b.y * H, b.r * H, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(61,155,255,.9)';
    for (const d of finder.lastAI || []) { g.strokeRect((d.x * W) - d.r * H, d.y * H - d.r * H, d.r * H * 2, d.r * H * 2); }
  }
}

// ---------- setup ----------
function updateSetup() {
  const now = performance.now();
  const n = isGame() ? slotCount() : 1;
  const full = (lm) => lm && [0, 27, 28].every((i) => lm[i] && (lm[i].visibility ?? 1) > 0.5) && lm[0].y > 0.01 && Math.max(lm[27].y, lm[28].y) < 0.99;
  const inView = slotPoses.filter(full).length;
  if (inView >= n) { if (!bodyOkSince) bodyOkSince = now; } else bodyOkSince = 0;
  const bodyOk = bodyOkSince && now - bodyOkSince > 400;
  const bodyTxt = isGame()
    ? (bodyOk ? `All ${n} in view. HOME (orange) is on the left, AWAY (blue) on the right.` : `${inView} of ${n} in view, head to feet. HOME stands on the left side.`)
    : (bodyOk ? 'Got you. Head to feet in view.' : (lastPose ? 'Almost. Step back until your feet are in the picture.' : 'Stand 3 to 5 m from the camera, head to feet in the picture.'));
  setChk('#chkBody', bodyOk, !bodyOk, bodyTxt);
  const ai = finder.det && cfg.aiBall;
  const ballSet = !!cfg.ballColor || ballDefaultChosen || ai;
  const seen = lastBall ? ` · <b style="color:var(--green);display:inline">ball seen${lastBall.src === 'ai' ? ' (AI)' : ''}</b>` : ' · <span style="color:var(--faint)">ball not seen</span>';
  const how = cfg.ballColor ? 'Colour learned from your tap.' : ai ? 'The AI finds any ball. Tapping it helps colour tracking.' : 'Standard orange.';
  setChk('#chkBall', ballSet, tapMode === 'ball' && !ballSet, ballSet ? `<span class="swatch" style="background:${hsvCss(tracker.color)}"></span>${how}${seen}` : 'Hold the ball up and tap it on screen so WHISTLE learns its colour.' + seen);
  const hoopTxt = tapMode === 'hoop' ? (hoopPts.length ? 'Now tap the RIGHT edge of the rim.' : 'Tap the LEFT edge of the rim.') : cfg.hoop ? 'Hoop marked. Shots get scored automatically.' : 'For auto-scored shots: tap the left edge of the rim, then the right. Skip it and you mark shots yourself.';
  setChk('#chkHoop', !!cfg.hoop && tapMode !== 'hoop', tapMode === 'hoop', hoopTxt);
  $('#hoopMark').textContent = cfg.hoop ? 'Redo hoop' : 'Mark hoop';
  $('#hoopClear').classList.toggle('hidden', !cfg.hoop);
  if (isGame()) {
    const t3 = tapMode === 'three' ? 'Tap the FLOOR right on the 3-point line.' : cfg.threeLine ? (cfg.hoop ? 'Marked. Makes from further out than the line count 3.' : 'Marked. Mark the hoop too so it knows which side is "out".') : 'Tap the floor where the 3-point line is. Makes from further out count 3.';
    setChk('#chkThree', !!cfg.threeLine && tapMode !== 'three', tapMode === 'three', t3);
    $('#threeMark').textContent = cfg.threeLine ? 'Redo line' : 'Mark 3-pt line';
    $('#threeClear').classList.toggle('hidden', !cfg.threeLine);
  }
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
$('#threeMark').onclick = () => { tapMode = 'three'; updateSetup(); };
$('#threeClear').onclick = () => { cfg.threeLine = null; tapMode = 'ball'; P.save(); updateSetup(); };

stage.addEventListener('pointerdown', (e) => {
  if (phase !== 'setup') return;
  const r = stage.getBoundingClientRect();
  let nx = (e.clientX - r.left) / r.width; const ny = (e.clientY - r.top) / r.height;
  if (stage.classList.contains('mirror')) nx = 1 - nx;
  if (tapMode === 'hoop') {
    hoopPts.push({ x: nx, y: ny });
    if (hoopPts.length === 2) {
      const [a, b] = hoopPts[0].x <= hoopPts[1].x ? hoopPts : [hoopPts[1], hoopPts[0]];
      cfg.hoop = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; P.save(); tapMode = 'ball'; hoopPts = []; beep(1200, 0.08);
    }
  } else if (tapMode === 'three') {
    cfg.threeLine = { x: nx, y: ny }; P.save(); tapMode = 'ball'; beep(1200, 0.08);
  } else {
    const c = tracker.sample(nx, ny);
    if (!c) return;
    if (c.s < 0.25 || c.v < 0.15) { toast('That spot is too grey or dark for colour tracking. The AI ball finder still works.'); return; }
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
  if (videoSrc && !Q.get('src')) { video.currentTime = 0; video.play().catch(() => {}); }
  lastCall = null; lastShot = null; endTimer = 0; applySettings();
  phase = 'live';
  $('#cBack').classList.add('hidden');
  ['#cPause', '#cEnd'].forEach((s) => $(s).classList.remove('hidden'));
  $('#cPauseT').textContent = 'Pause';
  if (isGame()) { startGame(); return; }
  session = P.newSession(mode); ref.reset();
  ['#scoreboard', '#poss'].forEach((s) => $(s).classList.remove('hidden'));
  $('#cAddShot').classList.toggle('hidden', !!cfg.hoop && session.mode !== 'shoot10');
  $('#sbClockLbl').textContent = P.MODES[mode].secs ? 'Left' : P.MODES[mode].shots ? 'Shots' : 'Time';
  $('#sbClockWrap').classList.toggle('clock', !!P.MODES[mode].secs);
  updateHUD();
}

$('#cBack').onclick = () => go('sHome');
$('#pickVideo').onclick = () => $('#videoFile').click();
$('#videoFile').onchange = async () => {
  const f = $('#videoFile').files[0]; if (!f) return;
  if (videoSrc?.startsWith('blob:')) URL.revokeObjectURL(videoSrc);
  videoSrc = URL.createObjectURL(f); $('#videoFile').value = '';
  try { await startCamera(); startLoop(); toast('Video loaded. Mark the ball and hoop on the first frame, then Tip off.', true); }
  catch { toast('That video could not be opened'); videoSrc = null; }
};
video.addEventListener('ended', () => { if (videoSrc && !Q.get('src') && (session || game)) setTimeout(endSession, 600); });
$('#cFlip').onclick = async () => {
  const prev = cfg.facing; cfg.facing = cfg.facing === 'user' ? 'environment' : 'user';
  try { await startCamera(); P.save(); startLoop(); } catch { cfg.facing = prev; toast('No other camera on this device'); try { await startCamera(); startLoop(); } catch {} }
};
$('#cPause').onclick = () => {
  if (phase === 'live') { phase = 'paused'; $('#cPauseT').textContent = 'Resume'; if (!game) $('#pillTxt').textContent = 'PAUSED'; else toast('Paused'); }
  else if (phase === 'paused') { phase = 'live'; if (game) for (const r of game.refs) r.reset(); else ref.reset(); $('#cPauseT').textContent = 'Pause'; }
};
$('#cEnd').onclick = () => { if (session || game) endSession(); };
$('#cWave').onclick = () => {
  if (game) { if (game.waveOff()) { hideCall(); toast('Call waved off', true); } $('#cWave').classList.add('hidden'); updateHUD(); return; }
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
$('#cAddShot').onclick = () => { if (phase !== 'live' || game) return; onEvent({ type: 'shot', manual: true }); askShot(); };
$('#askYes').onclick = () => answer(true);
$('#askNo').onclick = () => answer(false);
function answer(yes) { closeAsk(); if (game) handleGame(game.resolve(yes)); else if (yes) made(false); else missed(); }
function askShot() { $('#ask').classList.remove('hidden'); clearTimeout(askTimer); askTimer = setTimeout(() => answer(false), 7000); }
function closeAsk() { clearTimeout(askTimer); $('#ask').classList.add('hidden'); }

// ---------- single-player events -> stats, XP, calls ----------
function onEvent(e) {
  if (TEST) TLOG.push({ t: +video.currentTime.toFixed(2), ...e });
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
      showWave();
      break;
    }
  }
}
function showWave() { $('#cWave').classList.remove('hidden'); clearTimeout(waveTimer); waveTimer = setTimeout(() => $('#cWave').classList.add('hidden'), 9000); }
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

// ---------- game mode ----------
let gameClock = 0;
const callQueue = [];
function startGame() {
  game = new Game({ format: GR.format, rules: { toPoints: GR.toPoints, foulOut: GR.foulOut, bonusAt: GR.bonusAt, stepsAllowed: cfg.stepsAllowed } });
  court.lock(); gameClock = 0;
  ['#gameboard', '#cRef'].forEach((s) => $(s).classList.remove('hidden'));
  $('#gbTo').textContent = GR.toPoints ? `TO ${GR.toPoints}` : 'GAME';
  const names = (team) => [0, 1, 2, 3].slice(0, slotCount()).filter((i) => teamOfSlot(i) === team).map(slotName).join(' & ');
  $('#gbHomeName').textContent = slotCount() === 2 ? slotName(0) : 'Home'; $('#gbAwayName').textContent = slotCount() === 2 ? slotName(1) : 'Away';
  $('#gbHome').title = names(0); $('#gbAway').title = names(1);
  updateHUD();
}
function slotPlayer(i) { const id = cfg.roster[i]; return id ? P.players().find((p) => p.id === id) : null; }
function slotName(i) { const p = slotPlayer(i); return p ? p.name : `Guest ${teamOfSlot(i) ? 'A' : 'H'}${slotCount() === 4 ? (i % 2) + 1 : ''}`; }
const teamName = (t) => (slotCount() === 2 ? slotName(t) : t ? 'Away' : 'Home');

// calls come one at a time so a foul + "fouled out" + "free throws" are all readable
function queueCall(kind, title, sub, ms, speak) {
  callQueue.push({ kind, title, sub, ms, speak });
  if (callQueue.length === 1) nextCall();
}
function nextCall() {
  const c = callQueue[0]; if (!c) return;
  showCall(c.kind, c.title, c.sub, c.ms); if (c.speak) say(c.speak, c.kind === 'bad' ? 300 : 0);
  setTimeout(() => { callQueue.shift(); nextCall(); }, c.ms + 150);
}

function handleGame(evs) {
  for (const e of evs) {
    if (TEST) TLOG.push({ t: +video.currentTime.toFixed(2), ...e });
    const nm = e.who != null ? esc(slotName(e.who)) : '';
    switch (e.type) {
      case 'possession': if (e.changed) toast(`${teamName(e.team)} ball`); break;
      case 'violation':
        whistle(0.6); showWave();
        queueCall('bad', e.title, `${nm} · ${esc(e.why)}<em>Ball to ${esc(teamName(1 - e.team))} · ${e.tip}</em>`, 2600, e.kind === 'travel' ? 'Traveling!' : 'Double dribble!');
        break;
      case 'foul': {
        whistle(0.5, e.result === 'shooting' ? 2 : 1); showWave();
        const res = e.result === 'shooting' ? (game.andOne ? 'Shooting foul. If it goes in: and-one!' : `${e.fts} free throws`) : e.result === 'bonus' ? 'Bonus: 2 free throws' : e.result === 'turnover' ? `Ball to ${esc(teamName(1 - e.team))}` : `Ball stays with ${esc(teamName(1 - e.team))}`;
        queueCall('bad', e.title, `${nm} on ${esc(slotName(e.on))} · ${e.pf} personal foul${e.pf > 1 ? 's' : ''}<em>${res} · ${e.signal}. ${e.tip}</em>`, 3000, e.title.toLowerCase());
        break;
      }
      case 'fouledOut': queueCall('bad', 'FOULED OUT', `${nm} has ${game.stats[e.who].pf} fouls<em>Every foul from now on gives 2 free throws</em>`, 2400, `${slotName(e.who)} fouled out`); break;
      case 'ftStart': queueCall('info', e.andOne ? 'AND ONE' : 'FREE THROWS', `${nm} shoots ${e.n}<em>Everyone else steps back</em>`, 2200, e.andOne ? 'And one!' : `${e.n} shots`); break;
      case 'ftResult': if (e.made) swish(); toast(`Free throw ${e.n} of ${e.of}: ${e.made ? 'good' : 'no good'}`, e.made); break;
      case 'points':
        if (e.kind !== 'ft') { swish(); queueCall('good', e.kind === 'three' ? 'THREE!' : 'BUCKET', `${nm} +${e.pts}`, 1400, e.kind === 'three' ? 'Three!' : 'Bucket!'); }
        break;
      case 'shotResult': if (!e.made) toast(`${slotName(e.who)}: miss`); break;
      case 'needResult': askShot(); break;
      case 'gameOver':
        whistle(0.9, 2); phase = 'done';
        queueCall('good', 'GAME!', `${esc(teamName(e.winner))} win${slotCount() === 2 ? 's' : ''} ${Math.max(...e.score)}-${Math.min(...e.score)}`, 2400, `Game! ${teamName(e.winner)} win${slotCount() === 2 ? 's' : ''}`);
        endTimer = setTimeout(endSession, 2800);
        break;
    }
  }
  updateHUD();
}
document.querySelectorAll('[data-pts]').forEach((b) => b.onclick = () => { if (!game) return; const [t, p] = b.dataset.pts.split(',').map(Number); handleGame(game.manualPoints(t, p)); });
document.querySelectorAll('[data-foul]').forEach((b) => b.onclick = () => { if (!game) return; handleGame(game.manualFoul(+b.dataset.foul)); $('#refPad').classList.add('hidden'); });
$('#cRef').onclick = () => $('#refPad').classList.toggle('hidden');

// name tags over each player's head
function placeTags() {
  const box = $('#tags'), mirror = stage.classList.contains('mirror');
  const W = stage.clientWidth, H = stage.clientHeight;
  slotPoses.forEach((lm, i) => {
    let el = box.querySelector(`[data-tag="${i}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'ptag'; el.dataset.tag = i; el.style.background = TEAM_COLORS[teamOfSlot(i)]; box.appendChild(el); }
    if (!lm || !lm[0]) { el.style.opacity = 0; return; }
    const x = mirror ? 1 - lm[0].x : lm[0].x, top = Math.min(...[0, 2, 5, 7, 8].map((k) => lm[k]?.y ?? 1));
    el.style.opacity = 1; el.style.left = (x * W) + 'px'; el.style.top = Math.max(22, (top - 0.03) * H) + 'px';
    const pf = game ? game.stats[i].pf : 0, html = `${esc(slotName(i))}${game ? `<i>${pf} PF</i>` : ''}`;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.classList.toggle('ball', !!game && game.poss === i);
  });
  box.querySelectorAll('[data-tag]').forEach((el) => { if (+el.dataset.tag >= slotPoses.length) el.remove(); });
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
function setHTML(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).innerHTML = v; } }
function trackText(bodies) {
  const src = lastBall ? (lastBall.src === 'ai' ? 'Ball ✓ AI' : 'Ball ✓') : 'Ball –';
  return `${bodies}   ${src}${cfg.hoop ? '   Hoop ✓' : ''}   ${fpsM.fps} fps`;
}
function updateHUD() {
  if (game) {
    setText('#gbHomeScore', String(game.score[0])); setText('#gbAwayScore', String(game.score[1]));
    const fouls = (t) => `Fouls ${game.teamFouls[t]}${GR.bonusAt && game.teamFouls[1 - t] >= GR.bonusAt ? '<span class="bonus">BONUS</span>' : ''}`;
    setHTML('#gbHomeFouls', fouls(0)); setHTML('#gbAwayFouls', fouls(1));
    setText('#gbClock', fmtTime(gameClock));
    const pt = game.poss != null ? teamOfSlot(game.poss) : -1;
    $('#gbHome').classList.toggle('has', pt === 0); $('#gbAway').classList.toggle('has', pt === 1);
    return;
  }
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
  setText('#trackPill', trackText(st.body ? 'Body ✓' : 'Body –'));
}

// ---------- end + summary ----------
function endSession() {
  clearTimeout(endTimer); endTimer = 0; closeAsk(); hideCall(); callQueue.length = 0;
  if (game) { const gm = game; game = null; phase = 'off'; stopCamera(); renderGameSummary(gm); go('sSummary'); return; }
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
  if (s.fouls >= 3) t.push('<b>Defense:</b> move your feet to stay in front. Hands up and off the other player.');
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
    ${res ? playerCardHTML(res, up, 'sumBar') : ''}
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
  animateBars(res ? [[res, 'sumBar']] : []);
  if (up) { whistle(0.3); setTimeout(() => say(`Level up! ${lv.name}!`), 400); }
  else if (res?.earned.length) say(`New badge: ${res.earned[0].name}`);
}
function playerCardHTML(res, up, barId, extra = '') {
  const lv = res.after;
  return `<div class="card" style="margin-bottom:14px"><div class="pc">${jersey(res.player)}<div class="who"><div class="name">${esc(res.player.name)}${extra}</div><div class="lvl">Level ${lv.n} · ${lv.name}${up ? ' <span class="pbflag">LEVEL UP</span>' : ''}</div>
    <div class="bar"><i id="${barId}" style="width:${(up ? 0 : res.before.pct * 100).toFixed(1)}%"></i></div><div class="xpline"><span>${res.player.xp.toLocaleString()} XP</span><span>${lv.next ? `${lv.toNext.toLocaleString()} to ${P.LEVELS[lv.n][1]}` : 'Max level'}</span></div></div></div></div>`;
}
function animateBars(list) {
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const [res, id] of list) { const b = document.getElementById(id); if (b) b.style.width = (res.after.pct * 100).toFixed(1) + '%'; } }));
}

function renderGameSummary(gm) {
  const n = gm.n, sc = gm.score;
  const winner = gm.winner ?? (sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1);
  const results = [];
  for (let i = 0; i < n; i++) {
    const pl = slotPlayer(i); if (!pl) continue;
    const st = gm.stats[i], team = gm.teamOf[i];
    const s = P.newSession('game');
    Object.assign(s, { seconds: gameClock, dribbles: st.dr, bestStreak: st.bestStreak, makes: st.fgm, shots: st.fga, travels: st.trv, doubles: st.dd, clean: st.clean,
      points: st.pts, fouls: st.pf, threes: st.tpm, won: winner === team, score: [sc[team], sc[1 - team]] });
    P.addXP(s, 'dribbles', st.dr * P.XP.dribble);
    P.addXP(s, 'shots', st.pts * P.XP.game.point);
    P.addXP(s, 'footwork', st.clean * P.XP.clean);
    P.addXP(s, 'drill', P.XP.game.played + (s.won ? P.XP.game.win : 0));
    results.push({ i, team, s, res: P.finish(s, pl.id) });
  }
  const row = (i) => {
    const st = gm.stats[i];
    return `<tr><td><span class="dot" style="background:${TEAM_COLORS[gm.teamOf[i]]}"></span>${esc(slotName(i))}${st.fouledOut ? ' <span class="bonus">OUT</span>' : ''}</td><td><b>${st.pts}</b></td><td>${st.fgm}/${st.fga}</td><td>${st.tpm}/${st.tpa}</td><td>${st.ftm}/${st.fta}</td><td>${st.pf}</td><td>${st.trv + st.dd}</td><td>${st.dr}</td></tr>`;
  };
  const tot = (t) => { const ids = [...Array(n).keys()].filter((i) => gm.teamOf[i] === t), S = (k) => ids.reduce((a, i) => a + gm.stats[i][k], 0); return `<tr class="tot"><td>${t ? 'AWAY' : 'HOME'}</td><td>${sc[t]}</td><td>${S('fgm')}/${S('fga')}</td><td>${S('tpm')}/${S('tpa')}</td><td>${S('ftm')}/${S('fta')}</td><td>${S('pf')}</td><td>${S('trv') + S('dd')}</td><td>${S('dr')}</td></tr>`; };
  const title = winner == null ? 'Tie game' : `${esc(teamName(winner))} win${n === 2 ? 's' : ''}`;
  $('#summary').innerHTML = `
    <div class="sumhead"><div class="k">${n === 2 ? '1 v 1' : '2 v 2'} · ${fmtTime(gameClock)}</div>
      <h2>${title}</h2>
      <div style="font:800 64px/1 var(--display);margin-top:6px"><span style="color:${TEAM_COLORS[0]}">${sc[0]}</span> <span style="color:var(--faint)">–</span> <span style="color:${TEAM_COLORS[1]}">${sc[1]}</span></div></div>
    <p class="label">Box score</p>
    <div class="card scroll-x" style="padding:6px 10px;margin-bottom:16px"><table class="box"><tr><th>Player</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>PF</th><th>TO</th><th>DRB</th></tr>
      ${[0, 1].map((t) => [...Array(n).keys()].filter((i) => gm.teamOf[i] === t).map(row).join('') + (n === 4 ? tot(t) : '')).join('')}</table>
      <p style="color:var(--faint);font-size:12px;margin:8px 0 4px">PF personal fouls · TO travels + double dribbles · DRB dribbles</p></div>
    ${results.length ? `<p class="label">XP</p>${results.map((r, k) => playerCardHTML(r.res, r.res.after.n > r.res.before.n, 'gbar' + k, ` <span style="color:var(--orange)">+${r.s.xp} XP</span>${r.s.won ? ' <span class="pbflag">WIN</span>' : ''}`)).join('')}` : '<p style="color:var(--dim)">Guests don\'t earn XP. Pick saved players in Game setup to level up.</p>'}
    ${results.some((r) => r.res.earned.length) ? `<p class="label" style="margin-top:16px">New badges</p><div class="badges">${results.flatMap((r) => r.res.earned.map((b) => badgeHTML({ ...b, desc: `${esc(r.res.player.name)}: ${b.desc}` }, true, true))).join('')}</div>` : ''}
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn primary" id="again">Rematch</button></div>`;
  $('#again').onclick = () => enterSession();
  animateBars(results.map((r, k) => [r.res, 'gbar' + k]));
  if (results.some((r) => r.res.after.n > r.res.before.n)) setTimeout(() => say('Level up!'), 600);
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
      <div class="stat"><b>${S.wins}-${S.games - S.wins}</b><span>Game record</span></div>
      <div class="stat"><b>${S.points}</b><span>Game points</span></div>
    </div>
    <p class="label" style="margin-top:20px">Personal bests</p>
    <div class="stats">${['dribble30', 'shoot10'].map((id) => `<div class="stat"><b>${p.bests[id] ?? '–'}</b><span>${modeName(id)}</span></div>`).join('')}</div>
    <p class="label" style="margin-top:20px">Badges · ${Object.keys(p.badges).length}/${P.BADGES.length}</p>
    <div class="badges">${P.BADGES.map((b) => badgeHTML(b, !!p.badges[b.id])).join('')}</div>
    <p class="label" style="margin-top:20px">Recent sessions</p>
    <div class="card scroll-x" style="padding:6px 10px">${p.history.length ? `<table class="hist"><tr><th>Date</th><th>Mode</th><th>Time</th><th>Dribbles</th><th>Streak</th><th>FG</th><th>Calls</th><th>XP</th></tr>
      ${p.history.map((h) => `<tr><td>${new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td>${modeName(h.mode)}${h.score ? ` ${h.won ? 'W' : 'L'} ${h.score[0]}-${h.score[1]}` : ''}</td><td>${fmtTime(h.seconds)}</td><td>${h.dribbles}</td><td>${h.bestStreak}</td><td>${h.makes}/${h.shots}</td><td>${h.travels + h.doubles}${h.fouls ? ` +${h.fouls} PF` : ''}</td><td>+${h.xp}</td></tr>`).join('')}</table>` : '<p style="color:var(--dim)">No sessions yet.</p>'}</div>`;
  $('#prSwitch').onclick = openPlayers;
  $('#prDel').onclick = () => { if (confirm(`Delete ${p.name} and all their progress?`)) { P.removePlayer(p.id); renderProfile(); } };
}

// ---------- boot ----------
renderHome();
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'live' && !videoSrc) $('#cPause').click(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if ($('#mPlayers').classList.contains('on')) $('#mPlayersClose').click(); else if ($('#mGame').classList.contains('on')) $('#mGameClose').click(); }
  if (!$('#sSession').classList.contains('on')) return;
  if (e.key === ' ' && (phase === 'live' || phase === 'paused')) { e.preventDefault(); $('#cPause').click(); }
});
const TSTATS = { frames: 0, pose: 0, ball: 0, ai: 0, ms: 0 }, TLOG = [];
if (TEST) window.__wh = { stats: TSTATS, log: TLOG, video, ref, tracker, finder, P, onEvent, handleGame, get game() { return game; }, get session() { return session; }, get phase() { return phase; }, get fps() { return fpsM.fps; }, endSession, go, enterSession, setMode: (m) => { mode = m; } };
