// Ball finding = two trackers working together:
//  1. Colour tracker (fast, every frame): the frame is shrunk to 256 px, pixels close to the ball's
//     colour are grouped into blobs, and round blobs become candidates.
//  2. AI ball finder (MediaPipe object detector, "sports ball"): slower, so it runs every few frames,
//     or every frame while the colour tracker has lost the ball. It works on any ball, and it teaches
//     the colour tracker the ball's real colour automatically.
// BallFinder fuses them. A candidate only counts when it is believable: near a player, or where the
// ball was heading. Blobs that sit still for seconds with no hand near (a rock, a painted line, a
// shoe) are remembered as background and ignored.

export const DEFAULT_COLOR = { h: 20, s: 0.7, v: 0.6 }; // a normal orange basketball

export class BallTracker {
  constructor() {
    this.W = 256; this.H = 144;
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.color = { ...DEFAULT_COLOR };
    this.tol = 1;
    this.resize(16, 9);
  }

  resize(vw, vh) {
    const H = Math.max(36, Math.round((this.W * vh) / vw));
    if (H === this.H && this.mask) return;
    this.H = H; this.cv.width = this.W; this.cv.height = H;
    const n = this.W * H;
    this.mask = new Uint8Array(n); this.seen = new Uint8Array(n); this.stack = new Int32Array(n);
  }

  grab(video) {
    if (video.videoWidth) this.resize(video.videoWidth, video.videoHeight);
    this.ctx.drawImage(video, 0, 0, this.W, this.H);
    this.px = this.ctx.getImageData(0, 0, this.W, this.H).data;
    const n = this.W * this.H;
    if (!this.gray || this.gray.length !== n) { this.gray = new Uint8Array(n); this.prevGray = null; }
    else { this.prevGray ||= new Uint8Array(n); this.prevGray.set(this.gray); }
    const px = this.px, gr = this.gray;
    for (let i = 0; i < n; i++) gr[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
  }

  // median colour around (nx, ny); with r (normalised to height) it samples a disc and keeps only
  // coloured pixels (used to learn the colour from an AI detection)
  sample(nx, ny, r = 0) {
    if (!this.px) return null;
    const cx = nx * (this.W - 1), cy = ny * (this.H - 1), rad = r ? Math.max(1.5, r * this.H) : 2.5;
    const hs = [], ss = [], vs = [];
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H || (x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      const i = (y * this.W + x) * 4, c = hsv(this.px[i], this.px[i + 1], this.px[i + 2]);
      if (r && (c.s < 0.25 || c.v < 0.15)) continue;
      hs.push(c.h); ss.push(c.s); vs.push(c.v);
    }
    if (!hs.length || (r && hs.length < 6)) return null;
    const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
    const h0 = hs[0], rel = hs.map((h) => ((h - h0 + 540) % 360) - 180);
    return { h: (h0 + med(rel) + 360) % 360, s: med(ss), v: med(vs), n: hs.length };
  }

  setColor(c) { if (c) this.color = { h: c.h, s: c.s, v: c.v }; }

  // all round blobs of the ball colour: [{x, y, r, score}] best first. excludes: [{x,y,r}] (faces)
  // excludes: circles {x, y, r} and capsules {x, y, x2, y2, r} (normalised, r in height units) that
  // cover body parts: skin and clothes can be ball-coloured, so the legs, upper arms and face are skipped
  prepEx(excludes) {
    const { W, H } = this;
    return excludes.map((e) => ({ ax: e.x * W, ay: e.y * H, bx: (e.x2 ?? e.x) * W, by: (e.y2 ?? e.y) * H, r2: (e.r * H) ** 2 }));
  }
  inEx(x, y, ex) {
    for (const e of ex) {
      const dx = e.bx - e.ax, dy = e.by - e.ay, L = dx * dx + dy * dy;
      const u = L ? Math.max(0, Math.min(1, ((x - e.ax) * dx + (y - e.ay) * dy) / L)) : 0;
      if ((x - e.ax - u * dx) ** 2 + (y - e.ay - u * dy) ** 2 < e.r2) return true;
    }
    return false;
  }

  // round blobs of the ball's colour
  candidates(excludes = []) {
    const { W, H, px, mask } = this;
    if (!px) return [];
    const c = this.color, tol = this.tol;
    if (c.s < 0.25) return []; // a white / grey ball: colour can't find it, motion does
    const hTol = 12 * tol, sMin = Math.max(0.3, c.s * (1 - 0.35 * tol)), vMin = c.v * (1 - 0.6 * tol);
    const ex = this.prepEx(excludes);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      let on = 0;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255;
      if (v >= vMin && mx > 0 && (mx - mn) / mx >= sMin) {
        let d = Math.abs(hue(r, g, b, mx, mn) - c.h); if (d > 180) d = 360 - d;
        if (d <= hTol && !this.inEx(x, y, ex)) on = 1;
      }
      mask[i] = on;
    }
    return this.blobs(2.2, 0.38);
  }

