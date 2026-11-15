// Shooting games for 2-4 kids, one shooter in front of the camera at a time. Pure logic.
//
// HORSE: the setter shoots from anywhere (and keeps setting until they miss). Make it and everyone else must make the same shot
//        (WHISTLE marks the spot on the floor); miss the match and you get a letter. Miss the set
//        and the next player sets. Spell the word and you're out. Last one left wins.
// KNOCKOUT (turn-by-turn version): every round, everyone still in shoots once from the same spot.
//        Anyone who misses is knocked out, unless nobody made it (then everyone stays).
//        Last one standing wins.
export class Turns {
  // kind: horse | knockout | t21 | world. ghosts: players WHISTLE shoots for (career rivals): {index: makeChance}
  constructor({ kind = 'horse', players = 2, word = 'HORSE', spots = 5, ghosts = {} } = {}) {
    this.score = Array(players).fill(0); this.phase = 'long'; this.pos = Array(players).fill(0); this.spots = spots; this.ghosts = ghosts;
    this.kind = kind; this.word = word.toUpperCase(); this.n = players;
    this.letters = Array(players).fill(0); this.out = Array(players).fill(false);
    this.makes = Array(players).fill(0); this.shots = Array(players).fill(0);
    this.cur = 0; this.setter = 0; this.spot = null; this.toMatch = []; this.round = []; this.winner = null; this.roundNo = 1;
  }
  alive() { return this.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0); }
  next(from) { for (let k = 1; k <= this.n; k++) { const i = (from + k) % this.n; if (!this.out[i]) return i; } return from; }
  // what the current shooter has to do
  state() {
    if (this.winner != null) return { done: true, winner: this.winner };
    const ghost = this.ghosts[this.cur] != null;
    if (this.kind === 't21') return { who: this.cur, role: this.phase, score: this.score[this.cur], ghost };
    if (this.kind === 'world') return { who: this.cur, role: 'spot', spot: this.pos[this.cur], ghost };
    if (this.kind === 'horse') return { who: this.cur, role: this.spot ? 'match' : 'set', spot: this.spot, setter: this.setter, ghost };
    return { who: this.cur, role: 'shoot', round: this.roundNo, left: this.alive().length };
  }

  // a shot finished: made true/false, spot = where the shooter stood ({x, y} normalised), for HORSE
  shot(made, spot = null, extra = {}) {
    const ev = [], who = this.cur;
    if (this.winner != null) return ev;
    this.shots[who]++; if (made) this.makes[who]++;
    ev.push({ type: 'shotDone', who, made });
    if (this.kind === 'horse') this.horse(made, spot, ev);
    else if (this.kind === 't21') this.t21(made, ev, extra);
    else if (this.kind === 'world') this.world(made, ev);
    else this.knockout(made, ev);
    if (this.winner == null) { const st = this.state(); ev.push({ type: 'turn', ...st }); }
    return ev;
  }

  horse(made, spot, ev) {
    const who = this.cur;
    if (!this.spot) {
      // setting
      if (made) {
        this.spot = spot || { x: 0.5, y: 0.9 };
        this.toMatch = []; for (let i = this.next(who); i !== who; i = this.next(i)) this.toMatch.push(i);
        ev.push({ type: 'set', who, spot: this.spot });
        this.cur = this.toMatch[0];
      } else { this.setter = this.next(who); this.cur = this.setter; }
      return;
    }
    // matching
    if (!made) {
      this.letters[who]++;
      ev.push({ type: 'letter', who, letters: this.word.slice(0, this.letters[who]) });
      if (this.letters[who] >= this.word.length) { this.out[who] = true; ev.push({ type: 'out', who }); }
    }
    this.toMatch.shift();
    while (this.toMatch.length && this.out[this.toMatch[0]]) this.toMatch.shift();
    if (this.alive().length === 1) { this.winner = this.alive()[0]; ev.push({ type: 'win', who: this.winner }); return; }
    if (this.toMatch.length) { this.cur = this.toMatch[0]; return; }
    // everyone tried: the setter keeps setting (until they miss one)
    this.spot = null; if (this.out[this.setter]) this.setter = this.next(this.setter); this.cur = this.setter;
  }

  // 21: a shot from out (2, or 3 behind the line). Make it = a tip-in worth 1; make that and shoot again.
  // Any miss ends the turn. Exactly 21 wins; going over drops you back to 13.
  t21(made, ev, extra) {
    const who = this.cur;
    if (made) {
      const pts = this.phase === 'tip' ? 1 : extra.three ? 3 : 2;
      this.score[who] += pts;
      if (this.score[who] === 21) { ev.push({ type: 'points', who, pts, total: 21 }); this.winner = who; ev.push({ type: 'win', who }); return; }
      if (this.score[who] > 21) { this.score[who] = 13; ev.push({ type: 'bust', who }); this.phase = 'long'; this.cur = this.next(who); return; }
      ev.push({ type: 'points', who, pts, total: this.score[who] });
      this.phase = this.phase === 'tip' ? 'long' : 'tip';
    } else { this.phase = 'long'; this.cur = this.next(who); }
  }
  // Around the World: make a shot from each spot in order; a miss passes the ball. First all the way round wins.
  world(made, ev) {
    const who = this.cur;
    if (made) {
      this.pos[who]++;
      ev.push({ type: 'advance', who, pos: this.pos[who] });
      if (this.pos[who] >= this.spots) { this.winner = who; ev.push({ type: 'win', who }); }
    } else this.cur = this.next(who);
  }

  knockout(made, ev) {
    const who = this.cur;
    this.round.push({ who, made });
    const alive = this.alive();
    const done = alive.every((i) => this.round.some((r) => r.who === i));
    if (!done) { this.cur = this.next(who); return; }
    const anyMade = this.round.some((r) => r.made);
    if (anyMade) for (const r of this.round) if (!r.made) { this.out[r.who] = true; ev.push({ type: 'out', who: r.who }); }
    else ev.push({ type: 'replay', round: this.roundNo });
    this.round = []; this.roundNo++;
    if (this.alive().length === 1) { this.winner = this.alive()[0]; ev.push({ type: 'win', who: this.winner }); return; }
    this.cur = this.alive()[0];
  }
}
