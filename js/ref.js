// WHISTLE ref engine. Pure logic, no DOM, so it can be tested in Node (tools/test-ref.mjs).
//
// Every camera frame, feed it: the body pose (33 MediaPipe landmarks, normalised 0..1),
// the ball ({x, y, r} normalised, or null) and the hoop rim (two points, or null).
// It returns a list of events: dribble, gather, step, shot, shotResult, violation, ...
//
// Units: X is multiplied by the aspect ratio so distances are square; everything is then
// measured in "torso lengths" (S = shoulder-to-hip distance), so it works near or far.
//
// How the calls work:
//  - HOLDING: the ball sits near both hands for 0.2 s (or one hand while barely moving).
//  - DRIBBLE: the ball falls, then flips upward below the hips (a bounce) soon after a hand touched it.
//  - STEPS: a planted foot does not move in the picture, whatever the camera angle. A foot
//    that moves and then stays still again ~0.2 torso lengths away is one step (a landing).
//  - TRAVEL: picked up on the move -> more than `stepsAllowed` landings. Picked up standing
//    (or stopped) -> the first foot to step leaves the other as the pivot; the pivot stepping = travel.
//  - DOUBLE DRIBBLE: a bounce after the ball was held, when it had been dribbled before.
//  - SHOT: the ball leaves the hands upward above the shoulders. With a hoop marked, the ball
//    passing down through the rim line between the rim ends = make.

const I = { NOSE: 0, LSH: 11, RSH: 12, LWR: 15, RWR: 16, LIDX: 19, RIDX: 20, LHIP: 23, RHIP: 24, LANK: 27, RANK: 28, LHEEL: 29, RHEEL: 30 };
const mid = (a, b) => ({ X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2 });

export const CALLS = {
  travel: { title: 'TRAVELING', signal: 'Roll the arms', tip: 'Pick a pivot foot and keep it planted, or dribble before you move your feet.' },
  double: { title: 'DOUBLE DRIBBLE', signal: 'Pat the air with both hands', tip: 'Once you pick the ball up, your dribble is over. Pass or shoot.' },
};

export class Ref {
  constructor(opts = {}) {
    this.opts = { stepsAllowed: 2, ...opts };
    this.totalDribbles = 0;
    this.reset();
  }

  reset() {
    this.lastT = null; this.t = 0; this.S = null;
    this.ball = null; this.B = null; this.vx = 0; this.vy = 0;
    this.feet = [newFoot(), newFoot()];
    this.hipHist = [];
    this.lastLandT = -9; this.dead = -1; this.deadPending = false; this.bodyMissing = 0;
    this.shot = null; this.body = null; this.near = 0; this.ev = [];
    this.clearPossession();
  }

  clearPossession() {
    this.held = false; this.holdAcc = 0; this.sepAcc = 0;
    this.hasDribbled = false; this.pickedUp = false; this.dribbling = false; this.streak = 0;
    this.desc = false; this.descMaxY = 0; this.lastBounceT = -9; this.lastHandT = -9;
    this.steps = 0; this.mode = null; this.pivot = null; this.firstFoot = null; this.pivotSlips = 0; this.holdStart = 0;
    this.handBallY = 9; this.releaseT = -9; this.bounceSinceRelease = false; this.saved = null; this.farAcc = 0; this.cleanPending = false;
    this.lastDr = null; this.hiddenAcc = 0;
  }

  setOptions(o) { Object.assign(this.opts, o); }

  // What the HUD shows
  state() {
    return {
      held: this.held, mode: this.mode, steps: this.steps, allowed: this.opts.stepsAllowed, pivot: this.pivot,
      dribbling: this.dribbling, streak: this.streak, shot: !!this.shot, dead: this.t < this.dead, pickedUp: this.pickedUp,
      body: !!this.body, ball: !!this.B, feetMoving: this.feet.map((f) => f.moving),
    };
  }

