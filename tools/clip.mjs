// Runs a real video clip through the whole app (pose + ball + ref) instead of the camera and
// prints what it saw and called. Needs the server (node serve.js) and clips in tools/clips/.
//   node tools/clip.mjs 2272 [rate=0.5] [--hoop=x1,y1,x2,y2] [--mode=free|game] [--shots]
import { launch, sleep } from './cdp.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const [clip = '2272', rate = '0.5'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const shotsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots', 'clip-' + clip);
const b = await launch({ width: 1280, height: 720, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
await b.nav(`http://localhost:8090/?test&debug&trace&src=tools/clips/${clip}.mp4&rate=${rate}${flag("slow") ? "&slow=" + flag("slow") : ""}`);
await sleep(1500);
const hoop = flag('hoop');
await b.ev(`
  const s = __wh.P.settings(); s.hoop = ${hoop ? JSON.stringify(Object.fromEntries(hoop.split(',').map((v, i) => [['x1', 'y1', 'x2', 'y2'][i], +v]))) : 'null'};
  ${flag('extra') || ''}
  if (!__wh.P.current()) __wh.P.addPlayer('Clip', 1);
  ${flag('mode') ? `document.querySelector('[data-mode=${flag('mode')}]')?.click();` : ''}
  document.getElementById('btnStart').click();`);
for (let i = 0; i < 80; i++) { await sleep(500); if (await b.ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; }
await b.ev(`document.getElementById('btnGo').click();`);
await sleep(3000);
await b.ev(`Object.keys(__wh.stats).forEach((k) => (__wh.stats[k] = 0)); __wh.video.currentTime = 0; await __wh.video.play();`);
const dur = await b.ev(`return __wh.video.duration`);
let n = 0;
for (;;) {
  await sleep(1000);
  const st = await b.ev(`return [__wh.video.currentTime, __wh.video.ended]`);
  if (n < 6 && st[0] > (n + 0.5) * (dur / 6)) { await b.shot(path.join(shotsDir, `${n}.png`)); n++; }
  if (st[1] || st[0] >= dur - 0.05) break;
}
const res = await b.ev(`const S = __wh.stats; return { frames: S.frames, poseRate: +(S.pose / S.frames).toFixed(2), ballRate: +(S.ball / S.frames).toFixed(2), aiRate: +(S.ai / S.frames).toFixed(2), msPerFrame: +(S.ms / S.frames).toFixed(1), log: __wh.log, extra: __wh.extra?.() }`);
const counts = {};
for (const e of res.log) { const k = e.type + (e.kind ? ':' + e.kind : '') + (e.made != null ? ':' + e.made : ''); counts[k] = (counts[k] || 0) + 1; }
console.log(`clip ${clip}  ${dur.toFixed(1)}s @ rate ${rate}: ${res.frames} frames (${(res.frames / dur).toFixed(1)}/s of video), pose found ${res.poseRate * 100}%, ball found ${Math.round(res.ballRate * 100)}% (AI ${Math.round(res.aiRate * 100)}%), ${res.msPerFrame} ms/frame`);
console.log('events:', JSON.stringify(counts));
console.log('timeline:', res.log.filter((e) => !['dribble', 'release'].includes(e.type)).map((e) => `${e.t}:${e.type}${e.kind ? '/' + e.kind : ''}${e.made != null ? '/' + e.made : ''}${e.who != null ? '#' + e.who : ''}`).join(' '));
const dr = res.log.filter((e) => e.type === 'dribble').map((e) => e.t);
console.log('dribbles at:', dr.join(' '));
if (res.extra) console.log('extra:', JSON.stringify(res.extra));
if (process.argv.includes('--trace')) {
  const tr = (await b.ev(`return __wh.trace.join('##')`)).split('##');
  const [a, z] = (flag('span') || '0,999').split(',').map(Number);
  console.log(tr.filter((l) => +l.split(' ')[0] >= a && +l.split(' ')[0] <= z).join('\n'));
}
if (b.errs.length) console.log('ERRORS:', b.errs.join('\n'));
await b.close();
