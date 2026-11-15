// "That was a bad call": saves the replay clip of the last few seconds plus what the ref saw (the
// calls, ball tracking, settings) on this device, so it can be sent to whoever tunes WHISTLE.
const DB = 'whistle', STORE = 'badcalls';
const db = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };

// frames: the replay buffer ([{t, bmp, poses, ball, mirror}]); returns a WebM blob (or null)
export async function framesToVideo(frames) {
  if (!frames.length || typeof MediaRecorder === 'undefined') return null;
  const W = frames[0].bmp.width, H = frames[0].bmp.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(cv.captureStream(15), mime ? { mimeType: mime } : undefined), chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(200);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    g.save(); if (f.mirror) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(f.bmp, 0, 0); g.restore();
    await new Promise((r) => setTimeout(r, i + 1 < frames.length ? Math.max(16, frames[i + 1].t - f.t) : 200));
  }
  rec.stop(); await done;
  return new Blob(chunks, { type: rec.mimeType || 'video/webm' });
}
export async function saveBadCall(entry) { entry.id ||= Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await tx('readwrite', (s) => s.put(entry)); return entry.id; }
export async function listBadCalls() { try { return (await tx('readonly', (s) => s.getAll())) || []; } catch { return []; } }
export async function deleteBadCall(id) { await tx('readwrite', (s) => s.delete(id)); }
export function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