  // things that moved since the last frame (any colour of ball), with the body masked out
  motionCandidates(excludes = []) {
    const { W, H, gray, prevGray, mask } = this;
    if (!gray || !prevGray) return [];
    const ex = this.prepEx(excludes);
    let moving = 0;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const on = Math.abs(gray[i] - prevGray[i]) > 20 && !this.inEx(x, y, ex) ? 1 : 0;
      mask[i] = on; moving += on;
    }
    if (moving > W * H * 0.15) return []; // the camera moved / lighting jumped: nothing useful
    return this.blobs(3.0, 0.3).map((b) => ({ ...b, score: b.score * 0.6, motion: true }));
  }

  blobs(maxAr, minFill) {
    const { W, H, mask, seen, stack } = this;
    seen.fill(0);
    const out = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      let sp = 0, area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const j = stack[--sp], x = j % W, y = (j / W) | 0;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack[sp++] = j - 1; }
        if (x < W - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack[sp++] = j + 1; }
        if (y > 0 && mask[j - W] && !seen[j - W]) { seen[j - W] = 1; stack[sp++] = j - W; }
        if (y < H - 1 && mask[j + W] && !seen[j + W]) { seen[j + W] = 1; stack[sp++] = j + W; }
      }
      if (area < 4) continue;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ar = bw / bh, fill = area / (bw * bh);
      if (ar < 1 / maxAr || ar > maxAr || fill < minFill || Math.max(bw, bh) > H * 0.4) continue;
      const score = area * Math.min(1, fill / 0.7) * Math.min(1, Math.min(ar, 1 / ar) / 0.75);
      // a moving ball smears into an oval: its size is the short side
      const rad = maxAr > 2.5 ? Math.min(bw, bh) / 2 : Math.max(bw, bh) / 2;
      out.push({ x: (sx / area + 0.5) / W, y: (sy / area + 0.5) / H, r: rad / H, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }
}

// ----------------------------------------------------------------------------------------------
export class BallFinder {
  constructor(tracker) {
    this.tr = tracker;
    this.det = null;        // AI detector (pose.js createBallDetector), optional
    this.useAI = false;
    this.useMotion = true;
    this.autoColor = true;  // learn the colour from AI hits (off once the user taps the ball)
    this.reset();
  }
  reset() {
    this.track = null;      // {x, y, r, vx, vy, t, src}
    this.spots = [];        // colour blobs being watched for "never moves" (background)
    this.bg = [];           // background spots to ignore: {x, y, r, until}
    this.n = 0; this.trust = 0.5; this.learned = 0; this.lastAI = null; this.aiRuns = 0;
  }

