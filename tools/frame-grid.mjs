// save a clip frame with a 0.1 grid: node tools/frame-grid.mjs clip time out.png
import { launch, sleep } from './cdp.mjs';
const [clip, time, out] = process.argv.slice(2);
const b = await launch({ width: 1280, height: 720 });
await b.nav('http://localhost:8090/?test'); await sleep(800);
await b.ev(`
  document.body.innerHTML = ''; document.body.style.margin = 0;
  const v = document.createElement('video'); v.muted = true; v.src = 'tools/clips/${clip}.mp4';
  await new Promise(r => v.onloadedmetadata = r); v.currentTime = ${time}; await new Promise(r => v.onseeked = r);
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720; c.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(c);
  const x = c.getContext('2d'); x.drawImage(v, 0, 0, 1280, 720);
  x.strokeStyle = 'rgba(255,0,255,.7)'; x.fillStyle = '#f0f'; x.font = '14px sans-serif';
  for (let i = 1; i < 10; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 720); x.moveTo(0, i * 72); x.lineTo(1280, i * 72); x.stroke(); x.fillText('.' + i, i * 128 + 2, 14); x.fillText('.' + i, 2, i * 72 - 2); }`);
await sleep(200); await b.shot(out); await b.close();
