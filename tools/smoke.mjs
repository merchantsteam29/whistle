// Headless Chrome smoke test with Chrome's fake camera. Start the server first (node serve.js),
// then: node tools/smoke.mjs [--mobile]. Screenshots go to tools/shots/.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mobile = process.argv.includes('--mobile');
const [W, H] = mobile ? [844, 390] : [1280, 720];
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots', mobile ? 'mobile' : 'desktop');
fs.mkdirSync(out, { recursive: true });
const port = 9600 + Math.floor(Math.random() * 300), prof = path.join(os.tmpdir(), 'wh-test-' + port);
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets; for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, n + '.png'), Buffer.from(r.result.data, 'base64')); };
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) errs.push('CHECK ' + what); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile });
await send('Page.navigate', { url: 'http://localhost:8090/?test' });
await sleep(2500);
await shot('01-home-empty');

// add a player
await ev(`document.getElementById('btnStart').click();`); await sleep(300);
await ev(`document.getElementById('npName').value = 'Jordan'; document.getElementById('npNum').value = '23'; document.querySelector('#newPlayer button').click();`);
await sleep(200); await shot('02-players');
await ev(`document.getElementById('mPlayersClose').click();`); await sleep(200);
check(await ev(`return document.querySelector('#playerCard .name')?.textContent`) === 'Jordan', 'player created and shown');
await shot('03-home');

// session: camera + pose model
await ev(`document.getElementById('btnStart').click();`);
let ph = '';
for (let i = 0; i < 60; i++) { await sleep(500); ph = await ev(`return document.getElementById('loading').classList.contains('hidden') ? 'ready' : document.getElementById('loadTitle').textContent`); if (ph === 'ready' || /NO|UNAVAIL/.test(ph)) break; }
check(ph === 'ready', 'camera + body tracking loaded (' + ph + ')');
await sleep(800); await shot('04-setup');
check(await ev(`return document.getElementById('video').videoWidth > 0`), 'fake camera video playing');

// mark a hoop by tapping the stage twice
await ev(`document.getElementById('hoopMark').click();`);
const r = await ev(`const b = document.getElementById('stage').getBoundingClientRect(); return [b.x, b.y, b.width, b.height];`);
for (const fx of [0.62, 0.74]) {
  const x = r[0] + r[2] * fx, y = r[1] + r[3] * 0.22;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(100);
}
check(await ev(`return !!__wh.P.settings().hoop`), 'hoop marked by tapping');
await shot('05-hoop');

await ev(`document.getElementById('btnGo').click();`);
await sleep(3300);
check(await ev(`return __wh.phase`) === 'live', 'countdown → live');

// feed some ref events
await ev(`for (let i = 1; i <= 26; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i }); __wh.ref.streak = 26;`);
await sleep(300); await shot('06-streak');
await sleep(1300);
await ev(`__wh.onEvent({ type: 'violation', kind: 'travel', why: '3 steps without a dribble', title: 'TRAVELING', signal: 'Roll the arms', tip: 'Pick a pivot foot and keep it planted, or dribble before you move your feet.' });`);
await sleep(400); await shot('07-travel');
check(await ev(`return !document.getElementById('cWave').classList.contains('hidden')`), 'No call button shown after a call');
await ev(`document.getElementById('cWave').click();`);
check(await ev(`return __wh.session.travels`) === 0, 'waving off removes the travel');
await ev(`__wh.onEvent({ type: 'shot' }); __wh.onEvent({ type: 'shotResult', made: true, auto: true }); __wh.onEvent({ type: 'shot' }); __wh.onEvent({ type: 'shotResult', made: true, auto: true });`);
await ev(`__wh.formResult(0, { score: 8, parts: { legs: 1, elbow: 0.7, release: 1, follow: 0.5 }, tip: 'Hold your follow-through.' });`);
await sleep(2300);
check(await ev(`return !document.getElementById('formCard').classList.contains('hidden') && __wh.session.formScores.length === 1`), 'form coach card shows a score');
check(await ev(`return __wh.hl.clips.length`) >= 1, `a made shot is saved as a highlight clip (${await ev(`return __wh.hl.clips.length + ' clip(s), recorder ' + __wh.hl.enabled`)})`);
await sleep(300); await shot('08-bucket');
check(await ev(`return __wh.session.makes`) === 2, '2 makes counted');
await ev(`document.getElementById('cFix').click();`);
check(await ev(`return __wh.session.makes`) === 1, 'Fix shot flips the last make to a miss');
await ev(`__wh.onEvent({ type: 'violation', kind: 'double', why: 'Dribbled again after picking it up', title: 'DOUBLE DRIBBLE', signal: 'Pat the air', tip: 'Once you pick the ball up, pass or shoot.' }); __wh.onEvent({ type: 'clean' });`);
await sleep(2700);
const xp = await ev(`return __wh.session.xp`);
await ev(`document.getElementById('cEnd').click();`);
await sleep(900); await shot('09-summary');
check(await ev(`return document.getElementById('sSummary').classList.contains('on')`), 'summary shown');
const p = await ev(`return __wh.P.current()`);
check(p.xp === xp && p.stats.sessions === 1 && p.stats.dribbles === 26, `XP saved to player (${p.xp} xp, ${p.stats.dribbles} dribbles)`);
check(!!p.badges.handles && !!p.badges.first, 'badges earned (Handles, First Bucket)');

