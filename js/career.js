// Career / story mode: a rookie season of challenges with a coach, ending in a championship game.
// Each chapter is a drill with a target, or a shooting game against a rival WHISTLE shoots for.
export const COACH = 'Coach Reyes';
export const CHAPTERS = [
  { title: 'Tryouts', mode: 'dribble30', target: 30, intro: 'Welcome to tryouts, rookie. First let\'s see your handle: 30 dribbles in 30 seconds. Keep it low.', win: 'Nice handle. You\'re through to the next round.' },
  { title: 'Shooting test', mode: 'shoot10', target: 4, intro: 'Now shooting. Hit 4 out of 10. Elbow in, follow through.', win: 'Good stroke. I liked that.' },
  { title: 'Both hands', mode: 'weak30', target: 18, intro: 'Every great guard uses both hands. 18 dribbles with your weak hand.', win: 'That weak hand is getting stronger.' },
  { title: 'Defense first', mode: 'slides30', target: 10, intro: 'Defense wins games. Slide side to side, low and fast. 10 slides.', win: 'You made the team! Practice starts tomorrow.' },
  { title: 'First scrimmage', mode: 't21', rival: { name: 'Riley', pct: 0.3 }, intro: 'Riley thinks you got lucky at tryouts. Beat Riley in a game of 21. Exactly 21 to win, over and you drop to 13.', win: 'Riley is going to want a rematch.' },
  { title: 'Handles II', mode: 'cross30', target: 18, intro: 'Our guards need to change direction. 18 crossovers in 30 seconds.', win: 'Crossover is looking smooth.' },
  { title: 'Finishing', mode: 'layup60', target: 7, intro: 'You have to finish at the rim. 7 layups in 60 seconds.', win: 'Strong finishes!' },
  { title: 'Practice game', mode: 'horse', rival: { name: COACH, pct: 0.45 }, intro: 'Let\'s have some fun. You and me, HORSE. I don\'t go easy.', win: 'Okay, okay. You got me. Nice shooting.' },
  { title: 'Semifinal', mode: 'shoot10', target: 6, intro: 'Semifinal tomorrow. Shooters shoot: 6 out of 10.', win: 'We\'re going to the championship!' },
  { title: 'Championship', mode: 't21', rival: { name: 'Riley', pct: 0.45 }, intro: 'This is it. Championship game against Riley, and Riley has been practising. Play your game.', win: 'CHAMPIONS! What a season, rookie. I\'m proud of you.' },
];
export const careerOf = (p) => (p.career ||= { ch: 0, done: false });
// did this chapter's attempt pass? (score for drills, won for rival games)
export function passed(ch, { score = null, won = false } = {}) { return ch.rival ? !!won : score != null && score >= ch.target; }
export function advance(p) {
  const c = careerOf(p); if (c.done) return { done: true };
  c.ch++; if (c.ch >= CHAPTERS.length) { c.done = true; c.ch = CHAPTERS.length - 1; return { done: true, champion: true }; }
  return { ch: c.ch };
}
