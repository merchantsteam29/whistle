// WHISTLE: screens, camera loop, HUD, calls, XP, and game mode.
import { Ref } from './ref.js';
import { BallTracker, BallFinder, DEFAULT_COLOR } from './ball.js';
import { createPose, createBallDetector, BONES } from './pose.js';
import { Game, Court } from './game.js';
import { sound, unlock, whistle, say, beep, swish, crowdOn, crowdOff, cheer, groan, buzzer } from './audio.js';
import { newDrillState, onDribble, SlideCounter, dailyChallenge, dailyStreak, todayStr, PRO, PLANS, REST_SECS } from './drills.js';
import { THEMES, WHISTLES, CELEBRATIONS, applyTheme, allowed, celebrate } from './styles.js';
import { Replay } from './replay.js';
import { saveCourt, shotChartHTML } from './shotchart.js';
import { buildReport, reportHTML, encodeReport, decodeReport } from './report.js';
import { BoardHost, joinBoard } from './board.js';
import { TrickRun, judge, TRICKS } from './tricks.js';
import { CHAPTERS, COACH, careerOf, passed, advance } from './career.js';
import { Calibrator } from './calib.js';
import { isoWeek, weekDrills, leaguePoints, leagueBoard, newLeagueCode, cleanCode } from './league.js';
import { VoiceCommands, voiceSupported } from './voicecmd.js';
import { framesToVideo, saveBadCall, listBadCalls, deleteBadCall, download } from './badcalls.js';
import * as P from './progress.js';
import { analyzeShot, FORM_NAMES } from './form.js';
import { Turns } from './turns.js';
import { Highlights } from './highlights.js';
import { renderDashboard } from './dashboard.js';
import { call, setPack, preview, PACKS } from './voice.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEBUG = Q.has('debug');
// a recorded video instead of the camera: ?src=clip.mp4 (tests) or "Ref a recorded video" in setup
let videoSrc = Q.get('src');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cfg = P.settings();
const teamColor = (t) => cfg.teams?.[t]?.color || ['#ff7a1a', '#3d9bff'][t];
const COLORS = ['#ff7a1a', '#3d9bff', '#e5484d', '#22c983', '#ffc53d', '#a259ff', '#f472b6', '#eef3fb'];

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
  if (id === 'sDash') renderDash();
  if (id === 'sReport' && !sharedReport) { $('#repBar').classList.remove('hidden'); renderReport(); }
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
  const card1 = (id, m, small) => {
    const pb = p?.bests?.[id];
    const right = m.game && p ? `<div class="pb">RECORD<em>${p.stats.wins}-${p.stats.games - p.stats.wins}</em></div>` : pb != null ? `<div class="pb">BEST<em>${pb}</em></div>` : '';
    return `<button class="mode ${id === mode ? 'sel' : ''}" data-mode="${id}"><div class="ic">${svg(IC[id] ? id : { horse: 'target', plan: 'cal', team: 'game', tricks: 'bolt', career: 'trophy' }[id] || (m.drill ? 'dribble30' : 'free'))}</div><div><b>${m.name}</b>${small ? '' : `<span>${m.desc}</span>`}</div>${right}</button>`;
  };
  const E = Object.entries(P.MODES);
  $('#modes').innerHTML = `<p class="mgroup">Play</p>${E.filter(([id, m]) => id === 'free' || m.game || m.turns || m.tricks || m.career).map(([id, m]) => card1(id, m)).join('')}
    <p class="mgroup">Drills</p><div class="drillgrid">${E.filter(([, m]) => m.drill).map(([id, m]) => card1(id, m, true)).join('')}</div>
    <p class="mgroup">Coach</p>${E.filter(([, m]) => m.plan || m.team).map(([id, m]) => card1(id, m)).join('')}`;
  const sel = P.MODES[mode];
  if (sel?.drill) $('#modes').insertAdjacentHTML('beforeend', `<p style="color:var(--dim);font-size:13px;margin:4px 2px 0">${esc(sel.desc)}${PRO[mode] ? ` · Pro: ${PRO[mode]}` : ''}</p>`);
  const ch = dailyChallenge(), done = p?.daily?.last === todayStr(), st = p ? dailyStreak(p) : 0;
  $('#daily').innerHTML = `<div class="daily ${done ? 'done' : ''}"><div class="fl">${done ? '✅' : '🔥'}</div><div style="flex:1"><b>Today's challenge</b><span>${esc(ch.text)}${st ? ` · ${st}-day streak` : ''}${done ? ' · done!' : ' · +50 XP'}</span></div>${done ? '' : `<button class="btn sm primary" id="dailyGo">Go</button>`}</div>`;
  const dg = $('#dailyGo'); if (dg) dg.onclick = () => { mode = ch.mode; renderHome(); $('#btnStart').click(); };
  if (p) { applyTheme(allowed(THEMES, p.style?.theme, P.levelOf(p.xp).n)); } else applyTheme('classic');
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; renderHome(); });
}
$('#btnStart').onclick = () => {
  unlock();
  if (mode === 'game') { openGameSetup(); return; }
  if (mode === 'horse') { openTurns(); return; }
  if (mode === 'plan') { if (!P.current()) { openPlayers(); return; } openPlans(); return; }
  if (mode === 'team') { openTeam(false); return; }
  if (mode === 'tricks') { openTeam(true); return; }
  if (mode === 'career') { if (!P.current()) { openPlayers(); return; } openCareer(); return; }
  if (mode === 'calib') { if (!P.current()) { openPlayers(); return; } enterSession(); return; }
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
  $('#gTeams').innerHTML = [0, 1].map((t) => `<div><input type="text" maxlength="14" data-tname="${t}" value="${esc(cfg.teams[t].name)}" style="width:100%"><div class="swatches">${COLORS.map((c) => `<button data-tcol="${t}" data-c="${c}" class="${cfg.teams[t].color === c ? 'on' : ''}" style="background:${c}" title="Team colour" aria-label="Team colour ${c}"></button>`).join('')}</div></div>`).join('');
  document.querySelectorAll('[data-tname]').forEach((i) => i.oninput = () => { cfg.teams[+i.dataset.tname].name = i.value.trim() || (+i.dataset.tname ? 'Away' : 'Home'); P.save(); });
  document.querySelectorAll('[data-tcol]').forEach((b) => b.onclick = () => { cfg.teams[+b.dataset.tcol].color = b.dataset.c; P.save(); renderGameSetup(); });
  $('#gClock').value = String(GR.shotClock || 0);
  $('#gTo').value = String(GR.toPoints); $('#gFoulOut').value = String(GR.foulOut); $('#gBonus').value = String(GR.bonusAt);
}
document.querySelectorAll('#gFormat button').forEach((b) => b.onclick = () => { GR.format = b.dataset.v; P.save(); renderGameSetup(); });
$('#gTo').onchange = () => { GR.toPoints = +$('#gTo').value; P.save(); };
$('#gFoulOut').onchange = () => { GR.foulOut = +$('#gFoulOut').value; P.save(); };
$('#gBonus').onchange = () => { GR.bonusAt = +$('#gBonus').value; P.save(); };
$('#gClock').onchange = () => { GR.shotClock = +$('#gClock').value; P.save(); };
$('#mGameClose').onclick = () => $('#mGame').classList.remove('on');
$('#gGo').onclick = () => {
  const ids = cfg.roster.slice(0, slotCount()).filter(Boolean);
  if (new Set(ids).size !== ids.length) { toast('The same player is picked twice'); return; }
  $('#mGame').classList.remove('on'); enterSession();
};