  // people: [{box: {x0,y0,x1,y1}, hands: [{x,y}], S}] in normalised coords (S = torso length in height units)
  find(t, video, ts, people, aspect) {
    this.n++;
    const tr = this.tr;
    const cands = tr.candidates(people.flatMap((p) => p.ex || []));
    // motion finds a ball of any colour; a colour blob that is also moving is very likely the ball
    const mov = this.useMotion ? tr.motionCandidates(people.flatMap((p) => p.exMove || p.ex || [])) : [];
    for (const c of cands) if (mov.some((m) => Math.hypot((m.x - c.x) * aspect, m.y - c.y) < Math.max(c.r, m.r) * 1.3)) { c.score *= 1.6; c.moving = true; }
    const pool = cands.concat(mov.filter((m) => !cands.some((c) => Math.hypot((m.x - c.x) * aspect, m.y - c.y) < Math.max(c.r, m.r) * 1.3)));
    const S = people.length ? people.reduce((a, p) => a + p.S, 0) / people.length : 0.2;
    const track = this.track && t - this.track.t < 0.6 ? this.track : null;

    // AI (optional): it is slow and only sure of clear, sharp balls, so it runs every few frames
    let dets = null;
    if (this.det && this.useAI && this.n % (track ? 6 : 3) === 0) {
      dets = this.runAI(video, ts, people, track)?.filter((d) => d.score >= 0.45); this.aiRuns++;
    }

    const near = (b) => this.plausible(b, people, track, t, S, aspect);
    let best = null;
    if (dets && dets.length) {
      let bs = 0;
      for (const d of dets) { const p = near(d); const s = d.score * (0.35 + p); if (p > 0 && s > bs) { bs = s; best = d; } }
      if (best) {
        best = { ...best, src: 'ai' };
        // a colour blob on the same spot gives a tighter centre; and it means colour is right
        const cb = cands.find((c) => Math.hypot((c.x - best.x) * aspect, c.y - best.y) < best.r * 1.2);
        if (cb) { best.x = cb.x; best.y = cb.y; this.trust = Math.min(1, this.trust + 0.15); }
        else if (cands.length) this.trust = Math.max(0, this.trust - 0.1);
        this.unBackground(best);
        if (this.autoColor && best.score > 0.45) this.learnColor(best);
      }
    }
    if (!best) {
      let bs = 0;
      for (const c of pool) {
        if (!c.motion && this.isBackground(c, people, t)) continue;
        const p = near(c); if (!p) continue;
        const s = c.score * p; if (s > bs) { bs = s; best = { ...c, src: c.motion ? 'motion' : 'color' }; }
      }
    }
    this.watchStill(cands, people, t);
    if (best) {
      const prev = track;
      const dt = prev ? Math.max(0.001, t - prev.t) : 0;
      this.track = { x: best.x, y: best.y, r: best.r, t, src: best.src,
        vx: prev && dt < 0.3 ? (best.x - prev.x) / dt : 0, vy: prev && dt < 0.3 ? (best.y - prev.y) / dt : 0 };
      return { x: best.x, y: best.y, r: best.r, src: best.src };
    }
    return null;
  }

  // 0 = not believable, up to ~2 = right where expected
  plausible(b, people, track, t, S, aspect) {
    let p = 0;
    if (track) {
      const dt = t - track.t, px = track.x + track.vx * dt, py = track.y + track.vy * dt;
      const gate = 1.0 * S + Math.hypot(track.vx * aspect, track.vy) * dt * 0.6 + track.r * 2;
      const d = Math.hypot((b.x - px) * aspect, b.y - py);
      if (d < gate) p = Math.max(p, 2 - d / gate);
    }
    for (const q of people) {
      const bx = q.box, m = q.S;
      if (b.x < bx.x0 - 1.4 * m / aspect || b.x > bx.x1 + 1.4 * m / aspect || b.y < bx.y0 - 2.5 * m || b.y > bx.y1 + 0.35 * m) continue;
      // size check: a basketball is ~0.2-0.7 torso lengths across (looser for other balls)
      // size: a basketball is ~a quarter of a torso across (radius ~0.27 torso); mini balls smaller
      const rr = b.r / m; if (rr < 0.09 || rr > 0.6) continue;
      let s = 0.8 * Math.exp(-(Math.log(rr / 0.27) ** 2) / (2 * 0.45 * 0.45));
      for (const h of q.hands) if (h && Math.hypot((b.x - h.x) * aspect, b.y - h.y) < 0.9 * m + b.r) s = 1.4;
      p = Math.max(p, s);
    }
    if (!people.length && !track) p = 0.5; // nobody in view yet: anything round (setup screen)
    return p;
  }

