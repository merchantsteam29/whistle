// WHISTLE game mode: 1v1 / 2v2 on one camera. Pure logic (no DOM), tested in tools/test-game.mjs.
//
// Court: keeps each player's identity from frame to frame (closest match to where they were,
//        heading, plus shirt colour), so "Home" stays Home when players cross.
// Game:  one Ref per player (travels, double dribbles, shots), who has the ball (possession),
//        contact fouls between players, 2s / 3s / free throws, team fouls + bonus, foul-outs.
//
// Fouls are only judged between players at the same distance from the camera (feet at the same
// height in the picture, bodies the same size), so someone standing behind someone else is not "contact".
//   REACH-IN: a defender's hand swipes fast into the ball handler's arm or body (not the ball).
//   HOLDING:  a hand stays on an opponent's arm or body for most of a second.
//   PUSHING:  a hand on the body, then the opponent is shoved away (sudden speed away).
//   OFFENSIVE FOUL: the player with the ball holds or pushes off a defender.
import { Ref } from './ref.js';

const I = { NOSE: 0, LSH: 11, RSH: 12, LEL: 13, REL: 14, LWR: 15, RWR: 16, LIDX: 19, RIDX: 20, LHIP: 23, RHIP: 24, LANK: 27, RANK: 28 };

// a simple body read for fouls / identity (X scaled by aspect)
export function bodyOf(lm, aspect) {
  if (!lm) return null;
  const P = (i) => (lm[i] && (lm[i].visibility ?? 1) > 0.3 ? { X: lm[i].x * aspect, Y: lm[i].y } : null);
  const ls = P(I.LSH), rs = P(I.RSH), lh = P(I.LHIP), rh = P(I.RHIP);
  if (!ls || !rs || !lh || !rh) return null;
  const hip = { X: (lh.X + rh.X) / 2, Y: (lh.Y + rh.Y) / 2 }, sh = { X: (ls.X + rs.X) / 2, Y: (ls.Y + rs.Y) / 2 };
  const S = Math.hypot(sh.X - hip.X, sh.Y - hip.Y);
  if (S < 0.02) return null;
  const hand = (w, ix) => { const W = P(w), X = P(ix); return W ? (X ? { X: W.X + (X.X - W.X) * 0.6, Y: W.Y + (X.Y - W.Y) * 0.6 } : W) : null; };
  const le = P(I.LEL), re = P(I.REL), lw = P(I.LWR), rw = P(I.RWR);
  const arms = [];
  if (le) { arms.push([ls, le]); if (lw) arms.push([le, lw]); }
  if (re) { arms.push([rs, re]); if (rw) arms.push([re, rw]); }
  const la = P(I.LANK), ra = P(I.RANK);
  const footY = la && ra ? Math.max(la.Y, ra.Y) : la ? la.Y : ra ? ra.Y : hip.Y + 2 * S;
  const footX = la && ra ? (la.X + ra.X) / 2 : la ? la.X : ra ? ra.X : hip.X;
  return { hip, sh, S, torso: [ls, rs, rh, lh], arms, hands: [hand(I.LWR, I.LIDX), hand(I.RWR, I.RIDX)], footY, footX, shY: sh.Y, nose: P(I.NOSE) };
}

const segDist = (p, a, b) => {
  const dx = b.X - a.X, dy = b.Y - a.Y, L = dx * dx + dy * dy;
  const u = L ? Math.max(0, Math.min(1, ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / L)) : 0;
  return Math.hypot(p.X - (a.X + u * dx), p.Y - (a.Y + u * dy));
};
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.Y > p.Y) !== (b.Y > p.Y) && p.X < ((b.X - a.X) * (p.Y - a.Y)) / (b.Y - a.Y) + a.X) c = !c;
  }
  return c;
};
const polyDist = (p, poly) => (inPoly(p, poly) ? 0 : Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length]))));

// ------------------------------------------------------------------------------------------
// Court: who is who
export class Court {
  constructor(n) { this.n = n; this.reset(); }
  reset() { this.slots = Array.from({ length: this.n }, () => ({ c: null, v: { X: 0, Y: 0 }, S: 0.2, t: -9, shirt: null, lm: null })); this.locked = false; }

