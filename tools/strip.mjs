// frames every `step` s from t0..t1 as a contact sheet: node tools/strip.mjs clip t0 t1 step out.png
import { launch, sleep } from './cdp.mjs';
const [clip, t0, t1, step, out] = process.argv.slice(2);
const n = Math.round((t1 - t0) / step) + 1, cols = +(process.env.COLS || 8), rows = Math.ceil(n / cols), w = +(process.env.TW || 240), h = +(process.env.TH || 135);
const b = await launch({ width: cols * w, height: rows * h });
await b.nav('http://localhost:8090/?test'); await sleep(800);
await b.ev(`
  document.body.innerHTML = ''; document.body.style.margin = 0;
  const v = document.createElement('video'); v.muted = true; v.src = 'tools/clips/${clip}.mp4';
  await new Promise(r => v.onloadedmetadata = r);
  const c = document.createElement('canvas'); c.width = ${cols * w}; c.height = ${rows * h}; c.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(c);
  const x = c.getContext('2d'); x.font = 'bold 14px sans-serif';
  for (let i = 0; i < ${n}; i++) {
    const t = ${t0} + i * ${step}; v.currentTime = t; await new Promise(r => v.onseeked = r);
    const X = (i % ${cols}) * ${w}, Y = Math.floor(i / ${cols}) * ${h};
    x.drawImage(v, ${+(process.env.CX || 0)} * v.videoWidth, 0, ${+(process.env.CW || 1)} * v.videoWidth, v.videoHeight, X, Y, ${w}, ${h}); x.fillStyle = '#000a'; x.fillRect(X, Y, 44, 18); x.fillStyle = '#ff0'; x.fillText(t.toFixed(2), X + 3, Y + 14);
  }`);
await sleep(200); await b.shot(out); await b.close();