  update({ t, aspect = 16 / 9, pose = null, ball = null, hoop = null }) {
    const ev = (this.ev = []);
    this.t = t;
    const dt = this.lastT == null ? 1 / 30 : Math.min(0.25, Math.max(0.001, t - this.lastT));
    this.lastT = t;

    // ball + its velocity (smoothed)
    let B = null;
    if (ball) {
      B = { X: ball.x * aspect, Y: ball.y, R: ball.r };
      if (this.ball && t - this.ball.t < 0.3) {
        const bdt = Math.max(0.001, t - this.ball.t), a = 0.6;
        this.vx = this.vx * (1 - a) + ((B.X - this.ball.X) / bdt) * a;
        this.vy = this.vy * (1 - a) + ((B.Y - this.ball.Y) / bdt) * a;
      } else { this.vx = 0; this.vy = 0; this.desc = false; }
      this.ball = { ...B, t };
    }
    this.B = B;

    const body = this.readBody(pose, aspect);
    this.body = body;
    if (!body) {
      this.bodyMissing += dt;
      if (this.bodyMissing > 1.2 && (this.held || this.dribbling || this.hasDribbled)) { this.endStreak('lost'); this.clearPossession(); }
      this.trackShot(B, hoop, aspect);
      return ev;
    }
    this.bodyMissing = 0;
    const S = this.S;

    // hip speed (for "picked up on the move")
    this.hipHist.push({ t, X: body.hip.X, Y: body.hip.Y });
    while (this.hipHist.length > 2 && t - this.hipHist[1].t >= 0.2) this.hipHist.shift();

    const live = t >= this.dead;
    if (live && this.deadPending) { this.deadPending = false; this.clearPossession(); }

    this.updateFeet(body, t, dt, live);

    let near = 0, nearHand = -1;
    if (B) body.hands.forEach((h, i) => { if (h && Math.hypot(h.X - B.X, h.Y - B.Y) - B.R < 0.5 * S) { near++; nearHand = i; } });
    // the ball is hidden (hands and body cover it a lot): two hands together in front of the body,
    // with the ball seen recently, means it is being held
    let virt = null;
    if (!B && this.ball && t - this.ball.t < 2.5) {
      const [h0, h1] = body.hands;
      if (h0 && h1 && Math.hypot(h0.X - h1.X, h0.Y - h1.Y) < 0.75 * S) {
        const my = (h0.Y + h1.Y) / 2;
        // chest / belly height only: in a side view, hands hanging at the hips overlap without holding anything
        if (my > body.shY - 0.6 * S && my < body.hipY - 0.15 * S) { virt = { X: (h0.X + h1.X) / 2, Y: my, R: 0.25 * S }; near = 2; }
      }
    }
    this.near = near; this.virtual = !!virt;
    if (near) { this.lastHandT = t; if (B) this.handBallY = B.Y; }
    if (near === 1 && B && B.Y > body.hipY - 0.3 * S) this.dribbleHand = nearHand;

    if (live) { this.possession(B || virt, near, body, dt, t, !!virt); this.pumps(body, t, dt, live); }
    this.trackShot(B, hoop, aspect);
    return ev;
  }

  readBody(pose, aspect) {
    if (!pose || pose.length < 31) return null;
    const P = (i) => { const p = pose[i]; return p ? { X: p.x * aspect, Y: p.y, v: p.visibility ?? 1 } : null; };
    const ls = P(I.LSH), rs = P(I.RSH), lh = P(I.LHIP), rh = P(I.RHIP);
    if (!ls || !rs || !lh || !rh || Math.min(ls.v, rs.v, lh.v, rh.v) < 0.4) return null;
    const sh = mid(ls, rs), hip = mid(lh, rh);
    const torso = Math.hypot(sh.X - hip.X, sh.Y - hip.Y);
    if (torso < 0.02) return null;
    this.S = this.S == null ? torso : this.S * 0.9 + torso * 0.1;
    const hand = (w, ix) => {
      const W = P(w), X = P(ix);
      if (!W || W.v < 0.3) return null;
      return X && X.v > 0.3 ? { X: W.X + (X.X - W.X) * 0.6, Y: W.Y + (X.Y - W.Y) * 0.6 } : W;
    };
    const foot = (a, h) => {
      const A = P(a), H = P(h);
      if (!A || A.v < 0.35) return null;
      return H && H.v > 0.35 ? mid(A, H) : A;
    };
    return { sh, hip, shY: sh.Y, hipY: hip.Y, nose: P(I.NOSE), hands: [hand(I.LWR, I.LIDX), hand(I.RWR, I.RIDX)], feet: [foot(I.LANK, I.LHEEL), foot(I.RANK, I.RHEEL)] };
  }