await ev(`__wh.go('sProfile');`); await sleep(300); await shot('10-profile');
await ev(`__wh.go('sSettings');`); await sleep(300); await shot('11-settings');
await ev(`__wh.go('sHelp');`); await sleep(300); await shot('12-help');

// drill: Handles 30 runs out the clock
await ev(`__wh.go('sHome'); document.querySelector('[data-mode=dribble30]').click(); document.getElementById('btnStart').click();`);
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; }
await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
await ev(`for (let i = 1; i <= 12; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i }); __wh.session.seconds = 29.5;`);
await sleep(2200);
check(await ev(`return document.getElementById('sSummary').classList.contains('on')`), 'Handles 30 ends itself when the clock runs out');
check(await ev(`return __wh.P.current().bests.dribble30`) === 12, 'personal best saved');
await shot('13-drill-summary');

// game mode: 1v1 with a saved player vs a guest
await ev(`__wh.go('sHome'); document.querySelector('[data-mode=game]').click(); document.getElementById('btnStart').click();`);
await sleep(300);
check(await ev(`return document.getElementById('mGame').classList.contains('on')`), 'Game setup opens');
await ev(`const sel = document.querySelector('[data-slot="0"]'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); document.getElementById('gTo').value = '7'; document.getElementById('gTo').dispatchEvent(new Event('change'));`);
await shot('14-game-setup');
await ev(`document.getElementById('gGo').click();`);
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; }
check(await ev(`return !document.getElementById('chkThree').classList.contains('hidden')`), 'game setup shows the 3-point line step');
await shot('15-game-court');
await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
check(await ev(`return !!__wh.game && !document.getElementById('gameboard').classList.contains('hidden')`), 'game started with a scoreboard');
await ev(`__wh.handleGame([{ type: 'possession', who: 0, team: 0, changed: true }]); __wh.handleGame(__wh.game.manualPoints(0, 3));`);
await sleep(300); await shot('16-game-three');
await sleep(1500);
await ev(`__wh.handleGame(__wh.game.manualFoul(1));`);
await sleep(400); await shot('17-game-foul');
check(await ev(`return __wh.game.stats[1].pf`) === 1 && await ev(`return __wh.game.teamFouls[1]`) === 1, 'foul counted for Away');
await ev(`document.getElementById('cWave').click();`);
check(await ev(`return __wh.game.stats[1].pf`) === 0, 'No call removes the foul');
await ev(`__wh.handleGame(__wh.game.manualPoints(1, 2)); __wh.handleGame(__wh.game.manualPoints(0, 2)); __wh.handleGame(__wh.game.manualPoints(0, 2));`);
await sleep(5000);
check(await ev(`return document.getElementById('sSummary').classList.contains('on')`), 'game to 7 ends itself with a summary');
await shot('18-game-summary');
const gp = await ev(`return __wh.P.current().stats`);
check(gp.games === 1 && gp.wins === 1 && gp.points === 7, `game saved to the player (games ${gp.games}, wins ${gp.wins}, points ${gp.points})`);
// HORSE: 2 players, Jordan sets and makes, the guest misses 5 matches
await ev(`__wh.go('sHome'); document.querySelector('[data-mode=horse]').click(); document.getElementById('btnStart').click();`); await sleep(300);
check(await ev(`return document.getElementById('mTurns').classList.contains('on')`), 'HORSE setup opens');
await ev(`const sel = document.querySelector('[data-tslot="0"]'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); document.getElementById('tGo').click();`);
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; }
await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
check(await ev(`return !!__wh.turns && !document.getElementById('turnBoard').classList.contains('hidden')`), 'HORSE board shows');
await ev(`__wh.turnShot(true); __wh.turnShot(false);`); await sleep(400); await shot('19-horse');
check(await ev(`return __wh.turns.letters[1]`) === 1, 'missed match = a letter');
await ev(`for (let k = 0; k < 4; k++) { __wh.turnShot(true); __wh.turnShot(false); }`);
await sleep(5600);
check(await ev(`return document.getElementById('sSummary').classList.contains('on') && document.getElementById('summary').textContent.includes('wins')`), 'HORSE ends with a winner');
await shot('20-horse-summary');
// coach dashboard
await ev(`__wh.go('sDash');`); await sleep(400);
check(await ev(`return document.querySelectorAll('#dash .chart').length`) >= 3, `dashboard draws charts (${await ev(`return document.querySelectorAll('#dash .chart').length`)})`);
await shot('21-dashboard');
await ev(`document.getElementById('dashTable').click();`); check(await ev(`return !document.getElementById('dashTbl').classList.contains('hidden')`), 'dashboard table view');
// settings: voice packs + team colours
await ev(`__wh.go('sSettings');`); await sleep(200);
check(await ev(`return document.getElementById('setPack').options.length`) === 3, 'three voice packs');
await shot('22-settings');
await ev(`__wh.go('sHome'); document.querySelector('[data-mode=game]').click(); document.getElementById('btnStart').click();`); await sleep(300);
await ev(`document.querySelector('[data-tcol="1"][data-c="#e5484d"]').click();`);
check(await ev(`return __wh.P.settings().teams[1].color`) === '#e5484d', 'team colour picked');
await shot('23-team-colours');
await ev(`document.getElementById('mGameClose').click();`);

