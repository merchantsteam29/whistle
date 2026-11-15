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

console.log('\nERRORS (' + errs.length + ')'); for (const e of errs) console.log('  ' + e);
ws.close(); ch.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(errs.length ? 1 : 0);