  // poses: [{lm, shirt}]; display order left->right decides slots until lock-in (Home = left side)
  assign(poses, t, aspect, mirror = false) {
    const items = poses.map((p) => ({ ...p, b: bodyOf(p.lm, aspect) })).filter((p) => p.b);
    for (const s of this.slots) s.lm = null;
    if (!this.locked) {
      const order = items.slice().sort((a, b) => (mirror ? b.b.hip.X - a.b.hip.X : a.b.hip.X - b.b.hip.X));
      if (this.n === 1) order.sort((a, b) => b.b.S - a.b.S); // single player: the biggest (closest) person
      order.slice(0, this.n).forEach((p, i) => this.put(this.slots[i], p, t));
      return this.slots.map((s) => s.lm);
    }
    const pairs = [];
    this.slots.forEach((s, si) => items.forEach((p, pi) => pairs.push({ si, pi, c: this.cost(s, p, t) })));
    pairs.sort((a, b) => a.c - b.c);
    const usedS = new Set(), usedP = new Set();
    for (const q of pairs) {
      if (usedS.has(q.si) || usedP.has(q.pi) || q.c > 6) continue;
      usedS.add(q.si); usedP.add(q.pi); this.put(this.slots[q.si], items[q.pi], t);
    }
    return this.slots.map((s) => s.lm);
  }
  lock() { this.locked = true; }