  hipSpeed() {
    const h = this.hipHist; if (h.length < 2) return 0;
    const a = h[0], b = h[h.length - 1], span = b.t - a.t;
    return span < 0.08 ? 0 : Math.hypot(b.X - a.X, b.Y - a.Y) / span / this.S;
  }

  // A foot is "moving" while it travels faster than 1 torso length / s; when it stays still
  // again far enough from where it left, that is a landing (one step).
  updateFeet(body, t, dt, live) {
    const S = this.S;
    body.feet.forEach((fp, i) => {
      const f = this.feet[i];
      if (!fp) { f.hist.length = 0; f.p = null; f.moving = false; return; }
      f.p = f.p ? { X: f.p.X + (fp.X - f.p.X) * 0.5, Y: f.p.Y + (fp.Y - f.p.Y) * 0.5 } : { X: fp.X, Y: fp.Y };
      f.hist.push({ t, X: f.p.X, Y: f.p.Y });
      while (f.hist.length > 2 && t - f.hist[1].t >= 0.15) f.hist.shift();
      const o = f.hist[0], span = t - o.t;
      if (span < 0.08) return;
      const v = Math.hypot(f.p.X - o.X, f.p.Y - o.Y) / span / S;
      if (!f.moving) {
        if (v > 1.0) { f.moving = true; f.calm = 0; f.liftPos = { X: o.X, Y: o.Y }; }
      } else if (v < 0.45) {
        f.calm += dt;
        if (f.calm >= 0.08) {
          f.moving = false;
          const d = Math.hypot(f.p.X - f.liftPos.X, f.p.Y - f.liftPos.Y) / S;
          if (d > 0.22) this.landing(i, t, live);
        }
      } else f.calm = 0;
    });
  }

  landing(foot, t, live) {
    this.lastLandT = t;
    if (!live || !this.held) return;
    this.steps++;
    this.ev.push({ type: 'step', foot, steps: this.steps });
    const allowed = this.opts.stepsAllowed;
    if (this.mode === 'moving') {
      if (this.firstFoot == null) this.firstFoot = foot;
      if (this.steps > allowed) this.call('travel', `${this.steps} steps without a dribble`);
    } else {
      if (this.pivot == null) this.pivot = 1 - foot;
      else if (foot === this.pivot) {
        this.pivotSlips++;
        if (this.pivotSlips > allowed - 2) this.call('travel', `Moved the pivot foot (${foot ? 'right' : 'left'})`);
      }
    }
  }

  possession(B, near, body, dt, t, virt) {
    const S = this.S;
    if (B) {
      this.hiddenAcc = 0;
      const speed = virt ? 0 : Math.hypot(this.vx, this.vy);
      if (near >= 2) this.holdAcc += dt;
      else if (near === 1 && speed < 1.5 * S) this.holdAcc += dt * 0.35; // one hand: ~0.6 s of a still ball (palming / carrying)
      else if (near === 0) this.holdAcc = 0;
      if (!this.held && this.holdAcc >= (virt ? 0.3 : 0.2) && !this.shot) this.gather(t);
      if (this.held) {
        if (near === 0) { this.sepAcc += dt; if (this.sepAcc >= 0.1) this.release(t); } else this.sepAcc = 0;
      }
      if (!this.held && !virt) this.freeBall(B, body, t, dt);
    } else if (this.held) {
      // hidden while held: usually still in the hands (under an arm, behind the body). But if the
      // hands are apart and it stays hidden, it most likely went back to dribbling out of view.
      this.hiddenAcc = (this.hiddenAcc || 0) + dt;
      if (this.hiddenAcc > 0.7) { this.held = false; this.holdAcc = 0; this.releaseT = t; this.bounceSinceRelease = false; this.saved = null; }
    }

    if (this.dribbling && !this.held && t - this.lastBounceT > 1.6) {
      // the dribble died without a pick-up: a lost ball, which resets the possession
      this.dribbling = false; this.hasDribbled = false; this.endStreak('lost');
    }
    if (this.held && this.mode === 'moving' && !this.feet.some((f) => f.moving) && t - this.lastLandT > 0.45 && t - this.holdStart > 0.45) {
      // stopped: now pivot rules, with the first foot down as the pivot
      this.mode = 'set'; this.pivot = this.firstFoot; this.pivotSlips = 0;
    }
  }

