// Instant replay: keeps the last ~4.5 s as small frames (plus where the body and ball were), and plays
// them back in slow motion with the skeleton drawn on, so kids can see exactly why a call was made.
import { BONES } from './pose.js';

export class Replay {
  constructor(video) { this.video = video; this.frames = []; this.secs = 4.5; this.fps = 15; this.last = 0; this.busy = false; this.frozen = false; this.on = true; }
  // call once per processed camera frame
  push(now, poses, ball, mirror) {
    if (!this.on || this.frozen || this.busy || now - this.last < 1000 / this.fps || !this.video.videoWidth || typeof createImageBitmap !== 'function') return;
    this.last = now; this.busy = true;
    const w = 400, h = Math.round((w * this.video.videoHeight) / this.video.videoWidth);
    const poseCopy = poses.map((lm) => lm && lm.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })));
    createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' }).then((bmp) => {
      this.busy = false;
      if (this.frozen) { bmp.close(); return; }
      this.frames.push({ t: now, bmp, poses: poseCopy, ball: ball && { ...ball }, mirror });
      while (this.frames.length && now - this.frames[0].t > this.secs * 1000) this.frames.shift().bmp.close();
    }).catch(() => { this.busy = false; });
  }
  clear() { for (const f of this.frames) f.bmp.close(); this.frames = []; }
  get ready() { return this.frames.length > 8; }

  // a full-screen player. title: what the call was
  open(title, colors = ['#eef3fb']) {
    if (!this.ready) return false;
    this.frozen = true;
    const frames = this.frames.slice();
    const w = document.createElement('div'); w.className = 'replay';
    w.innerHTML = `<div class="rp-top"><b>INSTANT REPLAY</b><span>${title ? String(title).replace(/[<>&]/g, '') : ''}</span></div><canvas></canvas>
      <div class="rp-bar"><button class="btn sm" data-a="play">Pause</button><button class="btn sm" data-a="speed">Speed 0.35×</button><input type="range" min="0" max="${frames.length - 1}" value="0" aria-label="Replay position"><button class="btn sm primary" data-a="close">Back to the game</button></div>`;
    document.body.appendChild(w);
    const cv = w.querySelector('canvas'), g = cv.getContext('2d'), range = w.querySelector('input');
    const W = frames[0].bmp.width, H = frames[0].bmp.height;
    cv.width = W * 2; cv.height = H * 2;
    let i = 0, playing = true, speed = 0.35, acc = 0, lt = performance.now(), raf = 0;
    const span = (frames[frames.length - 1].t - frames[0].t) / frames.length;
    const draw = () => {
      const f = frames[i], X = cv.width, Y = cv.height;
      g.save(); if (f.mirror) { g.translate(X, 0); g.scale(-1, 1); }
      g.drawImage(f.bmp, 0, 0, X, Y);
      f.poses.forEach((lm, k) => {
        if (!lm) return;
        g.strokeStyle = colors[k] || colors[0]; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
        for (const [a, b] of BONES) { const A = lm[a], B = lm[b]; if (A && B && A.v > 0.4 && B.v > 0.4) { g.moveTo(A.x * X, A.y * Y); g.lineTo(B.x * X, B.y * Y); } }
        g.stroke();
        for (const j of [27, 28]) { const A = lm[j]; if (A && A.v > 0.4) { g.fillStyle = '#ffc53d'; g.beginPath(); g.arc(A.x * X, A.y * Y, 8, 0, 7); g.fill(); } }
      });
      if (f.ball) { g.strokeStyle = '#ff7a1a'; g.lineWidth = 4; g.beginPath(); g.arc(f.ball.x * X, f.ball.y * Y, Math.max(10, f.ball.r * Y * 1.2), 0, 7); g.stroke(); }
      g.restore();
      range.value = i;
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = now - lt; lt = now;
      if (playing) { acc += dt * speed; while (acc >= span) { acc -= span; i = (i + 1) % frames.length; } }
      draw();
    };
    raf = requestAnimationFrame(loop);
    const close = () => { cancelAnimationFrame(raf); w.remove(); this.frozen = false; removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); playing = !playing; } };
    addEventListener('keydown', key, true);
    w.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') close();
      if (a === 'play') { playing = !playing; e.target.textContent = playing ? 'Pause' : 'Play'; }
      if (a === 'speed') { speed = speed < 0.3 ? 0.35 : speed < 0.6 ? 1 : 0.2; e.target.textContent = `Speed ${speed}×`; }
    });
    range.addEventListener('input', () => { i = +range.value; playing = false; w.querySelector('[data-a=play]').textContent = 'Play'; });
    return true;
  }
}