  // background: a blob that stays put for 2 s with no hand near it
  watchStill(cands, people, t) {
    const handNear = (c) => people.some((q) => q.hands.some((h) => h && Math.hypot(c.x - h.x, c.y - h.y) < 0.8 * q.S + c.r));
    for (const s of this.spots) s.hit = false;
    for (const c of cands.slice(0, 5)) {
      let s = this.spots.find((s) => Math.hypot(s.x - c.x, s.y - c.y) < Math.max(c.r * 0.8, 0.008));
      if (!s) { s = { x: c.x, y: c.y, r: c.r, since: t, seen: t }; this.spots.push(s); }
      s.hit = true; s.seen = t;
      if (handNear(c)) s.since = t;
      if (t - s.since > 2.0 && !this.bg.some((b) => Math.hypot(b.x - s.x, b.y - s.y) < b.r)) this.bg.push({ x: s.x, y: s.y, r: Math.max(s.r * 1.6, 0.015), until: t + 40 });
    }
    this.spots = this.spots.filter((s) => t - s.seen < 0.4);
    this.bg = this.bg.filter((b) => b.until > t);
  }
  isBackground(c, people, t) {
    const b = this.bg.find((b) => Math.hypot(b.x - c.x, b.y - c.y) < b.r);
    if (!b) return false;
    // a hand on it = probably the real ball sitting there: give it back
    if (people.some((q) => q.hands.some((h) => h && Math.hypot(c.x - h.x, c.y - h.y) < 0.6 * q.S + c.r))) return false;
    return true;
  }
  unBackground(ball) { this.bg = this.bg.filter((b) => Math.hypot(b.x - ball.x, b.y - ball.y) > b.r + ball.r); }

  learnColor(d) {
    const c = this.tr.sample(d.x, d.y, d.r * 0.55);
    if (!c) { this.learned = Math.max(-5, this.learned - 1); if (this.learned < -2) this.tr.setColor({ h: 0, s: 0, v: 0 }); return; } // grey/white ball: AI only
    const o = this.tr.color, a = this.learned > 3 ? 0.15 : 0.5;
    let dh = c.h - o.h; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    if (o.s < 0.25) this.tr.setColor(c);
    else this.tr.setColor({ h: (o.h + dh * a + 360) % 360, s: o.s + (c.s - o.s) * a, v: o.v + (c.v - o.v) * a });
    this.learned = Math.min(10, this.learned + 1);
  }

  // run the detector on a square crop around the players (balls are small: a crop keeps detail)
  runAI(video, ts, people, track) {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const q of people) { x0 = Math.min(x0, q.box.x0 - 1.2 * q.S * vh / vw); x1 = Math.max(x1, q.box.x1 + 1.2 * q.S * vh / vw); y0 = Math.min(y0, q.box.y0 - 1.5 * q.S); y1 = Math.max(y1, q.box.y1 + 0.3 * q.S); }
    if (track) { x0 = Math.min(x0, track.x - 0.08); x1 = Math.max(x1, track.x + 0.08); y0 = Math.min(y0, track.y - 0.12); y1 = Math.max(y1, track.y + 0.12); }
    let crop = null;
    if (x1 > x0 && y1 > y0) {
      // square in pixels, at least 360 px, clamped to the frame
      let cx = (x0 + x1) / 2 * vw, cy = (y0 + y1) / 2 * vh, side = Math.max((x1 - x0) * vw, (y1 - y0) * vh, 360);
      side = Math.min(side, vw, vh);
      const sx = Math.max(0, Math.min(vw - side, cx - side / 2)), sy = Math.max(0, Math.min(vh - side, cy - side / 2));
      if (side < Math.min(vw, vh) * 0.95) crop = { sx, sy, side };
    }
    let res;
    try { res = this.det.detect(video, ts, crop); } catch (e) { return null; }
    this.lastAI = res;
    return res;
  }
}

function hue(r, g, b, mx, mn) {
  const d = mx - mn; if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return { h: hue(r, g, b, mx, mn), s: mx ? (mx - mn) / mx : 0, v: mx / 255 };
}