  gather(t) {
    this.held = true; this.sepAcc = 0;
    if (t - this.releaseT < 0.5 && !this.bounceSinceRelease && this.saved) {
      // a fumble / re-grip, not a new pick-up
      Object.assign(this, this.saved); this.saved = null; this.cleanPending = false; return;
    }
    const moving = this.feet.some((f) => f.moving) || t - this.lastLandT < 0.4 || this.hipSpeed() > 1.0;
    this.mode = moving ? 'moving' : 'set';
    this.steps = 0; this.pivot = null; this.firstFoot = null; this.pivotSlips = 0; this.holdStart = t;
    this.pickedUp = this.hasDribbled;
    if (this.dribbling) { this.dribbling = false; this.endStreak('pickup'); }
    this.ev.push({ type: 'gather', moving, pickedUp: this.pickedUp });
  }

  release(t) {
    this.held = false; this.sepAcc = 0; this.holdAcc = 0;
    this.releaseT = t; this.bounceSinceRelease = false; this.cleanPending = true;
    this.saved = { mode: this.mode, steps: this.steps, pivot: this.pivot, firstFoot: this.firstFoot, pivotSlips: this.pivotSlips, holdStart: this.holdStart };
    this.ev.push({ type: 'release' });
  }

  freeBall(B, body, t, dt) {
    const S = this.S;
    // shot: soon after leaving the hands the ball is above the shoulders and has risen well above where the hands had it
    if (!this.shot && t - this.releaseT < 0.8 && B.Y < body.shY - 0.2 * S && (B.Y < this.handBallY - 0.15 * S || this.vy < -1.5 * S) && this.vy < 0.5 * S) { this.startShot(B, t); return; }
    if (this.vy > 1.2 * S && !this.desc) { this.desc = true; this.descMaxY = B.Y; this.descN = 0; }
    if (this.desc) {
      this.descMaxY = Math.max(this.descMaxY, B.Y); this.descN++;
      if (this.vy < -1.2 * S) {
        this.desc = false;
        if (this.descMaxY > body.hipY + 0.15 * S && t - this.lastHandT < 1.2 && !this.shot) {
          let bi = -1, bd = 1e9; body.hands.forEach((h, i) => { if (h && Math.abs(h.X - B.X) < bd) { bd = Math.abs(h.X - B.X); bi = i; } });
          if (bi >= 0 && bd < 0.8 * S) this.dribbleHand = bi;
          this.bounce(t, 'ball');
        }
      }
    }
    const far = Math.hypot(B.X - body.hip.X, B.Y - body.hip.Y) > 3 * S;
    if (far) {
      this.farAcc += dt;
      if (this.farAcc > 0.3 && (this.hasDribbled || this.pickedUp || this.dribbling || this.cleanPending)) {
        if (this.cleanPending) this.ev.push({ type: 'clean', how: 'pass' });
        this.endStreak('pass');
        this.hasDribbled = false; this.pickedUp = false; this.dribbling = false; this.cleanPending = false; this.saved = null;
        this.ev.push({ type: 'pass' });
      }
    } else this.farAcc = 0;
  }

  // a dribble seen two ways: the ball bouncing ('ball') or the dribbling hand pumping ('hand', used
  // when the ball is hidden or blurred). One dribble seen both ways within 0.3 s counts once.
  bounce(t, src = 'ball') {
    const L = this.lastDr;
    if (L && t - L.t < 0.3 && L.src !== src && !L.merged) { L.merged = true; return; }
    if (L && t - L.t < 0.18) return;
    if (this.pickedUp) {
      // only a bounce actually seen can call a double dribble (fewer wrong calls)
      // ...and only one seen falling over a few frames
      if (src === 'ball' && this.descN >= 3) { this.bounceSinceRelease = true; this.saved = null; this.call('double', 'Dribbled again after picking it up'); }
      return;
    }
    this.bounceSinceRelease = true; this.saved = null;
    if (this.cleanPending) { this.cleanPending = false; this.ev.push({ type: 'clean', how: 'dribble' }); }
    this.hasDribbled = true; this.dribbling = true; this.lastBounceT = t; this.lastDr = { t, src };
    this.streak++; this.totalDribbles++;
    this.ev.push({ type: 'dribble', streak: this.streak, total: this.totalDribbles, src });
  }

