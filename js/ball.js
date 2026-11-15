// Ball tracker: finds the basketball by its colour. The camera frame is shrunk to 256 px wide,
// each pixel is tested against the ball colour (hue / saturation / brightness), touching pixels
// are grouped into blobs, and the roundest, biggest blob near where the ball last was wins.
// Tap the ball in setup to teach it your ball's exact colour.

export const DEFAULT_COLOR = { h: 20, s: 0.7, v: 0.6 }; // a normal orange basketball

export class BallTracker {
  constructor() {
    this.W = 256; this.H = 144;
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.color = { ...DEFAULT_COLOR };
    this.tol = 1; // sensitivity multiplier (settings slider)
    this.last = null;
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
  }

  // the median colour of a small patch around (nx, ny), normalised video coords
  sample(nx, ny) {
    if (!this.px) return null;
    const cx = Math.round(nx * (this.W - 1)), cy = Math.round(ny * (this.H - 1));
    const hs = [], ss = [], vs = [];
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
      const i = (y * this.W + x) * 4, c = hsv(this.px[i], this.px[i + 1], this.px[i + 2]);
      hs.push(c.h); ss.push(c.s); vs.push(c.v);
    }
    if (!hs.length) return null;
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    // hue wraps around 360: take the median relative to the first sample
    const h0 = hs[0], rel = hs.map((h) => ((h - h0 + 540) % 360) - 180);
    const c = { h: (h0 + med(rel) + 360) % 360, s: med(ss), v: med(vs) };
    return c;
  }

  setColor(c) { if (c) { this.color = { ...c }; this.last = null; } }

  // excludes: [{x, y, r}] normalised circles to ignore (the face: skin can look orange)
  detect(t, excludes = []) {
    const { W, H, px, mask, seen, stack } = this;
    if (!px) return null;
    const c = this.color, tol = this.tol;
    const hTol = 14 * tol, sMin = Math.max(0.28, c.s * (1 - 0.45 * tol)), vMin = c.v * (1 - 0.65 * tol);
    const ex = excludes.map((e) => ({ x: e.x * W, y: e.y * H, r2: (e.r * H) ** 2 }));
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      let on = 0;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255;
      if (v >= vMin && mx > 0) {
        const s = (mx - mn) / mx;
        if (s >= sMin) {
          const h = hue(r, g, b, mx, mn);
          let d = Math.abs(h - c.h); if (d > 180) d = 360 - d;
          if (d <= hTol) {
            on = 1;
            for (const e of ex) if ((x - e.x) ** 2 + (y - e.y) ** 2 < e.r2) { on = 0; break; }
          }
        }
      }
      mask[i] = on; seen[i] = 0;
    }
    let best = null, bestScore = 0;
    const pred = this.last && t - this.last.t < 0.4 ? this.last : null;
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
      if (area < 5) continue;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ar = bw / bh, fill = area / (bw * bh);
      if (ar < 0.45 || ar > 2.2 || fill < 0.38 || Math.max(bw, bh) > H * 0.5) continue;
      const cx = sx / area, cy = sy / area, rad = Math.max(bw, bh) / 2;
      let score = area * Math.min(1, fill / 0.7) * Math.min(1, Math.min(ar, 1 / ar) / 0.75);
      if (pred) {
        const d = Math.hypot(cx / W - pred.x, (cy - pred.y * H) / H) / Math.max(0.02, pred.r * 4);
        score *= d < 3 ? 2.5 - d * 0.4 : 0.6;
      }
      if (score > bestScore) { bestScore = score; best = { x: (cx + 0.5) / W, y: (cy + 0.5) / H, r: rad / H, t }; }
    }
    this.last = best || (pred && t - pred.t < 0.4 ? pred : null);
    return best;
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
