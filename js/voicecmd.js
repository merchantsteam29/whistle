// Voice commands: "start", "pause", "resume", "no call", "replay", "next", "made it", "missed",
// "end". Uses the browser's speech recognition (Chrome / Edge; it needs the internet there).
// It ignores what it hears while the ref itself is talking, so it doesn't obey its own voice.
const CMDS = [
  ['start', ['tip off', 'tipoff', 'start', "let's go", 'go']],
  ['pause', ['pause', 'stop', 'time out', 'timeout', 'hold on']],
  ['resume', ['resume', 'continue', 'play on']],
  ['nocall', ['no call', 'wave it off', 'bad call', 'no foul']],
  ['replay', ['replay', 'show me', 'instant replay']],
  ['next', ['next', 'next drill', 'skip']],
  ['made', ['made it', 'it went in', 'bucket', 'good']],
  ['missed', ['missed', 'miss', 'no good']],
  ['end', ['end session', 'end game', "that's it", 'finish']],
];
export const voiceSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export function matchCommand(text) {
  const t = ' ' + String(text).toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (t.split(' ').filter(Boolean).length > 5) return null; // a sentence, not a command
  for (const [cmd, words] of CMDS) if (words.some((w) => t.includes(' ' + w + ' '))) return cmd;
  return null;
}
export class VoiceCommands {
  constructor(onCmd, onState) { this.onCmd = onCmd; this.onState = onState || (() => {}); this.on = false; this.rec = null; this.quietUntil = 0; }
  // call when the app speaks, so it doesn't hear itself
  mute(ms = 1800) { this.quietUntil = performance.now() + ms; }
  start() {
    if (this.on || !voiceSupported()) return false;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R(); rec.continuous = true; rec.interimResults = false; rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      if (performance.now() < this.quietUntil) return;
      for (let i = e.resultIndex; i < e.results.length; i++) { const c = matchCommand(e.results[i][0].transcript); if (c) { this.onState('heard', c); this.onCmd(c); } }
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.stop(); this.onState('denied'); } };
    rec.onend = () => { if (this.on) setTimeout(() => { try { rec.start(); } catch {} }, 250); };
    this.rec = rec; this.on = true;
    try { rec.start(); this.onState('listening'); } catch { this.on = false; return false; }
    return true;
  }
  stop() { this.on = false; try { this.rec?.stop(); } catch {} this.rec = null; this.onState('off'); }
}