  // the dribbling hand going down and back up, mostly vertically, between the shoulders and the knees
  pumps(body, t, dt, live) {
    const S = this.S;
    this.hp ||= [{}, {}];
    body.hands.forEach((h, i) => {
      const st = this.hp[i];
      if (!h) { st.y = null; return; }
      if (st.y == null) { Object.assign(st, { y: h.Y, x: h.X, v: 0, dir: 1, lowY: h.Y, lowX: h.X, highY: h.Y, highX: h.X }); return; }
      const py = st.y;
      st.y += (h.Y - st.y) * 0.6; st.x += (h.X - st.x) * 0.6;
      st.v = st.v * 0.4 + ((st.y - py) / dt) * 0.6;
      if (st.dir > 0) {
        if (st.y > st.lowY) { st.lowY = st.y; st.lowX = st.x; }
        if (st.lowY - st.y > 0.06 * S && st.v < -0.5 * S) {
          const amp = st.lowY - st.highY, dx = Math.abs(st.lowX - st.highX);
          if (amp > 0.13 * S && amp > dx * 1.1 && st.highY > body.shY - 0.1 * S && st.lowY < body.hipY + 1.2 * S) this.pump(i, t, live);
          st.dir = -1; st.highY = st.y; st.highX = st.x;
        }
      } else {
        if (st.y < st.highY) { st.highY = st.y; st.highX = st.x; }
        if (st.y - st.highY > 0.06 * S && st.v > 0.5 * S) { st.dir = 1; st.lowY = st.y; st.lowX = st.x; }
      }
    });
  }
  pump(hand, t, live) {
    if (!live || this.held || this.shot || hand !== this.dribbleHand) return;
    // only while dribbling, or right after the ball was seen low by that hand
    const ballLow = this.ball && t - this.ball.t < 0.8 && this.body && this.ball.Y > this.body.hipY - 0.2 * this.S;
    if (!this.dribbling && !ballLow) return;
    if (this.dribbling && t - this.lastBounceT > 1.4) return;
    this.bounce(t, 'hand');
  }

  // game mode: someone else has the ball now
  loseBall() {
    if (!(this.held || this.dribbling || this.hasDribbled || this.pickedUp)) return;
    this.endStreak('lost');
    this.clearPossession();
  }

  call(kind, why) {
    if (this.t < this.dead) return;
    if (this.streak) this.endStreak('violation');
    this.ev.push({ type: 'violation', kind, why, ...CALLS[kind] });
    this.clearPossession();
    this.dead = this.t + 2.0; this.deadPending = true;
  }

  endStreak(reason) {
    if (this.streak > 0) this.ev.push({ type: 'streakEnd', streak: this.streak, reason });
    this.streak = 0;
  }

  startShot(B, t) {
    this.shot = { t0: t, y0: B.Y, above: null };
    if (this.cleanPending) this.ev.push({ type: 'clean', how: 'shot' });
    this.endStreak('shot');
    this.hasDribbled = false; this.pickedUp = false; this.dribbling = false; this.cleanPending = false; this.saved = null;
    this.ev.push({ type: 'shot' });
  }

  trackShot(B, hoop, aspect) {
    const s = this.shot; if (!s) return;
    const t = this.t, age = t - s.t0;
    const end = (made) => { this.shot = null; this.ev.push({ type: 'shotResult', made, auto: !!hoop }); };
    if (hoop) {
      const rimY = (hoop.y1 + hoop.y2) / 2;
      const xl = Math.min(hoop.x1, hoop.x2) * aspect, xr = Math.max(hoop.x1, hoop.x2) * aspect, w = Math.max(0.01, xr - xl);
      if (B) {
        const inX = B.X > xl - 0.15 * w && B.X < xr + 0.15 * w;
        if (B.Y < rimY) { if (B.X > xl - w && B.X < xr + w) s.above = { t, X: B.X }; }
        else if (s.above) {
          if (inX && t - s.above.t < 0.6) return end(true);
          if (B.Y > rimY + w) return end(false);
        }
      }
      if (age > 3.5 || (age > 0.8 && this.near)) end(false);
    } else if (age > 3 || (age > 1.2 && B && B.Y > s.y0) || (age > 0.8 && this.near)) end(null);
  }
}

function newFoot() { return { p: null, hist: [], moving: false, calm: 0, liftPos: null }; }
