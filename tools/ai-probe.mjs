// Probe the AI ball detector on frames of a clip: node tools/ai-probe.mjs <clip> [model path under mediapipe-models/object_detector/]
import { launch, sleep } from './cdp.mjs';
const clip = process.argv[2] || '2272', model = process.argv[3] || 'efficientdet_lite2/float16/1/efficientdet_lite2.tflite';
const b = await launch();
await b.nav('http://localhost:8090/?test'); await sleep(1500);
const r = await b.ev(`
  const lib = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await lib.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const det = await lib.ObjectDetector.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/${model}', delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: 0.1, maxResults: 10, categoryAllowlist: ['sports ball'] });
  const v = document.createElement('video'); v.muted = true; v.src = 'tools/clips/${clip}.mp4';
  await new Promise(r => v.onloadedmetadata = r);
  const out = []; let hitF = 0, hitC = 0; const N = 16;
  const cv = document.createElement('canvas'), cx = cv.getContext('2d');
  for (let k = 1; k <= N; k++) {
    v.currentTime = v.duration * k / (N + 1); await new Promise(r => v.onseeked = r);
    const vw = v.videoWidth, vh = v.videoHeight;
    cv.width = vw; cv.height = vh; cx.drawImage(v, 0, 0);
    const t0 = performance.now(); const f = det.detect(cv).detections; const ms = performance.now() - t0;
    // crop: square around the lower-middle (where a player + ball usually are)
    const side = vh; cv.width = cv.height = 512; cx.drawImage(v, (vw - side) / 2, 0, side, side, 0, 0, 512, 512);
    const c = det.detect(cv).detections;
    if (f.length) hitF++; if (c.length) hitC++;
    out.push(k + ' ' + Math.round(ms) + 'ms full[' + f.map(d => d.categories[0].score.toFixed(2) + '@' + ((d.boundingBox.originX + d.boundingBox.width / 2) / vw).toFixed(2) + ',' + ((d.boundingBox.originY + d.boundingBox.height / 2) / vh).toFixed(2)).join(',') + '] crop[' + c.map(d => d.categories[0].score.toFixed(2)).join(',') + ']');
  }
  return 'full ' + hitF + '/' + N + ', crop ' + hitC + '/' + N + ' ## ' + out.join(' ## ');`);
console.log(r.replaceAll(' ## ', '\n')); if (b.errs.length) console.log(b.errs.filter(e => !e.includes('XNNPACK')).join('\n'));
await b.close();