// ---------- 1.4 features ----------
const waitReady = async () => { for (let i = 0; i < 40; i++) { await sleep(400); if (await ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; } };
await ev(`__wh.go('sHome');`); await sleep(200);
check(await ev(`return document.querySelector('#daily .daily') !== null`), 'daily challenge card on home');
await shot('24-home-14');
// weak-hand drill with the ghost bars
await ev(`document.querySelector('[data-mode=weak30]').click(); document.getElementById('btnStart').click();`); await waitReady();
await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
await ev(`for (let i = 1; i <= 8; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i, hand: 0 }); for (let i = 1; i <= 3; i++) __wh.onEvent({ type: 'dribble', streak: 8 + i, total: 8 + i, hand: 1 });`);
await sleep(300);
check(await ev(`return document.getElementById('sbDribbles').textContent`) === '8', 'weak-hand drill counts only the weak hand');
check(await ev(`return !document.getElementById('ghost').classList.contains('hidden')`), 'Beat the Pro ghost bars show');
await sleep(1600); await shot('25-weak-ghost');
check(await ev(`return document.querySelector('.replay') === null && __wh.replay.frames.length > 8`), `replay buffer filling (${await ev(`return __wh.replay.frames.length`)} frames)`);
await ev(`document.getElementById('cReplay').click();`); await sleep(800);
check(await ev(`return !!document.querySelector('.replay canvas')`), 'instant replay opens');
await shot('26-replay');
await ev(`document.querySelector('.replay [data-a=close]').click();`); await sleep(500);
await ev(`__wh.session.seconds = 31;`); await sleep(2200);
check(await ev(`return document.getElementById('sSummary').classList.contains('on')`), 'weak-hand drill finishes');
check((await ev(`return __wh.P.current().bests.weak30`)) === 8, 'weak-hand personal best saved');
// practice plan: two stations then quit
await ev(`__wh.go('sHome'); __wh.startPlan('quick10');`); await waitReady();
await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
check(await ev(`return __wh.plan && __wh.session && __wh.session.limit === 90`), 'plan station 1 is a timed warm-up');
await ev(`__wh.session.seconds = 95;`); await sleep(2000);
check(await ev(`return !document.getElementById('nextUp').classList.contains('hidden')`), 'rest screen between stations');
await shot('27-plan-next');
await ev(`document.getElementById('nuGo').click();`); await sleep(600);
check(await ev(`return __wh.plan.i === 1 && __wh.session && __wh.session.mode === 'dribble30'`), 'plan moves to station 2 (Handles 30)');
await ev(`document.getElementById('cEnd').click();`); await sleep(800);
check(await ev(`return document.getElementById('summary').textContent.includes('Quick 10')`), 'plan summary');
await shot('28-plan-summary');
// team mode: 2 kids
await ev(`__wh.P.addPlayer('Mia', 7); __wh.P.select(__wh.P.players()[0].id); __wh.go('sHome'); document.querySelector('[data-mode=team]').click(); document.getElementById('btnStart').click();`); await sleep(300);
await ev(`document.querySelectorAll('#teamKids input').forEach((i) => { i.checked = true; }); document.getElementById('teamKids').dispatchEvent(new Event('change')); document.getElementById('teamDrill').value = 'dribble30'; document.getElementById('teamDrill').dispatchEvent(new Event('change')); document.getElementById('teamGo').click();`);
await waitReady(); await ev(`document.getElementById('btnGo').click();`); await sleep(3200);
await ev(`for (let i = 1; i <= 12; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i, hand: 1 }); __wh.session.seconds = 31;`); await sleep(2000);
check(await ev(`return !document.getElementById('nextUp').classList.contains('hidden') && document.getElementById('nextUp').textContent.includes('Mia')`), 'team mode: next kid up');
await ev(`document.getElementById('nuGo').click();`); await sleep(500);
await ev(`for (let i = 1; i <= 20; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i, hand: 1 }); __wh.session.seconds = 31;`); await sleep(2200);
check(await ev(`return document.getElementById('summary').textContent.includes('Team mode') && document.querySelectorAll('#summary table.box tr').length === 3`), 'team results table');
await shot('29-team');
check(await ev(`return __wh.P.players().find((p) => p.name === 'Mia').bests.dribble30`) === 20, 'team turn saved to the right kid');
// profile: style picker + shot chart
await ev(`__wh.P.select(__wh.P.players()[0].id); __wh.go('sProfile');`); await sleep(300);
check(await ev(`return document.querySelectorAll('[data-style]').length === 13 && document.querySelectorAll('[data-style]:disabled').length > 0`), 'style picker with locked items');
await ev(`const pl = __wh.P.current(); for (let k = 0; k < 12; k++) pl.shotLog.push({ x: 0.2 + (k % 6) * 0.12, y: 0.85 + (k % 3) * 0.04, m: k % 3 !== 0, at: Date.now() }); __wh.go('sProfile');`); await sleep(200);
check(await ev(`return !!document.querySelector('.shotchart')`), 'shot chart on the profile');
await ev(`document.querySelector('[data-style=whistle][data-v=fox]').click();`);
check(await ev(`return __wh.P.current().style.whistle`) === 'fox', 'unlocked whistle picked');
await shot('30-profile-style');
// parent report + a shared link
await ev(`__wh.go('sReport');`); await sleep(300);
check(await ev(`return !!document.querySelector('#report .report')`), 'parent report renders');
await shot('31-report');
const link = await ev(`const { encodeReport, buildReport } = await import('./js/report.js'); return location.pathname + '?test&report=' + encodeReport(buildReport(__wh.P.current(), 7));`);
await send('Page.navigate', { url: 'http://localhost:8090' + link }); await sleep(2500);
check(await ev(`return document.getElementById('sReport').classList.contains('on') && document.getElementById('repBar').classList.contains('hidden') && document.querySelector('#report h2').textContent === 'Jordan'`), 'shared report link opens read-only');
await shot('32-shared-report');

console.log('\nERRORS (' + errs.length + ')'); for (const e of errs) console.log('  ' + e);
ws.close(); ch.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(errs.length ? 1 : 0);