// ---------- settings ----------
function renderSettings() {
  $('#setVoiceCmd').checked = !!cfg.voiceCmd;
  const cp0 = P.current(); $('#calTxt').textContent = cp0?.calib ? `${cp0.name} was calibrated on ${new Date(cp0.calib.at).toLocaleDateString()} (step threshold ${cp0.calib.footV}, ball size ${cp0.calib.ballRR ?? 'auto'}). Run it again any time.` : 'A 1-minute setup (stand still, then dribble 5 times) that tunes step and ball detection to this player.';
  $('#setArena').checked = !!cfg.arena; $('#setGhost').value = cfg.ghost || 'pro'; $('#setSaver').checked = !!cfg.saver;
  if (cfg.offlineAt) $('#offTxt').textContent = `Ready offline since ${new Date(cfg.offlineAt).toLocaleDateString()}. Tap to refresh.`;
  $('#setSteps').value = String(cfg.stepsAllowed);
  $('#setWhistle').checked = cfg.whistle; $('#setVoice').checked = cfg.voice; $('#setVolume').value = cfg.volume;
  $('#setQuality').value = cfg.quality; $('#setSens').value = cfg.sensitivity; $('#setSkeleton').checked = cfg.skeleton; $('#setMirror').checked = cfg.mirror;
  $('#setAI').checked = cfg.aiBall; $('#setTrack').checked = !!cfg.trackView;
  $('#setPack').value = cfg.voicePack; $('#setVoiceDesc').textContent = PACKS[cfg.voicePack]?.desc || '';
  $('#setCarry').checked = cfg.carry; $('#setForm').checked = cfg.formCoach;
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
bindSetting('#setPack', 'voicePack', (el) => el.value);
bindSetting('#setCarry', 'carry', (el) => el.checked);
bindSetting('#setForm', 'formCoach', (el) => el.checked);
bindSetting('#setArena', 'arena', (el) => el.checked);
bindSetting('#setGhost', 'ghost', (el) => el.value);
bindSetting('#setSaver', 'saver', (el) => el.checked);
bindSetting('#setVoiceCmd', 'voiceCmd', (el) => el.checked);
$('#setVoiceCmd').addEventListener('change', () => { if (cfg.voiceCmd) { if (!voiceSupported()) { toast('Voice commands need Chrome or Edge'); cfg.voiceCmd = false; $('#setVoiceCmd').checked = false; P.save(); } else vc.start(); } else vc.stop(); });
$('#calBtn').onclick = () => { if (!P.current()) { openPlayers(); return; } mode = 'calib'; enterSession(); };
$('#badBtn').onclick = openBadCalls;
$('#offBtn').onclick = downloadOffline;
$('#setPack').addEventListener('change', () => { $('#setVoiceDesc').textContent = PACKS[cfg.voicePack]?.desc || ''; });
$('#packTry').onclick = () => { unlock(); preview(cfg.voicePack); };
$('#setBallReset').onclick = () => { cfg.ballColor = null; applySettings(); P.save(); renderSettings(); };
$('#setVolume').addEventListener('change', () => beep(880, 0.1));
function applySettings() {
  sound.whistle = cfg.whistle; sound.voice = cfg.voice; sound.volume = cfg.volume;
  ref.setOptions({ stepsAllowed: cfg.stepsAllowed });
  tracker.tol = cfg.sensitivity;
  tracker.setColor(cfg.ballColor || DEFAULT_COLOR);
  finder.autoColor = !cfg.ballColor; finder.useAI = cfg.aiBall;
  setPack(cfg.voicePack); ref.setOptions({ carry: cfg.carry });
  const cp = P.current(), lvl = cp ? P.levelOf(cp.xp).n : 1;
  sound.kind = allowed(WHISTLES, cp?.style?.whistle, lvl);
  const cal = cp?.calib; ref.setOptions({ footV: cal?.footV || 1, stepDist: cal?.stepDist || 0.22 }); finder.ballRR = cal?.ballRR || 0.27;
  replay.on = !cfg.saver;
}
function hsvCss(c) { return `hsl(${c.h.toFixed(0)} ${(c.s * 100).toFixed(0)}% ${(c.v * 50).toFixed(0)}%)`; }

// ---------- session state ----------
const video = $('#video'), canvas = $('#overlay'), g = canvas.getContext('2d'), stage = $('#stage');
const ref = new Ref({ stepsAllowed: cfg.stepsAllowed });
const tracker = new BallTracker();
const finder = new BallFinder(tracker);
const hl = new Highlights(video, canvas, stage);
const replay = new Replay(video);
const poseHist = [[], [], [], []], pendingForm = [];
let gameForm = [[], [], [], []], curT = 0, turns = null;
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
  const big = cfg.quality === 'accurate' && !cfg.saver;
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
  const dpr = cfg.saver ? 1 : Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const tags = $('#tags'); Object.assign(tags.style, { left: stage.style.left, top: stage.style.top, width: w + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
}
addEventListener('resize', layout);

async function enterSession() {
  go('sSession');
  phase = 'setup'; tapMode = 'ball'; hoopPts = []; session = null; game = null; lastCall = null; lastShot = null;
  court = new Court(isGame() ? slotCount() : 1);
  ref.reset(); finder.reset(); learn.done = false; learn.hits.length = 0; applySettings();
  hl.reset(); replay.clear(); slides.reset(); quietSince = 0; lastCallTitle = ''; turns = null; poseHist.forEach((h) => (h.length = 0)); pendingForm.length = 0; gameForm = [[], [], [], []];
  ['#turnBoard', '#turnBanner', '#formCard'].forEach((q) => $(q).classList.add('hidden'));
  ['#scoreboard', '#gameboard', '#poss', '#cPause', '#cWave', '#cFix', '#cAddShot', '#cRef', '#refPad', '#cEnd', '#ask', '#count'].forEach((s) => $(s).classList.add('hidden'));
  $('#setup').classList.remove('hidden'); $('#cBack').classList.remove('hidden'); $('#cFlip').classList.remove('hidden');
  $('#chkThree').classList.toggle('hidden', !isGame());
  $('#chkLane').classList.toggle('hidden', !isGame());
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

let skip = 0, quietSince = 0;
const slides = new SlideCounter();
function process(now) {
  if (cfg.saver && phase === 'live' && (skip++ & 1)) return; // battery saver: every other frame
  if (!pose || video.readyState < 2 || !video.videoWidth) return;
  const t0 = performance.now();
  const t = videoSrc ? video.currentTime / (Number(Q.get("slow")) || 1) : now / 1000; // ?slow=4 for slow-motion clips
  const aspect = video.videoWidth / video.videoHeight;
  let all = [];
  try { all = pose.detectAll(video, now); } catch (e) { all = []; }
  tracker.grab(video);
  slotPoses = court.assign(all.map((lm) => ({ lm, shirt: shirtOf(lm) })), t, aspect, stage.classList.contains('mirror'));
  lastPose = slotPoses[0] || null;
  replay.push(now, slotPoses, null, stage.classList.contains('mirror'));
  const people = slotPoses.filter(Boolean).map((lm) => personOf(lm, aspect));
  autoLearn(people[0], aspect);
  slotPoses.forEach((lm, i) => { if (!lm || i > 3) return; const h = poseHist[i]; h.push({ t, lm }); while (h.length && t - h[0].t > 2.5) h.shift(); });
  while (pendingForm.length && t >= pendingForm[0].due) { const f = pendingForm.shift(); formResult(f.who, analyzeShot(poseHist[f.who], f.t, aspect)); }
  finder.hoop = cfg.hoop;
  lastBall = finder.find(t, video, now, people, aspect);
  // speed: frames per second, and drop to Fast tracking if Accurate can't keep up
  fpsM.n++; if (now - fpsM.t0 > 1000) { fpsM.fps = Math.round((fpsM.n * 1000) / (now - fpsM.t0)); fpsM.n = 0; fpsM.t0 = now; checkSpeed(now); }
  if (TEST) { const S = TSTATS; S.frames++; if (lastPose) S.pose++; if (lastBall) S.ball++; if (lastBall?.src === 'ai') S.ai++; S.ms += performance.now() - t0; }
  if (phase === 'live') {
    curT = t;
    if (game) handleGame(game.update({ t, aspect, poses: slotPoses, ball: lastBall, hoop: cfg.hoop, threeLine: cfg.threeLine, lane: cfg.lane, bounds: liveBounds() }));
    else {
      for (const e of ref.update({ t, aspect, pose: lastPose, ball: lastBall, hoop: cfg.hoop, bounds: turns ? null : liveBounds() })) onEvent(e);
      if (TEST && Q.has('trace')) { const b = ref.body, f = (v) => v == null ? '-' : v.toFixed(2); TRACE.push(`${f(t)} ball ${lastBall ? f(lastBall.x) + ',' + f(lastBall.y) + ' r' + lastBall.r.toFixed(3) + ' ' + lastBall.src : '-'} hands ${b ? b.hands.map((h) => h ? f(h.X / aspect) + ',' + f(h.Y) : 'x').join(' ') : 'nobody'} S ${f(ref.S)} near ${ref.near} held ${ref.held} | ${finder.dbg}`); }
      const m = P.MODES[session ? session.mode : 'free'];
      if (session && session.mode === 'slides30' && ref.body) session.drill.slides = slides.push(ref.body.hip.X, ref.S);
      if (session?.tricks && lastPose && ref.S) { const m1 = session.tricks.body(Math.abs(lastPose[11].x - lastPose[12].x) * aspect, ref.S, t, ref.dribbling); if (m1) trickPop(m1); session.trickScore = session.tricks.score; }
      if (calib) calibFrame(t);
      if (session && !game && !turns) sideFrameTick(t);
      const limit = m.secs || session?.limit;
      if (session && limit && session.seconds >= limit && !endTimer) { session.seconds = limit; session.complete = true; whistle(0.7, 2); if (cfg.arena) buzzer(); call('time'); endTimer = setTimeout(endSession, 900); phase = 'done'; }
      // battery saver: nobody in view for a minute = pause
      if (cfg.saver && !videoSrc) { if (lastPose) quietSince = 0; else if (!quietSince) quietSince = now; else if (now - quietSince > 60000) { quietSince = 0; $('#cPause').click(); toast('Paused to save battery: nobody in view'); } }
    }
    updateHUD();
  } else if (phase === 'camlive') {
    streamSide(aspect);
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

// learn the ball's colour on its own when someone holds it in both hands (unless it was tapped)
const learn = { hits: [], done: false };
function autoLearn(p, aspect) {
  if (cfg.ballColor || learn.done || !p) return;
  const [a, b] = p.hands;
  if (!a || !b || Math.hypot((a.x - b.x) * aspect, a.y - b.y) > p.S * 0.95) { learn.hits.length = 0; return; }
  const c = tracker.learnFrom({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, p.S, aspect);
  if (!c) { learn.hits.length = 0; return; }
  learn.hits.push(c);
  if (learn.hits.length < 6) return;
  const h0 = learn.hits[0].h, close = learn.hits.every((x) => Math.abs(((x.h - h0 + 540) % 360) - 180) < 14);
  if (!close) { learn.hits.shift(); return; }
  const med = (k) => learn.hits.map((x) => x[k]).sort((m, n) => m - n)[3];
  tracker.setColor({ h: h0, s: med('s'), v: med('v') }); finder.autoColor = false;
  learn.done = true; learn.hits.length = 0;
  if (phase === 'setup') beep(1200, 0.08);
  toast('Got the ball. Colour learned', true);
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
  const face = lm[0] && (lm[0].visibility ?? 1) > 0.5 ? { x: lm[0].x, y: lm[0].y, r: Math.max(0.02, S * 0.22) } : null; // the head only: a ball held up to shoot sits right next to it
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
  const dline = (a, b, col, dash) => { g.setLineDash(dash ? [12 * dpr, 8 * dpr] : []); g.lineWidth = 3 * dpr; g.strokeStyle = col; g.beginPath(); g.moveTo(a.x * W, a.y * H); g.lineTo(b.x * W, b.y * H); g.stroke(); g.setLineDash([]); };
  if (cfg.bounds || (tapMode === 'bounds' && linePts.length)) {
    const b = cfg.bounds && tapMode !== 'bounds' ? cfg.bounds : null;
    if (b) { const dx = b.x2 - b.x1, dy = b.y2 - b.y1; dline({ x: b.x1 - dx * 3, y: b.y1 - dy * 3 }, { x: b.x2 + dx * 3, y: b.y2 + dy * 3 }, 'rgba(255,70,85,.85)', true); }
    for (const q of tapMode === 'bounds' ? linePts : []) { g.fillStyle = '#ff4655'; g.beginPath(); g.arc(q.x * W, q.y * H, 6 * dpr, 0, Math.PI * 2); g.fill(); }
  }
  if (isGame() && (cfg.lane || (tapMode === 'lane' && linePts.length))) {
    if (cfg.lane && tapMode !== 'lane') { g.fillStyle = 'rgba(61,155,255,.12)'; g.fillRect(cfg.lane.x1 * W, cfg.lane.y * H - H * 0.12, (cfg.lane.x2 - cfg.lane.x1) * W, H * 0.2); dline({ x: cfg.lane.x1, y: cfg.lane.y }, { x: cfg.lane.x2, y: cfg.lane.y }, 'rgba(61,155,255,.8)', true); }
    for (const q of tapMode === 'lane' ? linePts : []) { g.fillStyle = '#3d9bff'; g.beginPath(); g.arc(q.x * W, q.y * H, 6 * dpr, 0, Math.PI * 2); g.fill(); }
  }
  if (turns?.kind === 'world') {
    const st = turns.state();
    worldSpots().forEach((q, k) => { const cur = !st.done && k === st.spot; g.strokeStyle = cur ? '#ffc53d' : 'rgba(238,243,251,.5)'; g.lineWidth = (cur ? 5 : 2) * dpr; g.beginPath(); g.ellipse(q.x * W, q.y * H, 26 * dpr, 9 * dpr, 0, 0, Math.PI * 2); g.stroke(); });
  }
  if (turns?.spot) {
    const x = turns.spot.x * W, y = turns.spot.y * H;
    g.strokeStyle = '#ffc53d'; g.lineWidth = 4 * dpr; g.beginPath(); g.ellipse(x, y, 34 * dpr, 12 * dpr, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,197,61,.25)'; g.fill();
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
      const col = isGame() ? teamColor(teamOfSlot(i)) : 'rgba(238,243,251,.8)';
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
  const ballSet = !!cfg.ballColor || learn.done || ballDefaultChosen || ai;
  const seen = lastBall ? ` · <b style="color:var(--green);display:inline">ball seen${lastBall.src === 'ai' ? ' (AI)' : ''}</b>` : ' · <span style="color:var(--faint)">ball not seen</span>';
  const how = cfg.ballColor ? 'Colour learned from your tap.' : learn.done ? 'Colour learned automatically.' : ai ? 'The AI finds any ball. Tapping it helps colour tracking.' : 'Standard orange.';
  setChk('#chkBall', ballSet, tapMode === 'ball' && !ballSet, ballSet ? `<span class="swatch" style="background:${hsvCss(tracker.color)}"></span>${how}${seen}` : 'Hold the ball up in both hands for a second (or tap it) so WHISTLE learns your ball.' + seen);
  const hoopTxt = tapMode === 'hoop' ? (hoopPts.length ? 'Now tap the RIGHT edge of the rim.' : 'Tap the LEFT edge of the rim.') : cfg.hoop ? 'Hoop marked. Shots get scored automatically.' : 'For auto-scored shots: tap the left edge of the rim, then the right. Skip it and you mark shots yourself.';
  setChk('#chkHoop', !!cfg.hoop && tapMode !== 'hoop', tapMode === 'hoop', hoopTxt);
  $('#hoopMark').textContent = cfg.hoop ? 'Redo hoop' : 'Mark hoop';
  $('#hoopClear').classList.toggle('hidden', !cfg.hoop);
  setChk('#chkBounds', !!cfg.bounds && tapMode !== 'bounds', tapMode === 'bounds', tapMode === 'bounds' ? (linePts.length ? 'Now tap a second point further along the same line.' : 'Tap a point on the line, on the floor.') : cfg.bounds ? 'Marked. Stepping or bouncing past it with the ball is out.' : 'For out-of-bounds calls: tap two points along the line on the floor.');
  $('#boundsMark').textContent = cfg.bounds ? 'Redo line' : 'Mark sideline'; $('#boundsClear').classList.toggle('hidden', !cfg.bounds);
  if (isGame()) {
    setChk('#chkLane', !!cfg.lane && tapMode !== 'lane', tapMode === 'lane', tapMode === 'lane' ? (linePts.length ? 'Now tap the RIGHT edge of the paint.' : 'Tap the LEFT edge of the paint, on the floor.') : cfg.lane ? 'Marked. Standing in the paint for more than 3 seconds with your team on offense is a violation.' : 'For 3-second calls: tap the left edge of the paint on the floor, then the right edge.');
    $('#laneMark').textContent = cfg.lane ? 'Redo lane' : 'Mark lane'; $('#laneClear').classList.toggle('hidden', !cfg.lane);
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
let linePts = [];
$('#boundsMark').onclick = () => { tapMode = 'bounds'; linePts = []; updateSetup(); };
$('#boundsClear').onclick = () => { cfg.bounds = null; tapMode = 'ball'; P.save(); updateSetup(); };
$('#laneMark').onclick = () => { tapMode = 'lane'; linePts = []; updateSetup(); };
$('#laneClear').onclick = () => { cfg.lane = null; tapMode = 'ball'; P.save(); updateSetup(); };

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
  } else if (tapMode === 'bounds' || tapMode === 'lane') {
    linePts.push({ x: nx, y: ny });
    if (linePts.length === 2) {
      const [a, b] = linePts;
      if (tapMode === 'bounds') cfg.bounds = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, side: 0 };
      else cfg.lane = { x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), y: (a.y + b.y) / 2 };
      P.save(); tapMode = 'ball'; linePts = []; beep(1200, 0.08);
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
    clearInterval(iv); c.textContent = 'GO'; whistle(0.45); call('go', null, null, 500); setTimeout(() => c.classList.add('hidden'), 600);
    startLive();
  }, 800);
};

// the side of the sideline the players start on is "in"
function liveBounds() {
  const b = cfg.bounds; if (!b) return null;
  if (!b.side) {
    const a = (video.videoWidth / video.videoHeight) || 16 / 9;
    const lm = lastPose; let X = 0.5 * a, Y = 0.9;
    if (lm && lm[27] && lm[28]) { X = ((lm[27].x + lm[28].x) / 2) * a; Y = (lm[27].y + lm[28].y) / 2; }
    const ax = b.x1 * a, ay = b.y1, bx = b.x2 * a, by = b.y2;
    b.side = Math.sign((bx - ax) * (Y - ay) - (by - ay) * (X - ax)) || 1;
  }
  return b;
}
let courtSaved = false;
function startLive() {
  if (!courtSaved && !videoSrc) { saveCourt(video); courtSaved = true; }
  if (cfg.arena) crowdOn();
  $('#cReplay').classList.toggle('hidden', !!cfg.saver);
  $('#cBoard').classList.remove('hidden');
  $('#mic').classList.toggle('hidden', !vc.on);
  if (cfg.bounds) cfg.bounds.side = 0;
  liveBounds();
  if (videoSrc && !Q.get('src')) { video.currentTime = 0; video.play().catch(() => {}); }
  lastCall = null; lastShot = null; endTimer = 0; applySettings();
  phase = 'live';
  $('#cBack').classList.add('hidden');
  ['#cPause', '#cEnd'].forEach((s) => $(s).classList.remove('hidden'));
  $('#cPauseT').textContent = 'Pause';
  if (isGame()) { startGame(); return; }
  if (mode === 'horse') { startTurns(); return; }
  session = P.newSession(mode); ref.reset(); slides.reset();
  if (stationLimit) { session.limit = stationLimit; }
  if (session.mode === 'tricks') { session.tricks = new TrickRun(); }
  if (session.mode === 'calib') { startCalib(); }
  if (session.mode === 'weak30') { const wh = P.weakHand(P.current()); session.weak = wh; toast(`Weak hand: use your ${wh ? 'RIGHT' : 'LEFT'} hand`, true); }
  ['#scoreboard', '#poss'].forEach((s) => $(s).classList.remove('hidden'));
  $('#cAddShot').classList.toggle('hidden', !!cfg.hoop && session.mode !== 'shoot10');
  $('#sbClockLbl').textContent = P.MODES[mode].secs || stationLimit ? 'Left' : P.MODES[mode].shots ? 'Shots' : 'Time';
  $('#sbDrLbl').textContent = P.MODES[mode].unit && P.MODES[mode].unit !== 'makes' ? P.MODES[mode].unit : 'Dribbles';
  $('#ghost').classList.toggle('hidden', !(P.MODES[mode].secs && cfg.ghost !== 'off'));
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
$('#cEnd').onclick = () => { if (session || game || turns) endSession({ quit: true }); };
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
function answer(yes) { closeAsk(); if (game) handleGame(game.resolve(yes)); else if (turns) turnShot(yes); else if (yes) made(false); else missed(); }
function askShot() { $('#ask').classList.remove('hidden'); clearTimeout(askTimer); askTimer = setTimeout(() => answer(false), 7000); }
function closeAsk() { clearTimeout(askTimer); $('#ask').classList.add('hidden'); }

// ---------- single-player events -> stats, XP, calls ----------
function onEvent(e) {
  if (TEST) TLOG.push({ t: +video.currentTime.toFixed(2), ...e });
  logRecent(e);
  if (e.type === 'shotResult' && e.made == null && !turns && sideActive() && side.d.hoop) { clearTimeout(sideWait); sideWait = setTimeout(() => { sideWait = 0; askShot(); }, 3500); return; }
  if (turns) { turnEvent(e); return; }
  const s = session; if (!s) return;
  switch (e.type) {
    case 'dribble': {
      onDribble(s.drill, e, s.weak ?? 0);
      if (s.tricks) { const m1 = s.tricks.dribble(e, curT); if (m1) trickPop(m1); s.trickScore = s.tricks.score; }
      if (calib && calib.step === 'dribble') calib.addDribble(curT);
      s.dribbles++; s.bestStreak = Math.max(s.bestStreak, e.streak);
      P.addXP(s, 'dribbles', P.XP.dribble);
      const bonus = P.XP.streak[e.streak];
      if (bonus) { P.addXP(s, 'streaks', bonus); showCall('info', `${e.streak} IN A ROW`, `+${bonus} XP streak bonus`, 1100); call('streak', e.streak); }
      if (e.streak === 10) hl.begin('streak', playerLabel());
      if (e.streak === 25) hl.keep('25 IN A ROW', playerLabel());
      break;
    }
    case 'streakEnd': if (e.streak >= 10 && e.reason !== 'violation') toast(`${e.streak}-dribble streak`); if (hl.why === 'streak' && !hl.keepIt) hl.drop(); break;
    case 'clean': s.clean++; P.addXP(s, 'footwork', P.XP.clean); break;
    case 'shot':
      s.shotLog.push({ ...(feetSpot() || {}), m: false });
      if (hl.why !== 'shot' || !hl.recording) { hl.drop(); hl.begin('shot', playerLabel()); }
      if (cfg.formCoach && !e.manual) pendingForm.push({ who: 0, t: curT, due: curT + 0.75 });
      s.shots++; P.addXP(s, 'shots', P.XP.attempt);
      lastShot = { made: false, xp: 0, pending: true }; updateFix();
      break;
    case 'shotResult':
      if (e.made === true) made(false);
      else if (e.made === false) missed();
      else askShot();
      break;
    case 'violation': {
      if (e.kind === 'travel') s.travels++; else if (e.kind === 'double') s.doubles++; else s.other = (s.other || 0) + 1;
      s.makeRun = 0; lastCall = e;
      whistle(0.6);
      showCall('bad', e.title, `${e.why}<em>${e.signal} · ${e.tip}</em>`, 2600);
      call(e.kind, null, null, 350); if (cfg.arena) groan(); lastCallTitle = e.title; if (s.tricks) s.tricks.violations++;
      showWave();
      break;
    }
  }
}
function showWave() { ['#cWave', '#cBad'].forEach((q) => $(q).classList.remove('hidden')); clearTimeout(waveTimer); waveTimer = setTimeout(() => ['#cWave', '#cBad'].forEach((q) => $(q).classList.add('hidden')), 9000); }
function made(fixing) {
  const s = session; if (!s) return;
  if (!lastShot) lastShot = { made: false, xp: 0 };
  s.makes++; s.makeRun++; s.bestMakeRun = Math.max(s.bestMakeRun, s.makeRun);
  const bonus = s.makeRun >= 2 ? P.XP.makeStreak * (s.makeRun - 1) : 0;
  const xp = P.XP.make + Math.min(bonus, 30);
  P.addXP(s, 'shots', xp); lastShot.made = true; lastShot.pending = false; lastShot.xp = xp;
  const lastShotRec = s.shotLog[s.shotLog.length - 1]; if (lastShotRec) lastShotRec.m = true;
  if (cfg.arena) cheer(s.makeRun >= 3 ? 3 : 1); celebrateNow(s.makeRun >= 3 ? 2 : 1);
  swish(); showCall('good', s.makeRun >= 3 ? 'ON FIRE' : 'BUCKET', `+${xp} XP${s.makeRun >= 2 ? ` · ${s.makeRun} in a row` : ''}`, 1500);
  if (s.tricks) { const m1 = s.tricks.made(false, curT); trickPop(m1); s.trickScore = s.tricks.score; }
  if (!fixing) { if (s.makeRun >= 3) call('onfire', s.makeRun); else call('make'); hl.keep(s.makeRun >= 3 ? 'ON FIRE' : 'BUCKET!', playerLabel()); }
  updateFix(); checkShotDrill();
}
function missed() {
  const s = session; if (!s) return;
  const lr = s.shotLog[s.shotLog.length - 1]; if (lr && !lr.done) lr.done = true;
  s.makeRun = 0; if (lastShot) { lastShot.pending = false; lastShot.made = false; }
  if (hl.why === 'shot') hl.drop();
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
let gameShots = {};
function startGame() {
  gameShots = {};
  if (cfg.arena) setTimeout(() => {
    const intro = [0, 1].map((t) => [0, 1, 2, 3].slice(0, slotCount()).filter((i) => teamOfSlot(i) === t).map((i) => { const pl = slotPlayer(i); return (pl?.num ? `number ${pl.num}, ` : '') + slotName(i); }).join(', and '));
    say(`Ladies and gentlemen! For ${cfg.teams[0].name}: ${intro[0]}! And for ${cfg.teams[1].name}: ${intro[1]}! Let's play!`, 0, { rate: 1.1, pitch: 1.2 }); cheer(2);
  }, 400);
  game = new Game({ format: GR.format, rules: { toPoints: GR.toPoints, foulOut: GR.foulOut, bonusAt: GR.bonusAt, stepsAllowed: cfg.stepsAllowed, shotClock: GR.shotClock, carry: cfg.carry } });
  $('#gbHome').style.borderLeft = `4px solid ${teamColor(0)}`; $('#gbAway').style.borderRight = `4px solid ${teamColor(1)}`;
  court.lock(); gameClock = 0;
  ['#gameboard', '#cRef'].forEach((s) => $(s).classList.remove('hidden'));
  $('#gbTo').textContent = GR.toPoints ? `TO ${GR.toPoints}` : 'GAME';
  const names = (team) => [0, 1, 2, 3].slice(0, slotCount()).filter((i) => teamOfSlot(i) === team).map(slotName).join(' & ');
  $('#gbHomeName').textContent = slotCount() === 2 ? slotName(0) : cfg.teams[0].name; $('#gbAwayName').textContent = slotCount() === 2 ? slotName(1) : cfg.teams[1].name;
  $('#gbHome').title = names(0); $('#gbAway').title = names(1);
  updateHUD();
}
function slotPlayer(i) { const id = (mode === 'horse' ? cfg.troster : cfg.roster)[i]; return id ? P.players().find((p) => p.id === id) : null; }
function slotName(i) { if (turns?.names?.[i]) return turns.names[i]; const p = slotPlayer(i); if (p) return p.name; if (mode === 'horse') return `Player ${i + 1}`; return `Guest ${teamOfSlot(i) ? 'A' : 'H'}${slotCount() === 4 ? (i % 2) + 1 : ''}`; }
function slotLabel(i) { const p = slotPlayer(i); return p && p.num ? `#${p.num} ${p.name}` : slotName(i); }
const teamName = (t) => (slotCount() === 2 ? slotName(t) : cfg.teams[t].name);
const playerLabel = () => { const p = P.current(); return p ? (p.num ? `#${p.num} ` : '') + p.name : ''; };

// calls come one at a time so a foul + "fouled out" + "free throws" are all readable
function queueCall(kind, title, sub, ms, speak) {
  callQueue.push({ kind, title, sub, ms, speak });
  if (callQueue.length === 1) nextCall();
}
function nextCall() {
  const c = callQueue[0]; if (!c) return;
  showCall(c.kind, c.title, c.sub, c.ms); if (typeof c.speak === 'function') c.speak(); else if (c.speak) say(c.speak, c.kind === 'bad' ? 300 : 0);
  setTimeout(() => { callQueue.shift(); nextCall(); }, c.ms + 150);
}

function handleGame(evs) {
  for (const e of evs) {
    if (TEST) TLOG.push({ t: +video.currentTime.toFixed(2), ...e });
    const nm = e.who != null ? esc(slotName(e.who)) : '';
    switch (e.type) {
      case 'possession': if (e.changed && !e.steal) toast(`${teamName(e.team)} ball`); break;
      case 'assist': toast(`Assist: ${slotName(e.who)}`, true); break;
      case 'steal': toast(`Steal! ${slotName(e.who)}`, true); if (cfg.arena) cheer(2); break;
      case 'violation': lastCallTitle = e.title; if (cfg.arena) groan();
        whistle(0.6); showWave();
        queueCall('bad', e.title, `${nm} · ${esc(e.why)}<em>Ball to ${esc(teamName(1 - e.team))} · ${e.tip}</em>`, 2600, () => call(e.kind, null, null, 300));
        break;
      case 'foul': { lastCallTitle = e.title; if (cfg.arena) groan();
        whistle(0.5, e.result === 'shooting' ? 2 : 1); showWave();
        const res = e.result === 'shooting' ? (game.andOne ? 'Shooting foul. If it goes in: and-one!' : `${e.fts} free throws`) : e.result === 'bonus' ? 'Bonus: 2 free throws' : e.result === 'turnover' ? `Ball to ${esc(teamName(1 - e.team))}` : `Ball stays with ${esc(teamName(1 - e.team))}`;
        queueCall('bad', e.title, `${nm} on ${esc(slotName(e.on))} · ${e.pf} personal foul${e.pf > 1 ? 's' : ''}<em>${res} · ${e.signal}. ${e.tip}</em>`, 3000, () => call('foul', e.title.charAt(0) + e.title.slice(1).toLowerCase(), null, 300));
        break;
      }
      case 'fouledOut': queueCall('bad', 'FOULED OUT', `${nm} has ${game.stats[e.who].pf} fouls<em>Every foul from now on gives 2 free throws</em>`, 2400, `${slotName(e.who)} fouled out`); break;
      case 'ftStart': queueCall('info', e.andOne ? 'AND ONE' : 'FREE THROWS', `${nm} shoots ${e.n}<em>Everyone else steps back</em>`, 2200, () => (e.andOne ? call('andone') : call('ft', e.n))); break;
      case 'ftResult': if (e.made) swish(); toast(`Free throw ${e.n} of ${e.of}: ${e.made ? 'good' : 'no good'}`, e.made); break;
      case 'points':
        if (e.kind !== 'ft') { const gl = gameShots[e.who]?.[gameShots[e.who].length - 1]; if (gl) gl.m = true; if (cfg.arena) cheer(e.kind === 'three' ? 3 : 2); celebrateNow(e.kind === 'three' ? 2 : 1); }
        if (e.kind !== 'ft') { swish(); queueCall('good', e.kind === 'three' ? 'THREE!' : 'BUCKET', `${nm} +${e.pts}`, 1400, () => call(e.kind === 'three' ? 'three' : 'make')); hl.keep(e.kind === 'three' ? 'THREE!' : 'BUCKET!', slotLabel(e.who)); }
        break;
      case 'shotResult': if (!e.made) { toast(`${slotName(e.who)}: miss`); if (hl.why === 'shot') hl.drop(); } break;
      case 'shot': (gameShots[e.who] ||= []).push({ ...(feetSpotOf(slotPoses[e.who]) || {}), m: false }); if (hl.why !== 'shot' || !hl.recording) { hl.drop(); hl.begin('shot', slotLabel(e.who)); } if (cfg.formCoach) pendingForm.push({ who: e.who, t: curT, due: curT + 0.75 }); break;
      case 'needResult': askShot(); break;
      case 'gameOver':
        if (cfg.arena) { buzzer(); cheer(3); } celebrateNow(3);
        whistle(0.9, 2); phase = 'done';
        queueCall('good', 'GAME!', `${esc(teamName(e.winner))} win${slotCount() === 2 ? 's' : ''} ${Math.max(...e.score)}-${Math.min(...e.score)}`, 2400, () => call('win', teamName(e.winner)));
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
    if (!el) { el = document.createElement('div'); el.className = 'ptag'; el.dataset.tag = i; box.appendChild(el); }
    el.style.background = teamColor(teamOfSlot(i));
    if (!lm || !lm[0]) { el.style.opacity = 0; return; }
    const x = mirror ? 1 - lm[0].x : lm[0].x, top = Math.min(...[0, 2, 5, 7, 8].map((k) => lm[k]?.y ?? 1));
    el.style.opacity = 1; el.style.left = (x * W) + 'px'; el.style.top = Math.max(22, (top - 0.03) * H) + 'px';
    const pf = game ? game.stats[i].pf : 0, html = `${esc(slotLabel(i))}${game ? `<i>${pf} PF</i>` : ''}`;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.classList.toggle('ball', !!game && game.poss === i);
  });
  box.querySelectorAll('[data-tag]').forEach((el) => { if (+el.dataset.tag >= slotPoses.length) el.remove(); });
}

let callTimer = 0;
function showCall(kind, title, sub, ms) {
  if (board.on) board.call({ kind, title, sub: String(sub || '').replace(/<em>.*$/, '').replace(/<[^>]+>/g, '') });
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
  if (board.on) sendBoard();
  if (game) {
    setText('#gbHomeScore', String(game.score[0])); setText('#gbAwayScore', String(game.score[1]));
    const fouls = (t) => `Fouls ${game.teamFouls[t]}${GR.bonusAt && game.teamFouls[1 - t] >= GR.bonusAt ? '<span class="bonus">BONUS</span>' : ''}`;
    setHTML('#gbHomeFouls', fouls(0)); setHTML('#gbAwayFouls', fouls(1));
    setText('#gbClock', game.rules.shotClock ? String(Math.max(0, Math.ceil(game.clock))) : fmtTime(gameClock));
    setText('#gbTo', game.rules.shotClock ? 'SHOT CLOCK' : GR.toPoints ? `TO ${GR.toPoints}` : 'GAME');
    const pt = game.poss != null ? teamOfSlot(game.poss) : -1;
    $('#gbHome').classList.toggle('has', pt === 0); $('#gbAway').classList.toggle('has', pt === 1);
    return;
  }
  const s = session; if (!s) return;
  const m = P.MODES[s.mode];
  const lim = m.secs || s.limit;
  setText('#sbClock', lim ? String(Math.max(0, Math.ceil(lim - s.seconds))) : m.shots ? `${s.shots}/${m.shots}` : fmtTime(s.seconds));
  setText('#sbDribbles', String(m.unit && m.unit !== 'makes' ? m.score(s) : s.dribbles));
  if (m.secs && cfg.ghost !== 'off') {
    const mine = m.score(s), target = cfg.ghost === 'best' ? (P.current()?.bests?.[s.mode] ?? PRO[s.mode]) : PRO[s.mode];
    const gh = (target * Math.min(s.seconds, m.secs)) / m.secs, max = Math.max(target, mine, 1);
    setHTML('#ghost', `<div>YOU<i><u style="width:${(100 * mine) / max}%;background:var(--orange)"></u></i><b>${mine}</b></div><div>${cfg.ghost === 'best' ? 'BEST' : 'PRO'}<i><u style="width:${(100 * gh) / max}%;background:#8a9bb8"></u></i><b>${Math.floor(gh)}</b></div>`);
  }
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
function endSession(opts = {}) {
  clearTimeout(endTimer); endTimer = 0; closeAsk(); hideCall(); callQueue.length = 0;
  hl.drop(); crowdOff(); $('#ghost').classList.add('hidden');
  if (plan && session && !opts.quit) { stationDone(); return; }
  if (teamRun && session && !opts.quit) { teamTurnDone(); return; }
  if (calibDone) { calibDone = false; session = null; phase = 'off'; stopCamera(); go('sSettings'); return; }
  if (careerRun && !opts.career) { careerEnd(opts); return; }
  if (plan) { const pl = plan; plan = null; stationLimit = 0; const s0 = session; session = null; if (s0 && s0.seconds > 5) pl.results.push({ step: pl.steps[pl.i], s: s0, res: P.finish(s0) }); phase = 'off'; stopCamera(); renderPlanSummary(pl); go('sSummary'); return; }
  if (teamRun) { const tr = teamRun; teamRun = null; session = null; phase = 'off'; stopCamera(); renderTeamSummary(tr); go('sSummary'); return; }
  if (turns) { const tn = turns; turns = null; phase = 'off'; stopCamera(); renderTurnsSummary(tn); go('sSummary'); return; }
  if (game) { const gm = game; game = null; phase = 'off'; stopCamera(); renderGameSummary(gm); go('sSummary'); return; }
  const s = session; if (!s) return;
  session = null; phase = 'off';
  const res = P.finish(s);
  if (cfg.league && weekDrills().includes(s.mode) && res?.drill?.score != null) postLeague(false);
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
    ${drill?.daily ? `<div class="lvlup" style="border-color:var(--orange);color:var(--orange);background:#2a1a08">Daily challenge done! ${drill.daily.streak}-day streak · +${drill.daily.xp} XP</div>` : ''}
    ${s.beatPro ? `<div class="lvlup" style="border-color:var(--green);color:var(--green);background:#0d2a1d">You beat the pro (${PRO[s.mode]})!</div>` : ''}
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
    ${formSummaryHTML(s.formScores)}
    ${clipsHTML()}
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button>${drill?.score != null && boardsOn() && BOARDS[s.mode] ? '<button class="btn" id="postBoard">Post to today\'s leaderboard</button>' : ''}<button class="btn primary" id="again">Play again</button></div>`;
  $('#postBoard')?.addEventListener('click', () => openBoard(s.mode, drill.score, res.player.name));
  $('#again').onclick = () => enterSession();
  animateBars(res ? [[res, 'sumBar']] : []);
  if (up) { whistle(0.3); call('levelup', lv.name, null, 400); }
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
      points: st.pts, fouls: st.pf, threes: st.tpm, won: winner === team, score: [sc[team], sc[1 - team]], formScores: gameForm[i] || [] });
    P.addXP(s, 'dribbles', st.dr * P.XP.dribble);
    P.addXP(s, 'shots', st.pts * P.XP.game.point);
    P.addXP(s, 'footwork', st.clean * P.XP.clean);
    P.addXP(s, 'drill', P.XP.game.played + (s.won ? P.XP.game.win : 0));
    results.push({ i, team, s, res: P.finish(s, pl.id) });
  }
  const row = (i) => {
    const st = gm.stats[i];
    return `<tr><td><span class="dot" style="background:${teamColor(gm.teamOf[i])}"></span>${esc(slotName(i))}${st.fouledOut ? ' <span class="bonus">OUT</span>' : ''}</td><td><b>${st.pts}</b></td><td>${st.fgm}/${st.fga}</td><td>${st.tpm}/${st.tpa}</td><td>${st.ftm}/${st.fta}</td><td>${st.ast || 0}</td><td>${st.stl || 0}</td><td>${st.pf}</td><td>${st.trv + st.dd + (st.to || 0)}</td><td>${st.dr}</td></tr>`;
  };
  const tot = (t) => { const ids = [...Array(n).keys()].filter((i) => gm.teamOf[i] === t), S = (k) => ids.reduce((a, i) => a + gm.stats[i][k], 0); return `<tr class="tot"><td>${t ? 'AWAY' : 'HOME'}</td><td>${sc[t]}</td><td>${S('fgm')}/${S('fga')}</td><td>${S('tpm')}/${S('tpa')}</td><td>${S('ftm')}/${S('fta')}</td><td>${S('ast')}</td><td>${S('stl')}</td><td>${S('pf')}</td><td>${S('trv') + S('dd')}</td><td>${S('dr')}</td></tr>`; };
  const title = winner == null ? 'Tie game' : `${esc(teamName(winner))} win${n === 2 ? 's' : ''}`;
  $('#summary').innerHTML = `
    <div class="sumhead"><div class="k">${n === 2 ? '1 v 1' : '2 v 2'} · ${fmtTime(gameClock)}</div>
      <h2>${title}</h2>
      <div style="font:800 64px/1 var(--display);margin-top:6px"><span style="color:${teamColor(0)}">${sc[0]}</span> <span style="color:var(--faint)">–</span> <span style="color:${teamColor(1)}">${sc[1]}</span></div></div>
    <p class="label">Box score</p>
    <div class="card scroll-x" style="padding:6px 10px;margin-bottom:16px"><table class="box"><tr><th>Player</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>AST</th><th>STL</th><th>PF</th><th>TO</th><th>DRB</th></tr>
      ${[0, 1].map((t) => [...Array(n).keys()].filter((i) => gm.teamOf[i] === t).map(row).join('') + (n === 4 ? tot(t) : '')).join('')}</table>
      <p style="color:var(--faint);font-size:12px;margin:8px 0 4px">AST assists · STL steals · PF personal fouls · TO violations · DRB dribbles</p></div>
    ${results.length ? `<p class="label">XP</p>${results.map((r, k) => playerCardHTML(r.res, r.res.after.n > r.res.before.n, 'gbar' + k, ` <span style="color:var(--orange)">+${r.s.xp} XP</span>${r.s.won ? ' <span class="pbflag">WIN</span>' : ''}`)).join('')}` : '<p style="color:var(--dim)">Guests don\'t earn XP. Pick saved players in Game setup to level up.</p>'}
    ${results.some((r) => r.res.earned.length) ? `<p class="label" style="margin-top:16px">New badges</p><div class="badges">${results.flatMap((r) => r.res.earned.map((b) => badgeHTML({ ...b, desc: `${esc(r.res.player.name)}: ${b.desc}` }, true, true))).join('')}</div>` : ''}
    ${clipsHTML()}
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
    <p class="label" style="margin-top:20px">Ref style · unlock more by levelling up</p>
    ${[['theme', 'Scoreboard theme', THEMES], ['whistle', 'Whistle', WHISTLES], ['celebrate', 'Celebration', CELEBRATIONS]].map(([k, n, list]) => `<p style="margin:10px 0 6px;font-weight:600">${n}</p><div class="stylegrid">${list.map((it) => `<button data-style="${k}" data-v="${it.id}" class="${(p.style?.[k] || list[0].id) === it.id ? 'on' : ''}" ${it.lvl > L.n ? 'disabled' : ''}><b>${it.name}</b><span>${it.lvl > L.n ? 'Unlocks at level ' + it.lvl : 'Unlocked'}</span></button>`).join('')}</div>`).join('')}
    <div style="margin-top:20px">${shotChartHTML(p.shotLog.slice(-200))}</div>
    <p class="label" style="margin-top:20px">Recent sessions</p>
    <div class="card scroll-x" style="padding:6px 10px">${p.history.length ? `<table class="hist"><tr><th>Date</th><th>Mode</th><th>Time</th><th>Dribbles</th><th>Streak</th><th>FG</th><th>Calls</th><th>XP</th></tr>
      ${p.history.map((h) => `<tr><td>${new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td>${modeName(h.mode)}${h.score ? ` ${h.won ? 'W' : 'L'} ${h.score[0]}-${h.score[1]}` : ''}</td><td>${fmtTime(h.seconds)}</td><td>${h.dribbles}</td><td>${h.bestStreak}</td><td>${h.makes}/${h.shots}</td><td>${h.travels + h.doubles}${h.fouls ? ` +${h.fouls} PF` : ''}</td><td>+${h.xp}</td></tr>`).join('')}</table>` : '<p style="color:var(--dim)">No sessions yet.</p>'}</div>`;
  $('#prSwitch').onclick = openPlayers;
  document.querySelectorAll('[data-style]').forEach((b) => b.onclick = () => {
    P.setStyle(p, b.dataset.style, b.dataset.v); applySettings();
    if (b.dataset.style === 'theme') applyTheme(b.dataset.v);
    if (b.dataset.style === 'whistle') { unlock(); whistle(0.4); }
    if (b.dataset.style === 'celebrate') celebrate(b.dataset.v, 1);
    renderProfile();
  });
  $('#prDel').onclick = () => { if (confirm(`Delete ${p.name} and all their progress?`)) { P.removePlayer(p.id); renderProfile(); } };
}

// ---------- shooting form coach ----------
let formTimer = 0;
function formResult(who, r) {
  if (!r) return;
  if (game) gameForm[who]?.push(r.score);
  else if (session) { session.formScores.push(r.score); if (r.score >= 8) P.addXP(session, 'footwork', 3); }
  else if (turns) (turnForm[who] ||= []).push(r.score);
  const el = $('#formCard');
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="label" style="margin:0">Shot form${game || turns ? ' · ' + esc(slotName(who)) : ''}</span><span class="sc">${r.score}<small style="font-size:16px;color:var(--dim)">/10</small></span></div>
    <div class="row4">${Object.entries(r.parts).map(([k, v]) => `<div><i><u style="width:${Math.round(v * 100)}%"></u></i>${FORM_NAMES[k]}</div>`).join('')}</div><p>${esc(r.tip)}</p>`;
  el.classList.remove('hidden'); clearTimeout(formTimer); formTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}
function formSummaryHTML(scores) {
  if (!scores || !scores.length) return '';
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return `<div class="card" style="margin-top:16px"><p class="label">Shooting form</p><div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap"><span style="font:800 40px/1 var(--display);color:var(--orange)">${avg.toFixed(1)}<small style="font-size:18px;color:var(--dim)">/10 average</small></span><span style="color:var(--dim)">${scores.length} shot${scores.length > 1 ? 's' : ''} scored · best ${Math.max(...scores)}/10</span></div></div>`;
}

// ---------- highlight clips ----------
function clipsHTML() {
  if (!hl.clips.length) return '';
  return `<p class="label" style="margin-top:20px">Highlights</p><div class="clips">${hl.clips.map((c, i) => `<div class="clip"><video src="${c.url}" controls playsinline muted preload="metadata"></video><div><b>${esc(c.caption)}</b><a class="btn sm" href="${c.url}" download="whistle-${i + 1}-${esc(c.caption.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.${c.ext}">Download</a></div></div>`).join('')}</div>`;
}

// ---------- leaderboards + sync (Game Library accounts) ----------
const boardsOn = () => !!window.GameSync && !TEST;
const today = () => new Date().toISOString().slice(0, 10);
const BOARDS = { dribble30: { id: 'handles30', name: 'Handles 30' }, shoot10: { id: 'tenshots', name: 'Ten Shots' } };
function openBoard(modeId, score, who) {
  const b = BOARDS[modeId]; if (!b || !boardsOn()) return;
  GameSync.board(`${b.id}-${today()}`, `${b.name} · today`, score != null ? { score, info: who || '' } : undefined);
}
$('#btnBoards').onclick = () => {
  if (!boardsOn()) { toast('Leaderboards need the internet'); return; }
  const w = document.createElement('div'); w.className = 'modal on';
  w.innerHTML = `<div class="card" style="width:min(380px,100%)"><div class="top" style="margin-bottom:12px"><h2 style="font-size:24px">Leaderboards</h2><button class="btn sm" data-x>Close</button></div>
    <p style="color:var(--dim);margin-top:0">Today's best scores from everyone playing WHISTLE. Finish a drill, then tap "Post to today's leaderboard".</p>
    <div style="display:grid;gap:8px">${Object.entries(BOARDS).map(([m, b]) => `<button class="btn" data-b="${m}">${b.name} · today</button>`).join('')}</div></div>`;
  document.body.appendChild(w);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-x]')) w.remove(); const b = e.target.closest('[data-b]'); if (b) { w.remove(); openBoard(b.dataset.b); } });
};
$('#btnSync').onclick = () => { if (window.GameSync && !TEST) GameSync.open(); else toast('Sync needs the internet'); };

// ---------- coach dashboard ----------
let dashPid = null, dashRange = 20;
function renderDash() {
  setTimeout(() => { const pl = P.players().find((x) => x.id === (dashPid || P.current()?.id)); if (pl && $('#dash')) $('#dash').insertAdjacentHTML('beforeend', `<div style="margin-top:14px">${shotChartHTML(pl.shotLog.slice(-200))}</div>`); });
  renderDashboard($('#dash'), P.players(), dashPid || P.current()?.id, dashRange, (pid, range) => { dashPid = pid; dashRange = range; renderDash(); });
}

// ---------- HORSE / Knockout ----------
const TR = cfg.turnRules;
let turnForm = {};
function openTurns() { renderTurnsSetup(); $('#mTurns').classList.add('on'); }
function renderTurnsSetup() {
  document.querySelectorAll('#tKind button').forEach((b) => b.classList.toggle('on', b.dataset.v === TR.kind));
  document.querySelectorAll('#tWord button').forEach((b) => b.classList.toggle('on', b.dataset.v === TR.word));
  document.querySelectorAll('#tN button').forEach((b) => b.classList.toggle('on', +b.dataset.v === TR.n));
  $('#tWordRow').classList.toggle('hidden', TR.kind !== 'horse');
  $('#tKindDesc').textContent = TR.kind === 'horse' ? 'Make a shot, everyone copies it. Miss the copy = a letter.' : 'Everyone shoots each round. Miss when someone made it = out.';
  const players = P.players();
  cfg.troster = Array.from({ length: TR.n }, (_, i) => cfg.troster[i] ?? null);
  $('#tRoster').innerHTML = Array.from({ length: TR.n }, (_, i) => `<select data-tslot="${i}"><option value="">Player ${i + 1} (guest, no XP)</option>${players.map((p) => `<option value="${p.id}" ${cfg.troster[i] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`).join('');
  document.querySelectorAll('[data-tslot]').forEach((sel) => sel.onchange = () => { cfg.troster[+sel.dataset.tslot] = sel.value || null; P.save(); });
}
document.querySelectorAll('#tKind button').forEach((b) => b.onclick = () => { TR.kind = b.dataset.v; P.save(); renderTurnsSetup(); });
document.querySelectorAll('#tWord button').forEach((b) => b.onclick = () => { TR.word = b.dataset.v; P.save(); renderTurnsSetup(); });
document.querySelectorAll('#tN button').forEach((b) => b.onclick = () => { TR.n = +b.dataset.v; P.save(); renderTurnsSetup(); });
$('#mTurnsClose').onclick = () => $('#mTurns').classList.remove('on');
$('#tGo').onclick = () => {
  const ids = cfg.troster.slice(0, TR.n).filter(Boolean);
  if (new Set(ids).size !== ids.length) { toast('The same player is picked twice'); return; }
  $('#mTurns').classList.remove('on'); enterSession();
};
function startTurns() {
  const cr = careerRun && CHAPTERS[careerRun.ch];
  turns = cr?.rival ? new Turns({ kind: cr.mode === 't21' ? 't21' : 'horse', players: 2, word: 'HORSE', ghosts: { 1: cr.rival.pct } }) : new Turns({ kind: TR.kind, players: TR.n, word: TR.word });
  turns.names = cr?.rival ? [P.current()?.name || 'You', cr.rival.name] : null; turnForm = {}; turnsT0 = performance.now();
  ref.reset();
  ['#turnBoard', '#turnBanner', '#cAddShot'].forEach((q) => $(q).classList.remove('hidden'));
  turnUI(true);
}
let turnsT0 = 0;
function turnUI(speak) {
  const st = turns.state();
  $('#turnBoard').innerHTML = Array.from({ length: turns.n }, (_, i) => {
    const mid = turns.kind === 'horse' ? `<span>${[...turns.word].map((ch, k) => (k < turns.letters[i] ? ch : `<i>${ch}</i>`)).join('')}</span>`
      : turns.kind === 't21' ? `<span style="color:var(--text);letter-spacing:.04em">${turns.score[i]}</span>`
      : turns.kind === 'world' ? `<span style="letter-spacing:.1em;color:var(--orange)">${Array.from({ length: turns.spots }, (_, k) => (k < turns.pos[i] ? '●' : '<i>○</i>')).join('')}</span>`
      : `<span style="letter-spacing:.05em;color:${turns.out[i] ? 'var(--red)' : 'var(--green)'}">${turns.out[i] ? 'OUT' : 'IN'}</span>`;
    return `<div class="tb-p ${st.who === i ? 'cur' : ''} ${turns.out[i] ? 'out' : ''}"><b>${esc(slotName(i))}</b>${mid}</div>`;
  }).join('');
  if (st.done) { $('#turnBanner').classList.add('hidden'); return; }
  const nm = slotName(st.who);
  const what = st.role === 'set' ? 'Set the shot' : st.role === 'match' ? 'Match it' : st.role === 'long' ? `Long shot · ${st.score}` : st.role === 'tip' ? 'Tip-in for 1' : st.role === 'spot' ? `Spot ${st.spot + 1} of ${turns.spots}` : `Round ${st.round}`;
  const sub = st.role === 'set' ? 'Shoot from anywhere. Make it and everyone has to copy it.' : st.role === 'match' ? 'Shoot from the yellow spot.'
    : st.role === 'long' ? 'Worth 2 (3 behind the line). Make it to earn a tip-in. Exactly 21 wins; over drops you to 13.' : st.role === 'tip' ? 'Close shot worth 1. Make it and shoot long again.'
    : st.role === 'spot' ? 'Make it from the glowing spot to move on. Miss and the next player goes.' : 'Everyone shoots from the same spot. Miss when someone made it and you are out.';
  $('#turnBanner').innerHTML = `${esc(nm)} · ${what}<small>${sub}</small>`;
  if (speak && !st.ghost) call(st.role === 'match' ? 'match' : 'setshot', nm, null, 400);
  if (st.ghost) ghostTurn(st);
}
function feetSpot() {
  const lm = lastPose; if (!lm || !lm[27] || !lm[28]) return null;
  return { x: (lm[27].x + lm[28].x) / 2, y: Math.max(lm[27].y, lm[28].y) };
}
let turnShotSpot = null;
function turnEvent(e) {
  if (e.type === 'shot') {
    turnShotSpot = feetSpot(); (turnShots[turns.state().who] ||= []).push({ ...(turnShotSpot || {}), m: false });
    if (hl.why !== 'shot' || !hl.recording) { hl.drop(); hl.begin('shot', slotName(turns.state().who)); }
    if (cfg.formCoach && !e.manual) pendingForm.push({ who: turns.state().who, t: curT, due: curT + 0.75 });
  } else if (e.type === 'shotResult') {
    if (e.made == null) askShot(); else turnShot(e.made);
  }
}
function turnShot(made, extra) {
  if (!extra && turns.kind === 't21') extra = { three: isThreeSpot(turnShotSpot || feetSpot()) };
  const who = turns.state().who, nm = slotName(who);
  const tl = turnShots[who]?.[turnShots[who].length - 1]; if (tl && made) tl.m = true;
  if (made) { if (cfg.arena) cheer(1); celebrateNow(1); } else if (cfg.arena) groan();
  if (made) { swish(); hl.keep('BUCKET!', nm); } else if (hl.why === 'shot') hl.drop();
  let speak = true;
  for (const e of turns.shot(made, turnShotSpot || feetSpot(), extra || {})) {
    if (e.type === 'points') toast(`${slotName(e.who)}: +${e.pts} (${e.total})`, true);
    if (e.type === 'bust') { showCall('bad', 'BUST', `${esc(slotName(e.who))} went over 21 and drops to 13`, 1800); speak = false; }
    if (e.type === 'advance') toast(`${slotName(e.who)}: spot ${e.pos} ✓`, true);
    if (e.type === 'set') { showCall('good', 'SHOT SET', `${esc(nm)} made it. Everyone has to match it.`, 1600); call('make'); speak = false; }
    else if (e.type === 'shotDone' && made && turns.kind !== 'horse') { showCall('good', 'BUCKET', esc(nm), 1100); }
    else if (e.type === 'letter') { whistle(0.3); showCall('bad', e.letters, `${esc(slotName(e.who))} missed the match`, 1800); call('letter', slotName(e.who), e.letters); speak = false; }
    else if (e.type === 'out') { setTimeout(() => { showCall('bad', 'OUT', `${esc(slotName(e.who))} is out`, 1600); call('knocked', slotName(e.who)); }, 1900); speak = false; }
    else if (e.type === 'replay') toast('Nobody made it. Everyone stays in');
    else if (e.type === 'win') {
      setTimeout(() => { whistle(0.9, 2); showCall('good', 'WINNER', esc(slotName(e.who)), 2600); call('win', slotName(e.who)); }, 1800);
      phase = 'done'; endTimer = setTimeout(endSession, 4800);
    }
  }
  turnShotSpot = null;
  turnUI(speak && !turns.winner);
}
function renderTurnsSummary(tn) {
  const secs = (performance.now() - turnsT0) / 1000, results = [];
  for (let i = 0; i < tn.n; i++) {
    const pl = slotPlayer(i); if (!pl) continue;
    const s = P.newSession('horse');
    Object.assign(s, { seconds: secs, makes: tn.makes[i], shots: tn.shots[i], won: tn.winner === i, formScores: turnForm[i] || [] });
    P.addXP(s, 'shots', tn.makes[i] * 10 + tn.shots[i] * 2);
    P.addXP(s, 'drill', P.XP.game.played + (s.won ? P.XP.game.win : 0));
    results.push({ i, s, res: P.finish(s, pl.id) });
  }
  $('#summary').innerHTML = `
    <div class="sumhead"><div class="k">${{ horse: tn.word, t21: '21', world: 'Around the World', knockout: 'Knockout' }[tn.kind]} · ${tn.n} players · ${fmtTime(secs)}</div>
      <h2>${tn.winner != null ? esc(slotName(tn.winner)) + ' wins' : 'Game over'}</h2></div>
    <div class="card scroll-x" style="padding:6px 10px;margin-bottom:16px"><table class="box"><tr><th>Player</th><th>Makes</th><th>Shots</th><th>${tn.kind === 'horse' ? 'Letters' : 'Result'}</th></tr>
      ${Array.from({ length: tn.n }, (_, i) => `<tr><td>${esc(slotName(i))}${tn.winner === i ? ' <span class="pbflag">WIN</span>' : ''}</td><td>${tn.makes[i]}</td><td>${tn.shots[i]}</td><td>${tn.kind === 'horse' ? (tn.word.slice(0, tn.letters[i]) || '–') : tn.kind === 't21' ? tn.score[i] + ' pts' : tn.kind === 'world' ? tn.pos[i] + ' / ' + tn.spots + ' spots' : tn.out[i] ? 'Out' : 'Last standing'}</td></tr>`).join('')}</table></div>
    ${results.length ? `<p class="label">XP</p>${results.map((r, k) => playerCardHTML(r.res, r.res.after.n > r.res.before.n, 'tbar' + k, ` <span style="color:var(--orange)">+${r.s.xp} XP</span>`)).join('')}` : '<p style="color:var(--dim)">Guests don\'t earn XP. Pick saved players to level up.</p>'}
    ${results.some((r) => r.res.earned.length) ? `<p class="label" style="margin-top:16px">New badges</p><div class="badges">${results.flatMap((r) => r.res.earned.map((b) => badgeHTML({ ...b, desc: `${esc(r.res.player.name)}: ${b.desc}` }, true, true))).join('')}</div>` : ''}
    ${clipsHTML()}
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn primary" id="again">Play again</button></div>`;
  $('#again').onclick = () => enterSession();
  animateBars(results.map((r, k) => [r.res, 'tbar' + k]));
}

// ---------- celebrations, replay, helpers ----------
let lastCallTitle = '';
function celebrateNow(power) { const cp = P.current(); if (!cp) return; celebrate(allowed(CELEBRATIONS, cp.style?.celebrate, P.levelOf(cp.xp).n), power); }
function feetSpotOf(lm) { if (!lm || !lm[27] || !lm[28]) return null; return { x: (lm[27].x + lm[28].x) / 2, y: Math.max(lm[27].y, lm[28].y) }; }
let turnShots = {};
$('#cReplay').onclick = () => {
  const wasLive = phase === 'live'; if (wasLive) $('#cPause').click();
  const cols = slotPoses.map((_, i) => (isGame() ? teamColor(teamOfSlot(i)) : '#eef3fb'));
  if (!replay.open(lastCallTitle, cols)) { toast('Nothing to replay yet'); if (wasLive) $('#cPause').click(); return; }
  const iv = setInterval(() => { if (!document.querySelector('.replay')) { clearInterval(iv); if (wasLive && phase === 'paused') $('#cPause').click(); } }, 300);
};

// ---------- offline: fetch every file once so the service worker keeps a copy ----------
async function downloadOffline() {
  const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const M = 'https://storage.googleapis.com/mediapipe-models/';
  const urls = [V + '/vision_bundle.mjs', V + '/wasm/vision_wasm_internal.js', V + '/wasm/vision_wasm_internal.wasm', V + '/wasm/vision_wasm_nosimd_internal.js', V + '/wasm/vision_wasm_nosimd_internal.wasm',
    M + 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', M + 'pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', ...['js/main.js', 'js/ref.js', 'js/ball.js', 'js/pose.js', 'js/game.js', 'js/form.js', 'js/turns.js', 'js/drills.js', 'js/styles.js', 'js/replay.js', 'js/shotchart.js', 'js/report.js', 'js/board.js', 'js/voice.js', 'js/audio.js', 'js/highlights.js', 'js/dashboard.js', 'js/progress.js', 'js/tricks.js', 'js/career.js', 'js/calib.js', 'js/league.js', 'js/voicecmd.js', 'js/badcalls.js', 'sync.js', 'install.js', 'index.html']];
  if (cfg.aiBall) urls.push(M + 'object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite');
  const btn = $('#offBtn'), txt = $('#offTxt'); btn.disabled = true;
  let ok = 0, bytes = 0;
  for (const u of urls) {
    txt.textContent = `Downloading ${ok + 1} of ${urls.length}…`;
    try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) { bytes += (await r.blob()).size; ok++; } } catch { /* offline right now */ }
  }
  btn.disabled = false;
  if (ok === urls.length && navigator.serviceWorker?.controller) { cfg.offlineAt = Date.now(); P.save(); txt.textContent = `Ready offline (${(bytes / 1e6).toFixed(0)} MB saved on this device).`; }
  else txt.textContent = navigator.serviceWorker?.controller ? `Got ${ok} of ${urls.length} files. Connect to the internet and try again.` : 'Install the app (or reload once) first, then download again.';
}

// ---------- practice plans ----------
let plan = null, stationLimit = 0;
function openPlans() {
  $('#planList').innerHTML = Object.entries(PLANS).map(([id, pl]) => `<button class="mode" data-plan="${id}"><div class="ic">${svg('cal')}</div><div><b>${pl.name}</b><span>${pl.desc} · ${pl.steps.length} stations</span></div></button>`).join('');
  document.querySelectorAll('[data-plan]').forEach((b) => b.onclick = () => { $('#mPlan').classList.remove('on'); startPlan(b.dataset.plan); });
  $('#mPlan').classList.add('on');
}
$('#mPlanClose').onclick = () => $('#mPlan').classList.remove('on');
function startPlan(id) {
  const pl = PLANS[id]; plan = { id, name: pl.name, steps: pl.steps, i: 0, results: [] };
  setStation(); enterSession();
}
function setStation() { const st = plan.steps[plan.i]; mode = st.mode; stationLimit = st.secs || 0; }
function stationDone() {
  const s0 = session; session = null; phase = 'off';
  plan.results.push({ step: plan.steps[plan.i], s: s0, res: P.finish(s0) });
  plan.i++;
  if (plan.i >= plan.steps.length) { const pl = plan; plan = null; stationLimit = 0; stopCamera(); renderPlanSummary(pl); go('sSummary'); return; }
  setStation();
  const st = plan.steps[plan.i], m = P.MODES[st.mode];
  upNext(`Station ${plan.i + 1} of ${plan.steps.length}`, st.name || m.name, st.secs ? `${Math.round(st.secs / 60 * 10) / 10} minutes` : m.desc, REST_SECS, () => startLive());
}
function upNext(kicker, title, sub, secs, then) {
  const el = $('#nextUp'); let n = secs;
  ['#scoreboard', '#poss', '#ghost'].forEach((q) => $(q).classList.add('hidden'));
  const draw = () => { el.innerHTML = `<div><div class="k">${esc(kicker)}</div><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="n">${n}</div><button class="btn" id="nuGo">Start now</button></div>`; $('#nuGo').onclick = go1; };
  const go1 = () => { clearInterval(iv); el.classList.add('hidden'); whistle(0.4); then(); };
  el.classList.remove('hidden'); draw(); call('setshot', title, null, 300);
  const iv = setInterval(() => { n--; if (n <= 0) go1(); else { draw(); if (n <= 3) beep(660, 0.12); } }, 1000);
}
function renderPlanSummary(pl) {
  const xp = pl.results.reduce((a, r) => a + (r.s?.xp || 0), 0);
  $('#summary').innerHTML = `<div class="sumhead"><div class="k">Practice plan</div><h2>${esc(pl.name)}</h2><div class="xp">+${xp} XP</div></div>
    <div class="card scroll-x" style="padding:6px 10px"><table class="box"><tr><th>Station</th><th>Score</th><th>Best</th><th>XP</th></tr>
    ${pl.results.map((r) => { const m = P.MODES[r.step.mode]; const sc = r.res?.drill?.score; return `<tr><td>${esc(r.step.name || m.name)}</td><td>${sc != null ? sc + ' ' + (m.unit || '') : r.s.dribbles + ' dribbles'}</td><td>${r.res?.drill?.isBest ? '<span class="pbflag">NEW BEST</span>' : P.current()?.bests?.[r.step.mode] ?? '–'}</td><td>+${r.s.xp}</td></tr>`; }).join('')}</table></div>
    <p style="color:var(--dim)">${pl.results.length} of ${pl.steps.length} stations done.</p>
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn primary" id="again">Run it again</button></div>`;
  $('#again').onclick = () => startPlan(pl.id);
}

// ---------- team mode ----------
let teamRun = null;
const TM = (cfg.teamMode ||= { kids: [], drill: 'dribble30', rounds: 1 });
let teamTricks = false;
function openTeam(tricks) {
  teamTricks = !!tricks;
  const players = P.players();
  $('#mTeam h2').textContent = tricks ? 'Trick Contest' : 'Team mode';
  $('#teamDrill').closest('.field').classList.toggle('hidden', !!tricks);
  $('#teamKids').innerHTML = players.map((p) => `<label><input type="checkbox" value="${p.id}" ${TM.kids.includes(p.id) ? 'checked' : ''}>${esc(p.name)}${p.num ? ' #' + esc(p.num) : ''}</label>`).join('') || '<p style="color:var(--dim)">Add players first.</p>';
  $('#teamDrill').innerHTML = Object.entries(P.MODES).filter(([, m]) => m.drill).map(([id, m]) => `<option value="${id}" ${TM.drill === id ? 'selected' : ''}>${m.name}</option>`).join('');
  document.querySelectorAll('#teamRounds button').forEach((b) => b.classList.toggle('on', +b.dataset.v === TM.rounds));
  $('#mTeam').classList.add('on');
}
$('#teamKids').addEventListener('change', () => { TM.kids = [...document.querySelectorAll('#teamKids input:checked')].map((i) => i.value); P.save(); });
$('#teamDrill').onchange = () => { TM.drill = $('#teamDrill').value; P.save(); };
document.querySelectorAll('#teamRounds button').forEach((b) => b.onclick = () => { TM.rounds = +b.dataset.v; P.save(); openTeam(); });
$('#teamAdd').onclick = () => { $('#mTeam').classList.remove('on'); openPlayers(); };
$('#mTeamClose').onclick = () => $('#mTeam').classList.remove('on');
$('#teamGo').onclick = () => {
  const kids = TM.kids.filter((id) => P.players().some((p) => p.id === id));
  if (kids.length < (teamTricks ? 1 : 2)) { toast(teamTricks ? 'Pick at least 1 player' : 'Pick at least 2 players'); return; }
  $('#mTeam').classList.remove('on');
  const queue = []; for (let r = 0; r < TM.rounds; r++) for (const k of kids) queue.push(k);
  teamRun = { queue, i: 0, drill: teamTricks ? 'tricks' : TM.drill, results: [] };
  mode = teamRun.drill; P.select(queue[0]); enterSession();
};
function teamTurnDone() {
  const s0 = session; session = null; phase = 'off';
  if (s0.tricks) s0.cards = judge(s0.tricks, 30, teamRun.i * 7919 + 1);
  const res = P.finish(s0, teamRun.queue[teamRun.i]);
  teamRun.results.push({ pid: teamRun.queue[teamRun.i], score: res?.drill?.score ?? null, xp: s0.xp, best: res?.drill?.isBest, cards: s0.cards, moves: s0.tricks?.moves.length });
  if (s0.cards) { showCall('info', s0.cards.join('  ·  '), 'The judges score that run', 2400); call('make'); }
  teamRun.i++;
  if (teamRun.i >= teamRun.queue.length) { endSession({ quit: true }); return; }
  const next = P.players().find((p) => p.id === teamRun.queue[teamRun.i]); P.select(next.id); applySettings();
  upNext(`Turn ${teamRun.i + 1} of ${teamRun.queue.length}`, `Up next: ${next.num ? '#' + next.num + ' ' : ''}${next.name}`, P.MODES[teamRun.drill].desc, 10, () => startLive());
}
function renderTeamSummary(tr) {
  if (tr.drill === 'tricks') return renderTrickSummary(tr);
  const by = {}; for (const r of tr.results) { const b = (by[r.pid] ||= { pid: r.pid, best: null, turns: 0, xp: 0 }); b.turns++; b.xp += r.xp; if (r.score != null) b.best = Math.max(b.best ?? -1, r.score); }
  const rows = Object.values(by).sort((a, b) => (b.best ?? -1) - (a.best ?? -1));
  const name = (id) => P.players().find((p) => p.id === id)?.name || '?';
  const m = P.MODES[tr.drill];
  $('#summary').innerHTML = `<div class="sumhead"><div class="k">Team mode · ${esc(m.name)}</div><h2>Results</h2></div>
    <div class="card scroll-x" style="padding:6px 10px"><table class="box"><tr><th>#</th><th>Player</th><th>Best</th><th>Turns</th><th>XP</th></tr>
    ${rows.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(name(r.pid))}</td><td><b>${r.best ?? '–'}</b> ${esc(m.unit || '')}</td><td>${r.turns}</td><td>+${r.xp}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn" id="teamPrint">Print reports</button><button class="btn primary" id="again">Run it again</button></div>`;
  $('#again').onclick = () => { openTeam(); };
  $('#teamPrint').onclick = () => printReports(rows.map((r) => r.pid), `<div class="card" style="margin-top:14px"><p class="label">Today's team drill</p><p style="margin:0">${esc(m.name)}</p></div>`);
}
function printReports(pids, extra = '') {
  $('#printArea').innerHTML = pids.map((id) => { const pl = P.players().find((p) => p.id === id); return pl ? `<div class="page">${reportHTML(buildReport(pl, 7), extra)}</div>` : ''; }).join('');
  window.print();
}

// ---------- parent report ----------
let repDays = 7, repPid = null;
function renderReport() {
  const players = P.players();
  if (!players.length) { $('#report').innerHTML = '<div class="card empty-player"><p>No players yet.</p></div>'; return; }
  const pl = players.find((x) => x.id === repPid) || P.current() || players[0]; repPid = pl.id;
  $('#repWho').innerHTML = players.map((x) => `<option value="${x.id}" ${x.id === pl.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  document.querySelectorAll('#repDays button').forEach((b) => b.classList.toggle('on', +b.dataset.d === repDays));
  $('#report').innerHTML = reportHTML(buildReport(pl, repDays));
}
$('#repWho').onchange = () => { repPid = $('#repWho').value; renderReport(); };
document.querySelectorAll('#repDays button').forEach((b) => b.onclick = () => { repDays = +b.dataset.d; renderReport(); });
$('#repPrint').onclick = () => { const pl = P.players().find((x) => x.id === repPid); if (pl) printReports([pl.id]); };
$('#repShare').onclick = async () => {
  const pl = P.players().find((x) => x.id === repPid); if (!pl) return;
  const url = `${location.origin}${location.pathname}?report=${encodeReport(buildReport(pl, repDays))}`;
  try { if (navigator.share) { await navigator.share({ title: `${pl.name}'s basketball report`, url }); return; } } catch { /* cancelled */ }
  try { await navigator.clipboard.writeText(url); toast('Link copied', true); } catch { prompt('Copy this link:', url); }
};
// a shared report link opens read-only
const sharedReport = Q.get('report') ? decodeReport(Q.get('report')) : null;

// ---------- second screen scoreboard ----------
const board = new BoardHost();
board.onData = (m) => onBoardData(m);
$('#cBoard').onclick = async () => {
  const w = document.createElement('div'); w.className = 'modal on';
  w.innerHTML = `<div class="card" style="width:min(420px,100%);text-align:center"><h2 style="font:800 26px var(--display);letter-spacing:.06em;margin:0 0 8px">SCOREBOARD SCREEN</h2><p id="bdTxt" style="color:var(--dim)">Opening…</p><div class="row" style="margin-top:12px"><button class="btn" data-x>Close</button></div></div>`;
  document.body.appendChild(w);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-x]')) w.remove(); });
  try {
    const code = await board.start(), link = `${location.origin}${location.pathname}?board=${code}`;
    const base = `${location.origin}${location.pathname}`;
    w.querySelector('#bdTxt').innerHTML = `On another phone or tablet, open:<br><b style="color:var(--text);word-break:break-all">${esc(link)}</b><br><br><b>Remote control</b> (big buttons): <span style="word-break:break-all">${esc(base)}?remote=${code}</span><br><b>Side camera</b> (a 2nd phone filming from the side): <span style="word-break:break-all">${esc(base)}?cam=${code}</span><div style="font:800 64px/1 var(--display);color:var(--orange);margin-top:12px;letter-spacing:.1em">${code}</div>`;
    sendBoard();
  } catch (e) { w.querySelector('#bdTxt').textContent = 'Could not open the scoreboard: ' + e.message + '. Check the internet connection.'; }
};
function sendBoard() {
  const now = performance.now(); if (now - (sendBoard.t || 0) < 250) return; sendBoard.t = now;
  if (game) {
    board.state({ kind: 'game', clock: game.rules.shotClock ? String(Math.max(0, Math.ceil(game.clock))) : fmtTime(gameClock), clockLbl: game.rules.shotClock ? 'Shot clock' : 'Time',
      teams: [0, 1].map((t) => ({ name: slotCount() === 2 ? slotName(t) : cfg.teams[t].name, score: game.score[t], fouls: game.teamFouls[t], color: teamColor(t), poss: game.poss != null && teamOfSlot(game.poss) === t })) });
  } else if (turns) {
    board.state({ kind: 'turns', title: turns.kind === 'horse' ? turns.word : 'Knockout', players: Array.from({ length: turns.n }, (_, i) => ({ name: slotName(i), letters: turns.word.slice(0, turns.letters[i]), out: turns.out[i], cur: turns.state().who === i })) });
  } else if (session) {
    const m = P.MODES[session.mode], lim = m.secs || session.limit;
    board.state({ kind: 'solo', title: (P.current()?.name || '') + ' · ' + m.name, tiles: [[lim ? String(Math.max(0, Math.ceil(lim - session.seconds))) : fmtTime(session.seconds), lim ? 'Left' : 'Time'], [String(m.unit && m.unit !== 'makes' ? m.score(session) : session.dribbles), m.unit && m.unit !== 'makes' ? m.unit : 'Dribbles'], [String(ref.streak), 'Streak'], [`${session.makes}/${session.shots}`, 'FG'], [String(session.xp), 'XP']] });
  }
}
function boardView(code) {
  document.querySelectorAll('.screen').forEach((x) => x.classList.toggle('on', x.id === 'sBoardView'));
  const bv = $('#bv'); let st = null, callT = 0, callHTML = '';
  const draw = () => {
    let body = '';
    if (!st) body = '';
    else if (st.kind === 'game') body = `<div class="teams">${st.teams.map((t) => `<div class="team" style="border-color:${t.color}"><span>${esc(t.name)}${t.poss ? ' ●' : ''}</span><b>${t.score}</b><small>Fouls ${t.fouls}</small></div>`).join('')}</div><div class="tiles"><div class="tile"><b>${esc(st.clock)}</b><span>${esc(st.clockLbl)}</span></div></div>`;
    else if (st.kind === 'turns') body = `<div class="title">${esc(st.title)}</div><div class="tiles">${st.players.map((p) => `<div class="tile" style="${p.cur ? 'outline:3px solid var(--orange)' : ''}${p.out ? ';opacity:.4' : ''}"><b style="color:var(--red)">${esc(p.letters || (p.out ? 'OUT' : '–'))}</b><span>${esc(p.name)}</span></div>`).join('')}</div>`;
    else body = `<div class="title">${esc(st.title)}</div><div class="tiles">${st.tiles.map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
    bv.innerHTML = `<div class="title">WHISTLE scoreboard · ${esc(code)}</div>${body}${performance.now() < callT ? callHTML : ''}<p style="color:var(--dim)" id="bvStatus"></p>`;
  };
  joinBoard(code, (m) => {
    if (m.t === 'state') st = m.st;
    if (m.t === 'call') { callHTML = `<div class="callbig ${m.c.kind === 'good' ? 'good' : m.c.kind === 'info' ? 'info' : ''}">${esc(m.c.title)}</div><p style="font-size:20px">${esc(m.c.sub)}</p>`; callT = performance.now() + 3500; setTimeout(draw, 3600); }
    draw();
  }, (msg) => { const el = $('#bvStatus'); if (el) el.textContent = msg; else if (msg) bv.insertAdjacentHTML('beforeend', `<p style="color:var(--dim)" id="bvStatus">${esc(msg)}</p>`); }).catch((e) => { bv.insertAdjacentHTML('beforeend', `<p>Could not connect: ${esc(e.message)}</p>`); });
}

// ---------- trick contest ----------
function trickPop(m) {
  const el = document.createElement('div'); el.className = 'trickpop';
  el.innerHTML = `${esc(TRICKS[m.kind].name.toUpperCase())}<small>+${m.pts}${m.combo ? ` · combo ×${1 + Math.min(m.combo, 4) * 0.5}` : ''}</small>`;
  $('#sSession').appendChild(el); setTimeout(() => el.remove(), 1000);
  if (m.pts >= 4 && cfg.arena) cheer(2);
}
function renderTrickSummary(tr) {
  const name = (id) => P.players().find((p) => p.id === id)?.name || '?';
  const rows = tr.results.slice().sort((a, b) => (b.cards || []).reduce((x, y) => x + y, 0) - (a.cards || []).reduce((x, y) => x + y, 0));
  $('#summary').innerHTML = `<div class="sumhead"><div class="k">Trick Contest</div><h2>${rows[0] ? esc(name(rows[0].pid)) + ' wins' : 'Results'}</h2></div>
    ${rows.map((r, k) => `<div class="card" style="margin-bottom:10px;text-align:center"><p class="label">${k + 1}. ${esc(name(r.pid))} · ${r.score ?? 0} pts · ${r.moves || 0} moves</p><div class="cards">${(r.cards || [0, 0, 0]).map((c) => `<div>${c}</div>`).join('')}</div></div>`).join('')}
    <div class="row" style="margin-top:18px"><button class="btn" data-go="sHome">Home</button><button class="btn primary" id="again">Another round</button></div>`;
  $('#again').onclick = () => openTeam(true);
  celebrateNow(2);
}

// ---------- calibration wizard ----------
let calib = null, calibDone = false;
function startCalib() {
  calib = new Calibrator(); calib.step = 'still'; calib.t0 = null;
  $('#turnBanner').classList.remove('hidden'); $('#turnBanner').innerHTML = 'Stand still<small>Feet planted, ball in your hands, for 3 seconds</small>';
  call('setshot', 'Stand still', null, 200);
}
function calibFrame(t) {
  const b = ref.body; if (!b) return;
  calib.t0 ??= t;
  if (calib.step === 'still') {
    calib.addStill(b.feet, ref.S, t); if (lastBall) calib.addBall(lastBall, ref.S);
    if (t - calib.t0 > 3) { calib.step = 'dribble'; calib.t1 = t; $('#turnBanner').innerHTML = 'Now dribble 5 times<small>Your normal dribble, standing in place</small>'; say('Now dribble five times'); }
  } else if (calib.step === 'dribble') {
    if (lastBall) calib.addBall(lastBall, ref.S);
    $('#turnBanner').querySelector('small') && ($('#turnBanner').querySelector('small').textContent = `${calib.dribbles.length} of 5`);
    if (calib.dribbles.length >= 5 || t - calib.t1 > 25) finishCalib();
  }
}
function finishCalib() {
  const r = calib.result(), p0 = P.current(); calib = null;
  if (p0) { p0.calib = r; P.save(); applySettings(); }
  $('#turnBanner').classList.add('hidden'); whistle(0.3); say('Calibrated');
  coach('Calibration', 'All set!', `WHISTLE is tuned to ${esc(p0?.name || 'you')}: step threshold ${r.footV}${r.ballRR ? `, ball size ${r.ballRR}` : ''}${r.drPeriod ? `, a dribble every ${r.drPeriod} s` : ''}. Calls should feel fairer now.`, 'Done', () => { calibDone = true; endSession({ quit: true }); });
}

// ---------- career ----------
let careerRun = null;
function openCareer() {
  const pl = P.current(), c = careerOf(pl);
  $('#careerList').innerHTML = CHAPTERS.map((ch, k) => `<div class="chap ${k < c.ch || c.done ? 'done' : k === c.ch ? 'cur' : 'lock'}"><div class="n">${k < c.ch || c.done ? '✓' : k + 1}</div><div><b>${esc(ch.title)}</b><span>${ch.rival ? `Beat ${esc(ch.rival.name)} at ${ch.mode === 't21' ? '21' : 'HORSE'}` : `${ch.target} ${esc(P.MODES[ch.mode].unit || '')} in ${esc(P.MODES[ch.mode].name)}`}</span></div></div>`).join('');
  $('#careerGo').textContent = c.done ? 'Replay the championship' : `Play chapter ${c.ch + 1}: ${CHAPTERS[c.ch].title}`;
  $('#mCareer').classList.add('on');
}
$('#mCareerClose').onclick = () => $('#mCareer').classList.remove('on');
$('#careerGo').onclick = () => { $('#mCareer').classList.remove('on'); startChapter(careerOf(P.current()).ch); };
function startChapter(k) {
  const ch = CHAPTERS[k]; careerRun = { ch: k };
  if (ch.rival) cfg.troster = [P.current()?.id || null, null];
  mode = ch.rival ? 'horse' : ch.mode; stationLimit = 0;
  enterSession().then?.(() => {});
  setTimeout(() => coach(COACH, ch.title, esc(ch.intro), "Let's go"), 600);
  say(ch.intro, 900, { rate: 1, pitch: 0.95 });
}
function coach(who, title, html, btn, then) {
  const el = $('#coachCard');
  el.innerHTML = `<div><div class="who">${esc(who)}</div><h2>${esc(title)}</h2><p>${html}</p><button class="btn primary" id="coachOk">${esc(btn)}</button></div>`;
  el.classList.remove('hidden'); $('#coachOk').onclick = () => { el.classList.add('hidden'); then?.(); };
}
function careerEnd(opts) {
  const run = careerRun; careerRun = null;
  const pl = P.current(), ch = CHAPTERS[run.ch];
  let ok = false;
  if (turns) ok = turns.winner === 0;
  else if (session) { const m = P.MODES[session.mode]; ok = !opts.quit && session.complete && passed(ch, { score: m.score ? m.score(session) : null }); }
  const wasDone = careerOf(pl).done;
  if (ok && run.ch === careerOf(pl).ch && !wasDone) { advance(pl); P.save(); }
  endSession({ ...opts, career: true });
  const banner = ok ? `<div class="lvlup" style="border-color:var(--green);color:var(--green);background:#0d2a1d">Chapter ${run.ch + 1} passed! ${esc(ch.win)}</div>` : `<div class="lvlup">Not this time. ${esc(COACH)}: "Shake it off. Run it back."</div>`;
  $('#summary').insertAdjacentHTML('afterbegin', banner);
  const c = careerOf(pl);
  $('#summary').insertAdjacentHTML('beforeend', `<div class="row" style="margin-top:10px"><button class="btn primary" id="careerNext">${ok ? (c.done && run.ch === CHAPTERS.length - 1 ? 'Career complete: replay the final' : `Next: ${esc(CHAPTERS[c.ch].title)}`) : 'Try again'}</button></div>`);
  $('#careerNext').onclick = () => startChapter(ok ? c.ch : run.ch);
  if (ok && c.done && run.ch === CHAPTERS.length - 1) { celebrateNow(3); say(ch.win, 600, { rate: 1, pitch: 0.95 }); }
}
// the rival takes their shot after a moment
function ghostTurn(st) {
  const pct = turns.ghosts[st.who], nm = slotName(st.who);
  clearTimeout(ghostTurn.t);
  ghostTurn.t = setTimeout(() => {
    if (!turns || turns.winner != null || turns.state().who !== st.who) return;
    const made = Math.random() < (st.role === 'tip' ? pct + 0.25 : pct), three = turns.kind === 't21' && st.role === 'long' && Math.random() < 0.25;
    showCall(made ? 'good' : 'info', made ? `${nm.toUpperCase()} SCORES` : `${nm.toUpperCase()} MISSES`, three ? 'From deep!' : '', 1300);
    turnShot(made, { three });
  }, 2600);
}
function isThreeSpot(spot) {
  const tl = cfg.threeLine, h = cfg.hoop; if (!spot || !tl || !h) return false;
  return (spot.x - tl.x) * Math.sign(tl.x - (h.x1 + h.x2) / 2) > 0;
}
const worldSpots = () => cfg.worldSpots || [0.14, 0.32, 0.5, 0.68, 0.86].map((x) => ({ x, y: 0.9 }));

// ---------- bad call reports ----------
const recent = [];
function logRecent(e) { recent.push({ t: +(curT || 0).toFixed(2), type: e.type, kind: e.kind, why: e.why, made: e.made, streak: e.streak }); if (recent.length > 40) recent.shift(); }
$('#cBad').onclick = async () => {
  const frames = replay.frames.slice(); if (!frames.length) { toast('Nothing recorded to save'); return; }
  replay.frozen = true; toast('Saving the clip…');
  try {
    const clip = await framesToVideo(frames);
    await saveBadCall({ at: Date.now(), title: lastCallTitle || 'Call', mode: session?.mode || (game ? 'game' : turns ? 'turns' : ''), clip,
      data: { version: '1.5', events: recent.slice(), settings: { stepsAllowed: cfg.stepsAllowed, quality: cfg.quality, sensitivity: cfg.sensitivity, carry: cfg.carry }, calib: P.current()?.calib || null, ball: lastBall, ua: navigator.userAgent } });
    toast('Saved. Find it in Settings → Bad call reports', true);
  } catch (err) { toast('Could not save: ' + err.message); }
  replay.frozen = false; ['#cWave', '#cBad'].forEach((q) => $(q).classList.add('hidden'));
};
async function openBadCalls() {
  const list = (await listBadCalls()).sort((a, b) => b.at - a.at);
  $('#mListTitle').textContent = 'Bad call reports';
  $('#mListBody').innerHTML = list.length ? `<p style="color:var(--dim);margin-top:0">Each has the replay clip and what the ref saw. Download them and send them to whoever tunes WHISTLE.</p><div style="display:grid;gap:8px">${list.map((b) => `<div class="pitem" style="justify-content:space-between"><div><b>${esc(b.title)}</b><span>${new Date(b.at).toLocaleString()} · ${esc(b.mode)}</span></div><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-dl="${b.id}">Download</button><button class="btn sm ghost danger" data-del="${b.id}">Delete</button></div></div>`).join('')}</div>` : '<p style="color:var(--dim)">No reports yet. After a wrong call, tap "Bad call" next to "No call".</p>';
  $('#mList').classList.add('on');
  document.querySelectorAll('[data-dl]').forEach((b) => b.onclick = () => { const r = list.find((x) => x.id === b.dataset.dl); if (r.clip) download(r.clip, `whistle-badcall-${r.id}.webm`); download(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }), `whistle-badcall-${r.id}.json`); });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await deleteBadCall(b.dataset.del); openBadCalls(); });
}
$('#mListClose').onclick = () => $('#mList').classList.remove('on');

// ---------- voice commands + remote control (same commands) ----------
const vc = new VoiceCommands((c) => handleCmd(c), (state, c) => {
  const m = $('#mic'); m.classList.toggle('on', state === 'listening' || state === 'heard');
  if (state === 'heard') toast(`Heard: "${c}"`); if (state === 'denied') toast('Microphone blocked: allow it in the address bar');
});
sound.onSpeak = (ms) => vc.mute(ms);
const vis = (q) => { const el = $(q); return el && !el.classList.contains('hidden'); };
function handleCmd(c) {
  if (c === 'start') { if (vis('#nextUp')) $('#nuGo')?.click(); else if (phase === 'setup') $('#btnGo').click(); else if (phase === 'paused') $('#cPause').click(); }
  else if (c === 'pause') { if (phase === 'live') $('#cPause').click(); }
  else if (c === 'resume') { if (phase === 'paused') $('#cPause').click(); }
  else if (c === 'nocall') { if (vis('#cWave')) $('#cWave').click(); }
  else if (c === 'bad') { if (vis('#cBad')) $('#cBad').click(); }
  else if (c === 'replay') { if (phase === 'live' || phase === 'paused') $('#cReplay').click(); }
  else if (c === 'next') { if (vis('#nextUp')) $('#nuGo')?.click(); else if (plan && session) { session.complete = true; endSession(); } }
  else if (c === 'made' || c === 'missed') { if (vis('#ask')) answer(c === 'made'); else if (turns && phase === 'live') turnShot(c === 'made'); else if (session && phase === 'live') { onEvent({ type: 'shot', manual: true }); c === 'made' ? made(false) : missed(); } }
  else if (c === 'end') { if (session || game || turns) $('#cEnd').click(); }
  else if (/^[ha][123]$/.test(c) && game) handleGame(game.manualPoints(c[0] === 'h' ? 0 : 1, +c[1]));
  else if (/^f[ha]$/.test(c) && game) handleGame(game.manualFoul(c[1] === 'h' ? 0 : 1));
}
function remoteView(code) {
  document.querySelectorAll('.screen').forEach((x) => x.classList.toggle('on', x.id === 'sRemote'));
  const el = $('#remote');
  const btn = (c, label, cls = '') => `<button class="btn ${cls}" data-c="${c}">${label}</button>`;
  el.innerHTML = `<div class="score" id="rmScore">Connecting…</div>
    <div class="grid">${btn('pause', 'Pause')}${btn('resume', 'Resume')}${btn('replay', 'Replay')}${btn('nocall', 'No call', 'danger')}${btn('made', 'Made it', 'primary')}${btn('missed', 'Missed')}</div>
    <p class="label" style="margin:6px 0 0">Game</p><div class="grid">${btn('h1', 'Home +1')}${btn('h2', 'Home +2')}${btn('h3', 'Home +3')}${btn('a1', 'Away +1')}${btn('a2', 'Away +2')}${btn('a3', 'Away +3')}${btn('fh', 'Foul Home')}${btn('fa', 'Foul Away')}${btn('next', 'Next')}</div>
    ${btn('start', 'Start / Tip off', 'primary big')}${btn('end', 'End session', 'end')}`;
  joinBoard(code, (m) => {
    if (m.t !== 'state') return; const st = m.st;
    $('#rmScore').textContent = st.kind === 'game' ? st.teams.map((t) => `${t.name} ${t.score}`).join('  –  ') : st.kind === 'solo' ? st.title : st.title || 'WHISTLE';
  }, (msg) => { if (msg) $('#rmScore').textContent = msg; }).then((send) => {
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { send({ t: 'cmd', c: b.dataset.c }); b.animate([{ transform: 'scale(.94)' }, { transform: 'none' }], 150); });
  });
}

// ---------- side camera ----------
let side = null, sideWait = 0, sideRef = new Ref({ stepsAllowed: cfg.stepsAllowed });
const sideActive = () => side && performance.now() - side.at < 600 && side.d.lm;
function sideFrameTick(t) {
  const on = !!sideActive();
  ref.setOptions({ noTravel: on }); // the side view sees steps better: it makes the travel calls
  if (!on || !session) return;
  for (const e of sideRef.update({ t, aspect: side.d.aspect, pose: side.d.lm, ball: side.d.ball, hoop: side.d.hoop })) {
    if (e.type === 'violation' && e.kind === 'travel') onEvent({ ...e, why: e.why + ' (side camera)' });
    if (e.type === 'shotResult' && e.made != null && sideWait) { clearTimeout(sideWait); sideWait = 0; e.made ? made(false) : missed(); }
  }
}
function onBoardData(m) {
  if (m.t === 'cmd') handleCmd(m.c);
  else if (m.t === 'cam') { side = { d: m.d, at: performance.now() }; }
}
let camSend = null, camLast = 0;
async function sideCamView(code) {
  mode = 'free'; await enterSession();
  $('#chkBodyTitle').textContent = 'Side camera: player in view';
  $('#btnGo').textContent = 'Start sending';
  try { camSend = await joinBoard(code, () => {}, (msg) => { if (msg) toast(msg); }); } catch (e) { toast('Could not connect: ' + e.message); }
  $('#btnGo').onclick = () => { phase = 'camlive'; $('#setup').classList.add('hidden'); $('#cFlip').classList.add('hidden'); toast('Side camera is live. Leave this phone filming from the side.', true); };
}
function streamSide(aspect) {
  const now = performance.now(); if (!camSend || now - camLast < 66) return; camLast = now;
  const lm = lastPose && lastPose.map((q) => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4), visibility: +(q.visibility ?? 1).toFixed(2) }));
  camSend({ t: 'cam', d: { lm, ball: lastBall && { x: lastBall.x, y: lastBall.y, r: lastBall.r }, hoop: cfg.hoop, aspect } });
}

// ---------- leagues ----------
function openLeague() {
  const lg = cfg.league, pl = P.current(), body = $('#leagueBody');
  if (!lg) {
    body.innerHTML = `<p style="color:var(--dim);margin-top:0">Play against friends in other houses. Each week has 3 drills; your league points are your best scores as a % of the pro. Standings use your Game Library account.</p>
      <div class="newp"><input type="text" id="lgCode" placeholder="League code" maxlength="5" style="text-transform:uppercase"><button class="btn" id="lgJoin">Join</button></div>
      <p style="text-align:center;color:var(--faint)">or</p><button class="btn primary" id="lgNew" style="width:100%">Start a new league</button>`;
    $('#lgJoin').onclick = () => { const c = cleanCode($('#lgCode').value); if (c.length !== 5) { toast('League codes have 5 letters'); return; } cfg.league = { code: c }; P.save(); openLeague(); };
    $('#lgNew').onclick = () => { cfg.league = { code: newLeagueCode() }; P.save(); openLeague(); };
  } else {
    const lp = pl ? leaguePoints(pl) : null;
    body.innerHTML = `<div style="text-align:center"><p class="label" style="margin:0">League code · share it with friends</p><div style="font:800 48px/1.1 var(--display);color:var(--orange);letter-spacing:.12em">${esc(lg.code)}</div></div>
      <p class="label" style="margin-top:14px">Drills of the week (${esc(isoWeek())})</p>
      <div style="display:grid;gap:6px">${weekDrills().map((m, k) => `<div class="pitem" style="justify-content:space-between"><div><b>${esc(P.MODES[m].name)}</b><span>Pro: ${PRO[m]}</span></div><div style="text-align:right"><b>${lp?.parts[k].best ?? '–'}</b><span>${lp?.parts[k].pts ?? 0} pts</span></div></div>`).join('')}</div>
      <p style="text-align:center;font:800 26px var(--display);margin:12px 0">${esc(pl?.name || '')}: ${lp?.total ?? 0} league points</p>
      <div class="row"><button class="btn primary" id="lgPost">Post my points</button><button class="btn" id="lgTable">Standings</button><button class="btn ghost danger" id="lgLeave">Leave</button></div>`;
    $('#lgPost').onclick = () => postLeague(true);
    $('#lgTable').onclick = () => { if (!boardsOn()) { toast('Leagues need the internet'); return; } $('#mLeague').classList.remove('on'); GameSync.board(leagueBoard(lg.code), `League ${lg.code} · ${isoWeek()}`); };
    $('#lgLeave').onclick = () => { if (confirm('Leave this league?')) { cfg.league = null; P.save(); openLeague(); } };
  }
  $('#mLeague').classList.add('on');
}
function postLeague(loud) {
  const lg = cfg.league, pl = P.current(); if (!lg || !pl || !boardsOn()) { if (loud) toast('Leagues need the internet'); return; }
  const lp = leaguePoints(pl); if (!lp.total) { if (loud) toast('Play a drill of the week first'); return; }
  GameSync.postScore(leagueBoard(lg.code), lp.total, pl.name).then((ok) => loud && toast(ok === false ? 'Could not post' : 'Posted to the league', ok !== false));
}
$('#btnLeague').onclick = openLeague;
$('#mLeagueClose').onclick = () => $('#mLeague').classList.remove('on');

// ---------- boot ----------
renderHome();
if (Q.get('board')) boardView(Q.get('board'));
else if (Q.get('remote')) remoteView(Q.get('remote'));
else if (Q.get('cam')) sideCamView(Q.get('cam'));
if (cfg.voiceCmd && voiceSupported() && !TEST) vc.start();
else if (sharedReport) { go('sReport'); $('#repBar').classList.add('hidden'); $('#report').innerHTML = reportHTML(sharedReport, '<p style="color:var(--faint);font-size:12px;margin-top:14px">Shared from WHISTLE · Basketball Ref & Coach</p>'); }
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'live' && !videoSrc) $('#cPause').click(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if ($('#mPlayers').classList.contains('on')) $('#mPlayersClose').click(); else if ($('#mGame').classList.contains('on')) $('#mGameClose').click(); }
  if (!$('#sSession').classList.contains('on')) return;
  if (e.key === ' ' && (phase === 'live' || phase === 'paused')) { e.preventDefault(); $('#cPause').click(); }
});
if (window.GameSync && !TEST) {
  const anyBadge = (g, id) => ((g('whistle.v1') || {}).players || []).some((p) => p.badges && p.badges[id]);
  GameSync.init({
    game: 'whistle', keys: [{ match: 'whistle.v1', skip: ['settings', 'current'] }],
    idle: () => phase === 'off' && $('#sHome').classList.contains('on'),
    ach: [
      { id: 'first', name: 'First Bucket', desc: 'Make your first shot', test: (g) => anyBadge(g, 'first') },
      { id: 'handles', name: 'Handles', desc: '25 dribbles in a row', test: (g) => anyBadge(g, 'handles') },
      { id: 'sharp', name: 'Sharpshooter', desc: '10 makes in one session', test: (g) => anyBadge(g, 'sharp') },
      { id: 'form9', name: 'Pure Form', desc: 'Score 9 or 10 from the form coach', test: (g) => anyBadge(g, 'form9') },
      { id: 'win', name: 'Winner', desc: 'Win a 1v1 or 2v2 game', test: (g) => anyBadge(g, 'win') },
      { id: 'horse', name: 'Horse Master', desc: 'Win HORSE or Knockout', test: (g) => anyBadge(g, 'horse') },
      { id: 'k1', name: '1K Club', desc: '1,000 dribbles all-time', test: (g) => anyBadge(g, 'k1') },
      { id: 'rat', name: 'Gym Rat', desc: 'Finish 10 sessions', test: (g) => anyBadge(g, 'rat') },
    ],
  });
}
const TSTATS = { frames: 0, pose: 0, ball: 0, ai: 0, ms: 0 }, TLOG = [], TRACE = [];
if (TEST) window.__wh = { handleCmd, get careerRun() { return careerRun; }, startChapter, onBoardData, get side() { return side; }, sideRef, replay, board, get plan() { return plan; }, get teamRun() { return teamRun; }, startPlan, sendBoard, hl, get turns() { return turns; }, turnShot, formResult, renderDash, stats: TSTATS, log: TLOG, trace: TRACE, video, ref, tracker, finder, P, onEvent, handleGame, get game() { return game; }, get session() { return session; }, get phase() { return phase; }, get fps() { return fpsM.fps; }, endSession, go, enterSession, setMode: (m) => { mode = m; } };
