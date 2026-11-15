// Second phone as a scoreboard: this device (the ref) hosts a tiny PeerJS room; another phone or
// tablet opens the link (?board=CODE) and shows the big scoreboard and the calls. Peer to peer, no server.
const LIB = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'whistle-board-v1-';
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let libP = null;
const lib = () => libP || (libP = new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement('script'); s.src = LIB; s.onload = res; s.onerror = () => { libP = null; rej(new Error('Could not load PeerJS')); }; document.head.appendChild(s); }));

export class BoardHost {
  // onData(msg, conn): messages from remotes ({t:'cmd', c}) and side cameras ({t:'cam', d})
  constructor() { this.peer = null; this.conns = new Set(); this.code = null; this.last = null; this.onData = () => {}; }
  get on() { return !!this.peer; }
  get viewers() { return [...this.conns].filter((c) => c.open).length; }
  async start() {
    if (this.peer) return this.code;
    await lib();
    for (let tries = 0; tries < 3; tries++) {
      const code = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
      try {
        await new Promise((res, rej) => {
          const p = new Peer(PREFIX + code);
          p.on('open', () => { this.peer = p; this.code = code; res(); });
          p.on('error', (e) => { if (!this.peer) { p.destroy(); rej(e); } });
          p.on('connection', (c) => { this.conns.add(c); c.on('open', () => { if (this.last) c.send(this.last); }); c.on('data', (m) => this.onData(m, c)); c.on('close', () => this.conns.delete(c)); });
          p.on('disconnected', () => { try { p.reconnect(); } catch {} });
        });
        return this.code;
      } catch (e) { if (e.type !== 'unavailable-id') throw e; }
    }
    throw new Error('Could not open a scoreboard room');
  }
  // state: the whole scoreboard; sent when it changes (and to anyone who joins)
  state(st) { const msg = { t: 'state', st }; const j = JSON.stringify(st); if (j === this.lastJ) return; this.lastJ = j; this.last = msg; this.send(msg); }
  call(c) { this.send({ t: 'call', c }); }
  send(m) { for (const c of this.conns) if (c.open) try { c.send(m); } catch {} }
  stop() { if (this.peer) { this.peer.destroy(); this.peer = null; this.conns.clear(); this.code = null; } }
}

// the scoreboard / remote / side-camera side: connect and call onMsg for every update. Returns send(msg).
export async function joinBoard(code, onMsg, onStatus) {
  await lib();
  const p = new Peer();
  let conn = null;
  const connect = () => {
    onStatus('Connecting…');
    const c = p.connect(PREFIX + code.toUpperCase(), { reliable: true }); conn = c;
    c.on('open', () => onStatus(''));
    c.on('data', onMsg);
    c.on('close', () => { onStatus('Lost the ref. Reconnecting…'); setTimeout(connect, 2000); });
    c.on('error', () => {});
  };
  p.on('open', connect);
  p.on('error', (e) => { onStatus(e.type === 'peer-unavailable' ? 'Waiting for the ref device… (is the scoreboard turned on there?)' : 'Connection problem: ' + (e.type || e.message)); if (e.type === 'peer-unavailable') setTimeout(connect, 3000); });
  return (m) => { if (conn && conn.open) try { conn.send(m); } catch {} };
}
