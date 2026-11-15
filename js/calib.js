// Calibration wizard: 1) stand still 3 s, 2) dribble 5 times. From that, WHISTLE learns this kid's
// tracking noise, ball size and dribble speed and sets its own thresholds. Pure maths.
export class Calibrator {
  constructor() { this.still = []; this.balls = []; this.dribbles = []; this.step = 'still'; }
  // while standing still: the feet positions (aspect units) and torso size each frame
  addStill(feet, S, t) { if (feet[0] && feet[1] && S) this.still.push({ t, f: feet.map((p) => ({ X: p.X, Y: p.Y })), S }); }
  addBall(ball, S) { if (ball && S) this.balls.push(ball.r / S); }
  addDribble(t) { this.dribbles.push(t); }
  result() {
    // foot jitter: average speed of the "still" feet over 0.15 s windows, in torso lengths / s
    let sum = 0, n = 0;
    for (let i = 0; i < this.still.length; i++) {
      const a = this.still[i], b = this.still.find((q) => q.t >= a.t + 0.15);
      if (!b) break;
      for (const k of [0, 1]) { sum += Math.hypot(b.f[k].X - a.f[k].X, b.f[k].Y - a.f[k].Y) / (b.t - a.t) / a.S; n++; }
    }
    const noise = n ? sum / n : 0.2;
    const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
    const gaps = this.dribbles.slice(1).map((t, i) => t - this.dribbles[i]);
    return {
      noise: +noise.toFixed(3),
      // the step detector needs to be well above the noise; never below the default
      footV: +Math.min(1.8, Math.max(1.0, noise * 4)).toFixed(2),
      stepDist: +Math.min(0.32, Math.max(0.22, noise * 0.6)).toFixed(3),
      ballRR: med(this.balls) && +med(this.balls).toFixed(3),
      drPeriod: med(gaps) && +med(gaps).toFixed(2),
      at: Date.now(),
    };
  }
}
