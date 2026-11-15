// sample HSV at points of a clip frame: node tools/px-probe.mjs clip time x,y x,y ... (x,y normalised)
import { launch, sleep } from './cdp.mjs';
const [clip, time, ...pts] = process.argv.slice(2);
const b = await launch();
await b.nav('http://localhost:8090/?test'); await sleep(1000);
const r = await b.ev(`
  const { hsv } = await import('./js/ball.js');
  const v = document.createElement('video'); v.muted = true; v.src = 'tools/clips/${clip}.mp4';
  await new Promise(r => v.onloadedmetadata = r); v.currentTime = ${time}; await new Promise(r => v.onseeked = r);
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const x = c.getContext('2d'); x.drawImage(v, 0, 0);
  return ${JSON.stringify(pts)}.map(p => { const [nx, ny] = p.split(',').map(Number); const d = x.getImageData(nx * c.width - 3, ny * c.height - 3, 7, 7).data; const hs = []; for (let i = 0; i < d.length; i += 4) hs.push(hsv(d[i], d[i+1], d[i+2]));
    hs.sort((a, b) => a.s - b.s); const m = hs[hs.length >> 1]; return p + ' h' + m.h.toFixed(0) + ' s' + m.s.toFixed(2) + ' v' + m.v.toFixed(2); }).join(' | ');`);
console.log(r); await b.close();
