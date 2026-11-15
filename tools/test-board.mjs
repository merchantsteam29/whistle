// Two browsers: one refs (fake camera), the other shows the second-screen scoreboard over PeerJS.
// Needs the internet (the PeerJS broker).  node tools/test-board.mjs
import { launch, sleep } from './cdp.mjs';
const ref = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const tv = await launch({ width: 1280, height: 720 });
let bad = 0; const check = (ok, n) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) bad++; };
await ref.nav('http://localhost:8090/?test'); await sleep(1500);
await ref.ev(`__wh.P.addPlayer('Jordan', 23); document.getElementById('btnStart').click();`);
for (let i = 0; i < 40; i++) { await sleep(400); if (await ref.ev(`return document.getElementById('loading').classList.contains('hidden')`)) break; }
await ref.ev(`document.getElementById('btnGo').click();`); await sleep(3200);
await ref.ev(`document.getElementById('cBoard').click();`);
let code = null;
for (let i = 0; i < 30 && !code; i++) { await sleep(500); code = await ref.ev(`return __wh.board.code`); }
check(!!code, `ref opened a scoreboard room (${code})`);
if (code) {
  await tv.nav(`http://localhost:8090/?board=${code}`);
  let txt = '';
  for (let i = 0; i < 30; i++) { await sleep(500); await ref.ev(`__wh.sendBoard()`); txt = await tv.ev(`return document.getElementById('bv').textContent`); if (/Dribbles/i.test(txt)) break; }
  check(/Dribbles/i.test(txt), 'scoreboard screen shows the live board');
  await ref.ev(`for (let i = 1; i <= 7; i++) __wh.onEvent({ type: 'dribble', streak: i, total: i, hand: 1 }); document.querySelector('.modal.on [data-x]')?.click();`);
  await sleep(1500); await ref.ev(`__wh.sendBoard()`); await sleep(800);
  const tiles = await tv.ev(`return [...document.querySelectorAll('.tile b')].map((b) => b.textContent).join(',')`);
  check(tiles.split(',')[1] === '7', `dribbles reach the scoreboard (${tiles})`);
  await ref.ev(`__wh.onEvent({ type: 'violation', kind: 'travel', why: '3 steps', title: 'TRAVELING', signal: 'Roll', tip: 'x' });`);
  await sleep(1200);
  check(/TRAVELING/.test(await tv.ev(`return document.getElementById('bv').textContent`)), 'calls show on the scoreboard');
  await tv.shot('tools/shots/board-tv.png');
  // the same room works as a remote control
  await tv.nav(`http://localhost:8090/?remote=${code}`);
  for (let i = 0; i < 30; i++) { await sleep(500); if (await tv.ev(`return !/Connecting|Waiting/.test(document.getElementById('rmScore').textContent)`)) break; }
  await sleep(500);
  await tv.ev(`document.querySelector('[data-c=pause]').click();`); await sleep(1200);
  check(await ref.ev(`return __wh.phase`) === 'paused', 'remote control: Pause works on the ref device');
  await tv.ev(`document.querySelector('[data-c=resume]').click();`); await sleep(1200);
  check(await ref.ev(`return __wh.phase`) === 'live', 'remote control: Resume');
  await tv.shot('tools/shots/remote.png');
}
console.log('errors:', [...ref.errs, ...tv.errs].join(' | ') || 'none');
await ref.close(); await tv.close();
process.exit(bad ? 1 : 0);
