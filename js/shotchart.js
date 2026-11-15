// Shot chart: where every shot came from (the shooter's feet, in the camera picture) and whether it
// went in, drawn over a snapshot of your own court. Makes are filled dots, misses are rings, so the
// two are told apart by shape as well as colour. Zones split the floor into left / middle / right.
const COURT_KEY = 'whistle.court';
const MADE = '#22c983', MISS = '#ff4655';

export function saveCourt(video) {
  try {
    if (!video.videoWidth) return;
    const c = document.createElement('canvas'); c.width = 360; c.height = Math.round((360 * video.videoHeight) / video.videoWidth);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    localStorage.setItem(COURT_KEY, c.toDataURL('image/jpeg', 0.6));
  } catch { /* storage full or blocked: the chart just has no picture */ }
}
const court = () => { try { return localStorage.getItem(COURT_KEY); } catch { return null; } };

// shots: [{x, y, m (made), at}]
export function shotChartHTML(shots, title = 'Shot chart') {
  if (!shots || !shots.length) return `<div class="card"><p class="label">${title}</p><p style="color:var(--faint);margin:0">No shots logged yet. Shots from any mode show up here.</p></div>`;
  const img = court(), W = 360, H = 203;
  const zones = [0, 1, 2].map((z) => { const s = shots.filter((q) => Math.min(2, Math.floor(q.x * 3)) === z); const m = s.filter((q) => q.m).length; return { n: s.length, m }; });
  const pct = (z) => (z.n ? Math.round((100 * z.m) / z.n) + '%' : '–');
  const made = shots.filter((q) => q.m).length;
  return `<div class="card"><p class="label">${title} · ${made}/${shots.length} (${Math.round((100 * made) / shots.length)}%)</p>
    <svg viewBox="0 0 ${W} ${H}" class="shotchart" role="img" aria-label="${title}: ${made} of ${shots.length} made">
      ${img ? `<image href="${img}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity=".45"/>` : `<rect width="${W}" height="${H}" fill="#0b1424"/>`}
      <line x1="${W / 3}" x2="${W / 3}" y1="0" y2="${H}" stroke="#eef3fb" stroke-opacity=".25" stroke-dasharray="4 4"/><line x1="${(2 * W) / 3}" x2="${(2 * W) / 3}" y1="0" y2="${H}" stroke="#eef3fb" stroke-opacity=".25" stroke-dasharray="4 4"/>
      ${shots.map((q) => q.m ? `<circle cx="${(q.x * W).toFixed(1)}" cy="${(q.y * H).toFixed(1)}" r="5" fill="${MADE}" stroke="#0a111f" stroke-width="2"><title>Made</title></circle>` : `<circle cx="${(q.x * W).toFixed(1)}" cy="${(q.y * H).toFixed(1)}" r="4.5" fill="none" stroke="${MISS}" stroke-width="2.5"><title>Missed</title></circle>`).join('')}
    </svg>
    <div class="zones">${['Left', 'Middle', 'Right'].map((n, z) => `<div><b>${pct(zones[z])}</b><span>${n} · ${zones[z].m}/${zones[z].n}</span></div>`).join('')}</div>
    <p class="legend"><span><i style="background:${MADE}"></i>Made</span><span><i style="border:2.5px solid ${MISS};background:none"></i>Missed</span><span style="color:var(--faint)">Spots are where the shooter's feet were, as the camera saw them.</span></p></div>`;
}
