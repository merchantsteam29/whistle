// Highlight clips: records the camera picture (with the skeleton/ball overlay and a caption) while
// something might turn into a highlight, and keeps it only if it does:
//   a shot goes up -> recording starts -> it goes in -> keep (stop ~1.5 s later); a miss -> thrown away
//   a dribble streak reaches 10 -> recording starts -> reaches 25 -> keep
// Clips stay in memory for this session; the summary shows them with Download buttons.
export class Highlights {
  constructor(video, overlay, stage) {
    this.video = video; this.overlay = overlay; this.stage = stage;
    this.cv = document.createElement('canvas'); this.g = this.cv.getContext('2d');
    this.rec = null; this.chunks = []; this.clips = []; this.caption = ''; this.sub = ''; this.capT = 0;
    this.enabled = typeof MediaRecorder !== 'undefined' && !!this.cv.captureStream;
    this.max = 12;
  }
  get recording() { return !!this.rec; }

  // start recording (if not already). why: a label for what we are waiting for
  begin(why, sub = '') {
    if (!this.enabled || this.rec || this.clips.length >= this.max) return;
    const vw = this.video.videoWidth, vh = this.video.videoHeight; if (!vw) return;
    const sc = Math.min(1, 960 / vw); this.cv.width = Math.round(vw * sc); this.cv.height = Math.round(vh * sc);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    try {
      this.rec = new MediaRecorder(this.cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    } catch { this.enabled = false; return; }
    this.chunks = []; this.why = why; this.sub = sub; this.caption = ''; this.keepIt = null; this.t0 = performance.now();
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => this.finish();
    this.rec.start(250);
    const draw = () => { if (!this.rec) return; this.frame(); requestAnimationFrame(draw); };
    requestAnimationFrame(draw);
    clearTimeout(this.limit); this.limit = setTimeout(() => this.drop(), 12000); // never longer than 12 s
  }
  // it happened: caption it and stop a moment later
  keep(caption, sub = '', tail = 1500) {
    if (!this.rec) return;
    this.caption = caption; this.sub = sub || this.sub; this.capT = performance.now();
    this.keepIt = { caption, sub: this.sub, at: Date.now() };
    clearTimeout(this.stopT); this.stopT = setTimeout(() => this.stop(), tail);
  }
  drop() { if (!this.rec) return; this.keepIt = null; this.stop(); }
  stop() { clearTimeout(this.limit); clearTimeout(this.stopT); try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); else this.finish(); } catch { this.finish(); } }
  finish() {
    const k = this.keepIt, type = this.rec?.mimeType || 'video/webm';
    this.rec = null;
    if (k && this.chunks.length) {
      const blob = new Blob(this.chunks, { type });
      this.clips.push({ ...k, blob, url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm', secs: (performance.now() - this.t0) / 1000 });
    }
    this.chunks = [];
  }
  reset() { this.drop(); for (const c of this.clips) URL.revokeObjectURL(c.url); this.clips = []; }

  frame() {
    const { g, cv } = this, W = cv.width, H = cv.height;
    const mirror = this.stage.classList.contains('mirror');
    g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(this.video, 0, 0, W, H); g.drawImage(this.overlay, 0, 0, W, H);
    g.restore();
    // corner tag
    g.fillStyle = 'rgba(8,13,24,.75)'; g.fillRect(12, 12, 150, 30);
    g.fillStyle = '#ff7a1a'; g.font = '800 18px "Barlow Condensed", sans-serif'; g.fillText('WHISTLE', 22, 34);
    g.fillStyle = '#eef3fb'; g.font = '600 13px Inter, sans-serif'; g.fillText(this.sub || '', 96, 33);
    if (this.caption) {
      const a = Math.min(1, (performance.now() - this.capT) / 200);
      g.globalAlpha = a; g.font = `800 ${Math.round(H * 0.13)}px "Barlow Condensed", sans-serif`;
      const w = g.measureText(this.caption).width;
      g.fillStyle = '#22c983'; g.fillRect((W - w) / 2 - 24, H * 0.36, w + 48, H * 0.16);
      g.fillStyle = '#04140c'; g.fillText(this.caption, (W - w) / 2, H * 0.48);
      g.globalAlpha = 1;
    }
  }
}