  cost(s, p, t) {
    if (!s.c) return 5;
    const dt = Math.min(0.5, t - s.t), lost = t - s.t > 1.5;
    const px = s.c.X + s.v.X * dt, py = s.c.Y + s.v.Y * dt;
    let c = Math.hypot(p.b.hip.X - px, p.b.hip.Y - py) / Math.max(0.05, s.S);
    if (lost) c = 2 + c * 0.2; // gone a while: anyone free will do, colour decides
    if (s.shirt && p.shirt && s.shirt.s > 0.18 && p.shirt.s > 0.18) {
      let dh = Math.abs(s.shirt.h - p.shirt.h); if (dh > 180) dh = 360 - dh;
      c += Math.min(2.5, dh / 40 + Math.abs(s.shirt.v - p.shirt.v) * 2);
    } else if (s.shirt && p.shirt) c += Math.min(1.5, Math.abs(s.shirt.v - p.shirt.v) * 3);
    c += Math.abs(Math.log(p.b.S / s.S)) * 2;
    return c;
  }
  put(s, p, t) {
    const b = p.b;
    if (s.c && t - s.t < 0.5) { const dt = Math.max(0.001, t - s.t); s.v = { X: s.v.X * 0.5 + ((b.hip.X - s.c.X) / dt) * 0.5, Y: s.v.Y * 0.5 + ((b.hip.Y - s.c.Y) / dt) * 0.5 }; } else s.v = { X: 0, Y: 0 };
    s.c = { ...b.hip }; s.S = b.S; s.t = t; s.lm = p.lm;
    if (p.shirt) s.shirt = s.shirt ? { h: s.shirt.h + angDiff(p.shirt.h, s.shirt.h) * 0.1, s: s.shirt.s * 0.9 + p.shirt.s * 0.1, v: s.shirt.v * 0.9 + p.shirt.v * 0.1 } : { ...p.shirt };
  }
}
const angDiff = (a, b) => { let d = a - b; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

// ------------------------------------------------------------------------------------------
export const FOULS = {
  reach: { title: 'REACH-IN FOUL', signal: 'Chop the wrist', tip: 'Go for the ball, not the arm. Move your feet to stay in front.' },
  hold: { title: 'HOLDING', signal: 'Grab your wrist', tip: 'Hands off. Defend with your feet and your body square.' },
  push: { title: 'PUSHING', signal: 'Push both hands forward', tip: 'Stay in your space. Slide your feet instead of using your hands.' },
  offensive: { title: 'OFFENSIVE FOUL', signal: 'Fist behind the head', tip: 'With the ball, no pushing off. Use a move or a pivot to make space.' },
};

export const DEFAULT_RULES = { toPoints: 11, foulOut: 5, bonusAt: 5, stepsAllowed: 2 };

export class Game {
  constructor({ format = '1v1', rules = {} } = {}) {
    this.format = format; this.n = format === '2v2' ? 4 : 2;
    this.teamOf = this.n === 2 ? [0, 1] : [0, 0, 1, 1];
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.refs = Array.from({ length: this.n }, () => new Ref({ stepsAllowed: this.rules.stepsAllowed }));
    this.stats = Array.from({ length: this.n }, () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, trv: 0, dd: 0, dr: 0, bestStreak: 0, clean: 0, fouledOut: false }));
    this.score = [0, 0]; this.teamFouls = [0, 0];
    this.poss = null; this.possCand = null; this.possCandT = 0;
    this.ft = null; this.andOne = null; this.dead = -1; this.over = false; this.winner = null;
    this.contact = {}; this.touchedT = []; this.prevHands = []; this.prevHip = []; this.shots = {}; this.last = null;
    this.t = 0;
  }

  // poses: per player slot (landmarks or null); ball {x,y,r} or null
  update({ t, aspect = 16 / 9, poses, ball = null, hoop = null, threeLine = null }) {
    const ev = (this.ev = []); this.t = t;
    const dt = this.lastT == null ? 1 / 30 : Math.min(0.25, Math.max(0.001, t - this.lastT)); this.lastT = t;
    if (this.over) return ev;
    const bodies = poses.map((lm) => bodyOf(lm, aspect));
    this.bodies = bodies;
    const B = ball ? { X: ball.x * aspect, Y: ball.y, R: ball.r } : null;

    // ---- possession: whose hands are on the ball
    if (B && !this.ft) {
      let best = null, bd = 1e9;
      bodies.forEach((b, i) => {
        if (!b) return;
        for (const h of b.hands) if (h) { const d = Math.hypot(h.X - B.X, h.Y - B.Y) - B.R; if (d < 0.5 * b.S && d < bd) { bd = d; best = i; } }
      });
      const shooting = this.poss != null && this.refs[this.poss].shot;
      if (best != null && best !== this.poss && !shooting) {
        if (this.possCand !== best) { this.possCand = best; this.possCandT = t; }
        else if (t - this.possCandT > 0.15) this.setPoss(best, t);
      } else if (best != null && best === this.poss) this.possCand = null;
    }
    if (this.ft) this.poss = this.ft.who;

    // ---- refs (only the player with the ball "has" it)
    this.refs.forEach((r, i) => {
      for (const e of r.update({ t, aspect, pose: poses[i], ball: i === this.poss ? ball : null, hoop })) this.onRef(i, e, bodies, threeLine, hoop, aspect);
    });

    // ---- shooting foul waiting for the shot to finish
    if (this.andOne && t - this.andOne.t > 1.3 && !this.refs[this.andOne.who].shot) { const a = this.andOne; this.andOne = null; this.startFT(a.who, a.value, t); }

    // ---- fouls
    if (!this.ft && t >= this.dead) this.checkFouls(bodies, B, dt, t);
    this.prevHands = bodies.map((b) => b ? b.hands.map((h) => h && { ...h }) : null);
    this.prevHip = bodies.map((b) => b && { ...b.hip });
    return ev;
  }

  setPoss(i, t) {
    if (this.poss != null && this.poss !== i) this.refs[this.poss].loseBall();
    const changed = this.poss == null || this.teamOf[this.poss] !== this.teamOf[i];
    this.poss = i; this.possCand = null;
    this.ev.push({ type: 'possession', who: i, team: this.teamOf[i], changed });
  }

  onRef(i, e, bodies, threeLine, hoop, aspect) {
    const s = this.stats[i], team = this.teamOf[i];
    const out = { ...e, who: i, team };
    if (this.ft && i === this.ft.who) {
      if (e.type === 'violation' || e.type === 'dribble' || e.type === 'clean') return; // free throws: only the shot matters
      if (e.type === 'shotResult') { if (e.made == null) this.ev.push({ type: 'needResult', who: i, team, ft: true }); else this.ftResult(e.made, e.auto); return; }
      if (e.type === 'shot') { this.ev.push({ type: 'ftShot', who: i, n: this.ft.total - this.ft.left + 1, of: this.ft.total }); return; }
    }
    switch (e.type) {
      case 'dribble': s.dr++; s.bestStreak = Math.max(s.bestStreak, e.streak); break;
      case 'clean': s.clean++; break;
      case 'violation':
        // pushed or held players stumble: no travel on someone an opponent just touched
        if (e.kind === 'travel' && this.t - (this.touchedT[i] ?? -9) < 0.7) return;
        if (e.kind === 'travel') s.trv++; else s.dd++;
        out.type = 'violation'; this.ev.push(out); this.turnover(i); this.last = { kind: 'violation', who: i, e };
        return;
      case 'shot': {
        const b = bodies[i];
        let three = false;
        if (threeLine && hoop && b) {
          const lx = threeLine.x * aspect, hx = ((hoop.x1 + hoop.x2) / 2) * aspect, side = Math.sign(lx - hx);
          three = (b.footX - lx) * side > 0;
        }
        this.shots[i] = { three, t: this.t };
        s.fga++; if (three) s.tpa++;
        out.three = three;
        break;
      }
      case 'shotResult':
        if (e.made == null) { this.ev.push({ type: 'needResult', who: i, team }); return; }
        this.shotDone(i, e.made, e.auto); return;
    }
    this.ev.push(out);
  }

  // made: true/false (from auto scoring or the "did it go in?" buttons)
  shotDone(i, made, auto = false) {
    const s = this.stats[i], sh = this.shots[i] || { three: false };
    const value = sh.three ? 3 : 2;
    if (made) { s.fgm++; if (sh.three) s.tpm++; this.addPoints(i, value, sh.three ? 'three' : 'fg'); }
    this.ev.push({ type: 'shotResult', who: i, team: this.teamOf[i], made, auto, three: sh.three, value });
    if (this.andOne && this.andOne.who === i) {
      const a = this.andOne; this.andOne = null;
      this.startFT(i, made ? 1 : a.value, this.t, made);
    }
  }
  // the UI's answer to needResult
  resolve(made) {
    if (this.ft) return this.ftResult(made, false);
    const i = this.poss ?? 0; this.ev = []; this.shotDone(i, made); return this.ev;
  }

  addPoints(i, pts, kind) {
    const team = this.teamOf[i];
    this.stats[i].pts += pts; this.score[team] += pts;
    this.ev.push({ type: 'points', who: i, team, pts, kind, score: [...this.score] });
    if (this.rules.toPoints && this.score[team] >= this.rules.toPoints && !this.over) { this.over = true; this.winner = team; this.ev.push({ type: 'gameOver', winner: team, score: [...this.score] }); }
  }
  // coach buttons: manual points / fouls
  manualPoints(team, pts) {
    this.ev = [];
    const who = this.poss != null && this.teamOf[this.poss] === team ? this.poss : this.teamOf.indexOf(team);
    if (pts === 3) { this.stats[who].fga++; this.stats[who].fgm++; this.stats[who].tpa++; this.stats[who].tpm++; }
    else if (pts === 2) { this.stats[who].fga++; this.stats[who].fgm++; }
    else { this.stats[who].fta++; this.stats[who].ftm++; }
    this.addPoints(who, pts, pts === 3 ? 'three' : pts === 2 ? 'fg' : 'ft');
    return this.ev;
  }
  manualFoul(team) {
    this.ev = [];
    // the foul is on the first player of that team; it is against whoever has the ball (or the other team's first player)
    const who = this.teamOf.indexOf(team);
    const on = this.poss != null && this.teamOf[this.poss] !== team ? this.poss : this.teamOf.indexOf(1 - team);
    this.foul(who, on, 'reach', false, this.t, true);
    return this.ev;
  }

  turnover(i) {
    for (const r of this.refs) r.loseBall();
    this.poss = null; this.dead = this.t + 2;
    this.ev.push({ type: 'turnover', who: i, team: this.teamOf[i], ballTo: 1 - this.teamOf[i] });
  }

  // ---------------- fouls ----------------
  checkFouls(bodies, B, dt, t) {
    for (let o = 0; o < this.n; o++) for (let v = 0; v < this.n; v++) {
      if (o === v || this.teamOf[o] === this.teamOf[v]) continue;
      const bo = bodies[o], bv = bodies[v];
      const key = o + '>' + v, c = (this.contact[key] ||= { hold: 0, pushT: -9, awayV0: 0 });
      if (!bo || !bv) { c.hold = Math.max(0, c.hold - dt * 2); continue; }
      const S = (bo.S + bv.S) / 2;
      // same depth: feet level within 0.35 torso, similar size
      if (Math.abs(bo.footY - bv.footY) > 0.35 * S || Math.abs(Math.log(bo.S / bv.S)) > 0.3) { c.hold = Math.max(0, c.hold - dt * 2); continue; }
      let touch = false, torsoTouch = false, swipe = false;
      bo.hands.forEach((h, k) => {
        if (!h) return;
        const dA = bv.arms.length ? Math.min(...bv.arms.map(([a, b]) => segDist(h, a, b))) : 9;
        const dT = polyDist(h, bv.torso);
        const onBall = B && Math.hypot(h.X - B.X, h.Y - B.Y) - B.R < 0.18 * S;
        if (Math.min(dA, dT) < 0.12 * S && !onBall) {
          touch = true; if (dT < 0.12 * S) torsoTouch = true;
          const p = this.prevHands[o]?.[k];
          if (p && Math.hypot(h.X - p.X, h.Y - p.Y) / dt > 3.0 * S) swipe = true;
        }
      });
      if (touch) this.touchedT[v] = t;
      const hasBall = this.poss === v, offBall = this.poss === o;
      // reach-in: a fast hand into the ball handler's arm / body
      if (swipe && hasBall) { this.foul(o, v, 'reach', this.isShooting(v), t); return; }
      // holding: a hand that stays on
      c.hold = touch ? c.hold + dt : Math.max(0, c.hold - dt * 1.5);
      if (c.hold > 0.8) { c.hold = 0; this.foul(o, v, offBall ? 'offensive' : 'hold', !offBall && this.isShooting(v), t); return; }
      // pushing: touch the body, then the other player suddenly speeds away
      const away = this.awaySpeed(o, v, bodies, dt);
      if (torsoTouch) { if (t - c.pushT > 0.4) c.awayV0 = away; c.pushT = t; }
      if (t - c.pushT < 0.35 && away - c.awayV0 > 2.0 * S && away > 1.8 * S) { c.pushT = -9; this.foul(o, v, offBall ? 'offensive' : 'push', !offBall && this.isShooting(v), t); return; }
    }
  }
  awaySpeed(o, v, bodies, dt) {
    const p = this.prevHip[v]; if (!p) return 0;
    const bo = bodies[o], bv = bodies[v];
    const ux = bv.hip.X - bo.hip.X, uy = bv.hip.Y - bo.hip.Y, L = Math.hypot(ux, uy) || 1;
    return (((bv.hip.X - p.X) * ux + (bv.hip.Y - p.Y) * uy) / L) / dt;
  }
  isShooting(v) {
    const r = this.refs[v];
    if (r.shot && this.t - r.shot.t0 < 0.6) return true;
    return r.held && r.B && r.body && r.B.Y < r.body.shY;
  }

  foul(o, v, kind, shooting, t, manual = false) {
    if (t < this.dead && !manual) return;
    const so = this.stats[o], team = this.teamOf[o];
    so.pf++; this.teamFouls[team]++;
    const info = FOULS[kind];
    const e = { type: 'foul', who: o, on: v, team, kind, shooting, manual, ...info, pf: so.pf, teamFouls: this.teamFouls[team] };
    let fts = 0;
    if (kind === 'offensive') { e.result = 'turnover'; }
    else if (shooting) { const three = this.refs[v].shot ? this.shots[v]?.three : false; fts = three ? 3 : 2; e.result = 'shooting'; }
    else if (so.fouledOut || (this.rules.bonusAt && this.teamFouls[team] >= this.rules.bonusAt)) { fts = 2; e.result = 'bonus'; e.bonus = true; }
    else e.result = 'sideOut';
    e.fts = fts;
    this.ev.push(e);
    this.last = { kind: 'foul', who: o, team, e, prevFT: this.ft };
    if (this.rules.foulOut && so.pf >= this.rules.foulOut && !so.fouledOut) { so.fouledOut = true; this.ev.push({ type: 'fouledOut', who: o, team }); }
    this.dead = t + 2;
    for (let i = 0; i < this.n; i++) if (!(shooting && i === v && this.refs[v].shot)) { this.refs[i].clearPossession(); this.refs[i].dead = t + 1.5; }
    if (kind === 'offensive') { this.poss = null; return; }
    if (shooting && this.refs[v].shot) { this.andOne = { who: v, value: fts, t }; return; } // wait: made = and-one
    if (fts) this.startFT(v, fts, t);
    else this.poss = v;
  }

  // "No call": undo the last foul or violation
  waveOff() {
    const L = this.last; if (!L) return false;
    if (L.kind === 'foul') {
      const s = this.stats[L.who]; s.pf = Math.max(0, s.pf - 1); this.teamFouls[L.team] = Math.max(0, this.teamFouls[L.team] - 1);
      if (s.fouledOut && s.pf < this.rules.foulOut) s.fouledOut = false;
      this.ft = L.prevFT || null; this.andOne = null;
    } else {
      const s = this.stats[L.who]; if (L.e.kind === 'travel') s.trv = Math.max(0, s.trv - 1); else s.dd = Math.max(0, s.dd - 1);
    }
    this.dead = 0; for (const r of this.refs) { r.dead = 0; r.deadPending = false; }
    this.last = null; return true;
  }

  startFT(who, n, t, andOne = false) {
    for (const r of this.refs) r.loseBall();
    this.ft = { who, left: n, total: n, andOne };
    this.poss = who; this.dead = t + 1;
    this.ev.push({ type: 'ftStart', who, team: this.teamOf[who], n, andOne });
  }
  ftResult(made, auto) {
    const ft = this.ft; if (!ft) return this.ev;
    const s = this.stats[ft.who];
    s.fta++;
    const n = ft.total - ft.left + 1;
    if (made) { s.ftm++; this.addPoints(ft.who, 1, 'ft'); }
    ft.left--;
    this.ev.push({ type: 'ftResult', who: ft.who, team: this.teamOf[ft.who], made, auto, n, of: ft.total });
    if (ft.left <= 0) { this.ft = null; this.poss = null; this.ev.push({ type: 'ftDone', who: ft.who }); }
    return this.ev;
  }
}
