// Blink view: every SPHEREx exposure of one spot on the sky, lined up and flipped
// through like a movie, so anything that moves or changes jumps out.
// Talks to app.py: /api/resolve, /api/frames, /api/grid, /api/gif, /api/gaia, /api/wise.
import { liquid } from './glass.js';

const SCALE = 6.2; // SPHEREx pixel size, arcsec
const BAND = { 1: [0.75, 1.09], 2: [1.10, 1.62], 3: [1.63, 2.41], 4: [2.42, 3.82], 5: [3.83, 4.41], 6: [4.42, 5.00] };
const FONT = '"Instrument Sans", system-ui, sans-serif';
const M = { l: 60, b: 44, t: 8, r: 8, cb: 76 };

const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>';
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>';

const sw = (id, label, on) => `<label class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span class="track"></span><span>${label}</span></label>`;

const HTML = `
<header class="bl-head">
  <div>
    <h2 id="blTitle">Blink</h2>
    <p id="blStatus" class="bl-status" aria-live="polite">Type a name or coordinates to compare every SPHEREx exposure of that spot.</p>
  </div>
  <button class="icon-btn" id="blClose" aria-label="Close blink view">${X}</button>
</header>

<div class="bl-bar">
  <form id="blForm" class="bl-search" autocomplete="off">
    <input id="blName" type="text" spellcheck="false" placeholder="Object name, or RA, Dec in degrees" aria-label="Object name or coordinates" />
    <button class="pill bl-go" type="submit">Load</button>
  </form>
  <div class="segmented bl-tabs" id="blTabs" data-index="0" role="tablist">
    <span class="seg-thumb" aria-hidden="true"></span>
    <button type="button" data-tab="blink" class="active" role="tab">Blink</button>
    <button type="button" data-tab="grid" role="tab">Six colours</button>
  </div>
</div>

<div class="bl-opts">
  <label class="bl-field">Detector
    <select id="blDet">
      <option value="0">All (mixed)</option>
      <option value="1">1 · 0.75–1.09 µm</option><option value="2">2 · 1.10–1.62 µm</option>
      <option value="3" selected>3 · 1.63–2.41 µm</option><option value="4">4 · 2.42–3.82 µm</option>
      <option value="5">5 · 3.83–4.41 µm</option><option value="6">6 · 4.42–5.00 µm</option>
    </select>
  </label>
  <label class="bl-field">Field
    <select id="blFov"><option value="0.1">0.1°</option><option value="0.2" selected>0.2°</option><option value="0.3">0.3°</option></select>
  </label>
  <label class="bl-field">Frames
    <select id="blMax"><option>6</option><option selected>12</option><option>24</option><option>48</option></select>
  </label>
  <label class="bl-field">Proper motion
    <span class="bl-pm"><input id="blPmra" type="number" step="any" placeholder="RA mas/yr" /><input id="blPmdec" type="number" step="any" placeholder="Dec mas/yr" /></span>
  </label>
  <div class="bl-switches">
    ${sw('blFollow', 'Follow object', true)}${sw('blCross', 'Mark target', true)}${sw('blGaia', 'Gaia stars', false)}${sw('blWise', 'AllWISE', false)}${sw('blCat', 'CatWISE', false)}${sw('blAst', 'Known asteroids', false)}
  </div>
</div>

<div class="bl-body">
  <section id="blBlink">
    <div class="bl-views">
      <figure><canvas id="blCv"></canvas><figcaption>Exposure</figcaption></figure>
      <figure><canvas id="blCv2"></canvas><figcaption>Difference from the median frame: red brighter, blue fainter</figcaption></figure>
    </div>
    <div class="bl-transport" id="blTransport" hidden>
      <button class="t-btn" id="blPrev" aria-label="Previous frame"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
      <button class="play lg" id="blPlay" aria-label="Play" data-refract="22">${PLAY}</button>
      <button class="t-btn" id="blNext" aria-label="Next frame"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
      <input type="range" id="blSlider" min="0" max="0" value="0" step="1" aria-label="Frame" />
      <label class="bl-fps">Speed <select id="blFps"><option value="1">1</option><option value="2" selected>2</option><option value="4">4</option><option value="8">8</option></select> fps</label>
      <button class="pill" id="blLink" type="button">Copy link</button>
      <a class="pill" id="blGif" href="#" download="spherex_blink.gif">GIF</a>
    </div>
    <p class="bl-note bl-legend">Overlays: <span style="color:#ffbe00">○ Gaia</span> · <span style="color:#e040fb">□ AllWISE</span> · <span style="color:#a3e635">△ CatWISE</span> · <span style="color:#ff7a45">◇ known asteroid or comet</span>. They are drawn where each catalogue object should be on that frame's date. A mover with no marker is not a known object.</p>
    <p id="blFrame" class="bl-frame"></p>
    <p id="blInfo" class="bl-note"></p>
    <p id="blMotion" class="bl-note"></p>
  </section>
  <section id="blGrid" hidden>
    <p class="bl-note">One exposure from each of SPHEREx's six detectors: the same spot in six infrared colours, shortest wavelength first.</p>
    <div id="blGridBox" class="bl-grid"></div>
  </section>
</div>`;

const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('image failed to load')); i.src = src; });
const mjdDate = (m) => new Date((m - 40587) * 86400000).toISOString().slice(0, 10);
async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch { /* not json */ } throw new Error(m); }
  return r.json();
}
const fmtDeg = (v, n = 4) => `${v.toFixed(n)}°`;

let root, q, D = null, G = null, imgs = [], imgs2 = [], idx = 0, timer = null;
let gaia = [], wise = [], cat = [], ast = {}, astKey = (m) => (Math.round(m * 10) / 10).toFixed(1), resolved = '', token = 0, target = { ra: null, dec: null };
let onOpenChange = () => {};

const $ = (id) => root.querySelector(`#${id}`);
const isOpen = () => root?.classList.contains('open');

function setStatus(t, err) { const s = $('blStatus'); s.textContent = t; s.classList.toggle('err', !!err); }

function params() {
  return new URLSearchParams({
    ra: target.ra, dec: target.dec, fov: $('blFov').value, scale: SCALE, detector: $('blDet').value,
    bin_days: 0, mode: 'raw', max_frames: $('blMax').value, pmra: $('blPmra').value || 0, pmdec: $('blPmdec').value || 0,
    epoch: 2026, follow: $('blFollow').checked ? 1 : 0,
  });
}
function pushURL() {
  const p = params();
  const name = $('blName').value.trim();
  const out = new URLSearchParams({ blink: name || `${target.ra},${target.dec}` });
  for (const k of ['ra', 'dec', 'fov', 'detector', 'max_frames', 'pmra', 'pmdec', 'follow']) out.set(k, p.get(k));
  try { history.replaceState(null, '', `?${out}`); } catch { /* sandboxed */ }
  $('blGif').href = `api/gif?${p}&interval_ms=${Math.round(1000 / $('blFps').value)}`;
}
function clearURL() { try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ } }

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

async function resolveName(name) {
  const m = COORDS.exec(name);
  if (m) {
    target = { ra: +m[1], dec: +m[2] };
    $('blPmra').value = $('blPmra').value || '0'; $('blPmdec').value = $('blPmdec').value || '0';
    resolved = name;
    setStatus('Using the coordinates you typed. If the object moves, enter its proper motion.');
    return;
  }
  setStatus(`Looking up ${name}…`);
  const c = await jget(`api/resolve?name=${encodeURIComponent(name)}&epoch=2026`);
  target = { ra: c.ra, dec: c.dec };
  $('blPmra').value = c.pmra.toFixed(1); $('blPmdec').value = c.pmdec.toFixed(1);
  resolved = name;
  const mu = Math.hypot(c.pmra, c.pmdec) / 1000;
  setStatus(!c.pm_found
    ? 'Position found, but no proper motion is listed. If it moves, enter it in the proper motion boxes.'
    : mu > 0.01 ? `Position found. Proper motion ${mu.toFixed(2)}″ per year.` : 'Position found; its proper motion is negligible.');
}

// where the object is on a frame's date: arcsec east/north of that frame's centre
function objOffset(S, f) {
  const dt = f.year - S.epoch, cd = Math.cos(f.cdec * Math.PI / 180);
  const ora = S.ra + S.pmra * dt / 3.6e6 / Math.cos(S.dec * Math.PI / 180), odec = S.dec + S.pmdec * dt / 3.6e6;
  return [(ora - f.cra) * cd * 3600, (odec - f.cdec) * 3600];
}

async function load() {
  const my = ++token;
  stop();
  const name = $('blName').value.trim();
  $('blTitle').textContent = name ? `Blink · ${name}` : 'Blink';
  try {
    if (name && name !== resolved) await resolveName(name);
    if (my !== token) return;
    if (target.ra == null) throw new Error('Type an object name, or RA and Dec in degrees.');
    pushURL();
    setStatus('Searching IRSA and downloading cutouts… the first load of an object can take a few minutes.');
    const d = await jget(`api/frames?${params()}`);
    const a = await Promise.all(d.frames.map((f) => loadImg(f.png)));
    const b = await Promise.all(d.frames.map((f) => loadImg(f.diff)));
    if (my !== token) return;
    D = d; imgs = a; imgs2 = b; gaia = []; wise = []; cat = []; ast = {};
    $('blTransport').hidden = false;
    $('blSlider').max = imgs.length - 1; idx = 0; show(0);
    setStatus(`${imgs.length} frames shown (${D.total} exposures found around this position).`);
    overlays(my);
    play();
  } catch (e) { if (my === token) setStatus(`Error: ${e.message}`, true); }
}

function baseStatus() { return `${imgs.length} frames shown (${D.total} exposures found around this position).`; }
async function overlays(my = token) {
  if (!D) return;
  const qs = `ra=${D.ra}&dec=${D.dec}&fov=${D.fov}`, fails = [];
  const get = async (on, url, label, empty) => {
    if (!on) return empty;
    try { return await jget(url); } catch (e) { fails.push(label); return empty; }
  };
  const mjds = [...new Set(D.frames.map((f) => astKey(f.mjd)))].join(',');
  const [g, w, c, a] = await Promise.all([
    get($('blGaia').checked, `api/gaia?${qs}`, 'Gaia', []),
    get($('blWise').checked, `api/wise?${qs}`, 'AllWISE', []),
    get($('blCat').checked, `api/catwise?${qs}`, 'CatWISE', []),
    get($('blAst').checked, `api/asteroids?${qs}&mjds=${mjds}`, 'asteroids', {}),
  ]);
  if (my !== token) return;
  gaia = g; wise = w; cat = c; ast = a; show(idx);
  let msg = baseStatus();
  if ($('blAst').checked && !fails.includes('asteroids')) {
    const names = new Set(Object.values(ast).flat().map((o) => o.name));
    msg += ` ${names.size} known asteroid${names.size === 1 ? '' : 's'}/comet${names.size === 1 ? '' : 's'} in the field.`;
  }
  if (fails.length) msg += ` Overlay unavailable: ${fails.join(', ')} (open /api/diag to see why).`;
  setStatus(msg, fails.length > 0);
}

function prep(cv, W, H) {
  const d = window.devicePixelRatio || 1;
  cv.width = Math.round(W * d); cv.height = Math.round(H * d);
  cv.style.width = `${W}px`; cv.style.maxWidth = '100%'; cv.style.height = 'auto';
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); return c;
}
function arrow(c, x, y, dx, dy, lab) {
  c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); c.stroke();
  const a = Math.atan2(dy, dx); c.beginPath(); c.moveTo(x + dx, y + dy);
  c.lineTo(x + dx - 5 * Math.cos(a - 0.5), y + dy - 5 * Math.sin(a - 0.5));
  c.lineTo(x + dx - 5 * Math.cos(a + 0.5), y + dy - 5 * Math.sin(a + 0.5)); c.fill();
  c.font = `11px ${FONT}`; c.textAlign = 'center'; c.fillText(lab, x + dx * 1.5, y + dy * 1.5 + 4);
}

// Each picture gets as much room as the panel allows: two side by side, as tall as fits.
function viewSize() {
  const body = document.querySelector('#blinkPanel .bl-body');
  const bw = body ? body.clientWidth : innerWidth * 0.8;
  const bh = body ? body.clientHeight : innerHeight * 0.5;
  const byW = (bw - 14) / 2 - M.l - M.r - M.cb / 2;
  const tr = document.getElementById('blTransport');
  const byH = bh - M.t - M.b - 40 - (tr ? tr.offsetHeight + 40 : 120);
  return Math.round(Math.max(240, Math.min(620, byW, byH)));
}

function panel(cv, img, f, isDiff) {
  const base = viewSize(), z = Math.max(1, base / D.n), w = D.n * z, cd = Math.cos(f.cdec * Math.PI / 180);
  const cw = w + M.l + M.r + (isDiff ? M.cb : 0), ch = w + M.t + M.b;
  const c = prep(cv, cw, ch);
  c.clearRect(0, 0, cw, ch);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(img, M.l, M.t, w, w);
  c.strokeStyle = '#475569'; c.lineWidth = 1; c.strokeRect(M.l, M.t, w, w);
  c.fillStyle = '#94a3b8'; c.font = `10px ${FONT}`;
  [0.15, 0.5, 0.85].forEach((k) => {
    const px = M.l + k * w, py = M.t + k * w, d = (0.5 - k) * D.n * SCALE;
    c.beginPath(); c.moveTo(px, M.t + w); c.lineTo(px, M.t + w + 4); c.stroke();
    c.textAlign = 'center'; c.fillText(fmtDeg(f.cra + d / 3600 / cd), px, M.t + w + 16);
    c.beginPath(); c.moveTo(M.l, py); c.lineTo(M.l - 4, py); c.stroke();
    c.textAlign = 'right'; c.fillText(fmtDeg(f.cdec + d / 3600), M.l - 7, py + 3);
  });
  c.textAlign = 'center'; c.fillStyle = '#cbd5e1'; c.font = `11px ${FONT}`;
  c.fillText('Right Ascension (east is left)', M.l + w / 2, w + M.t + M.b - 5);
  if (!isDiff) { c.save(); c.translate(12, M.t + w / 2); c.rotate(-Math.PI / 2); c.fillText('Declination (north is up)', 0, 0); c.restore(); }
  const cx = M.l + w / 2, cy = M.t + w / 2;
  if ($('blCross').checked) {
    const [oE, oN] = objOffset(D, f);
    if (!D.follow && (D.pmra || D.pmdec)) {
      c.strokeStyle = 'rgba(0,200,215,.9)'; c.lineWidth = 1; c.beginPath();
      D.frames.forEach((p, k) => { const [e, n] = objOffset(D, p), x = cx - e / SCALE * z, y = cy - n / SCALE * z; if (k) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke();
      D.frames.forEach((p) => { const [e, n] = objOffset(D, p); c.fillStyle = 'rgba(0,200,215,.9)'; c.fillRect(cx - e / SCALE * z - 1.5, cy - n / SCALE * z - 1.5, 3, 3); });
    }
    c.strokeStyle = '#22d3ee'; c.lineWidth = 1.8; c.setLineDash([4, 3]); c.beginPath();
    c.arc(cx - oE / SCALE * z, cy - oN / SCALE * z, Math.max(10, w * 0.07), 0, 7); c.stroke(); c.setLineDash([]);
  }
  const inside = (x, y) => x >= M.l && y >= M.t && x <= M.l + w && y <= M.t + w;
  gaia.forEach((g) => {
    if (g.ra == null) return; const dt = f.year - 2016.0;
    const dE = (g.ra - f.cra) * cd * 3600 + g.pmra * dt / 1000, dN = (g.dec - f.cdec) * 3600 + g.pmdec * dt / 1000;
    const x = cx - dE / SCALE * z, y = cy - dN / SCALE * z; if (!inside(x, y)) return;
    c.strokeStyle = 'rgba(255,190,0,.95)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 6, 0, 7); c.stroke();
  });
  wise.forEach((g) => {
    if (g.ra == null) return; const dt = f.year - 2010.5;
    const dE = (g.ra - f.cra) * cd * 3600 + g.pmra * dt / 1000, dN = (g.dec - f.cdec) * 3600 + g.pmdec * dt / 1000;
    const x = cx - dE / SCALE * z, y = cy - dN / SCALE * z; if (!inside(x, y)) return;
    c.strokeStyle = '#e040fb'; c.lineWidth = 1.4; c.strokeRect(x - 5, y - 5, 10, 10);
  });
  cat.forEach((g) => {
    if (g.ra == null) return; const dt = f.year - 2015.405;
    const dE = (g.ra - f.cra) * cd * 3600 + g.pmra * dt / 1000, dN = (g.dec - f.cdec) * 3600 + g.pmdec * dt / 1000;
    const x = cx - dE / SCALE * z, y = cy - dN / SCALE * z; if (!inside(x, y)) return;
    c.strokeStyle = '#a3e635'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); c.stroke();
  });
  (ast[astKey(f.mjd)] || []).forEach((o) => {
    const dE = (o.ra - f.cra) * cd * 3600, dN = (o.dec - f.cdec) * 3600;
    const x = cx - dE / SCALE * z, y = cy - dN / SCALE * z; if (!inside(x, y)) return;
    c.strokeStyle = '#ff7a45'; c.fillStyle = '#ff7a45'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y); c.lineTo(x, y + 7); c.lineTo(x - 7, y); c.closePath(); c.stroke();
    c.font = `11px ${FONT}`; c.textAlign = 'left'; c.fillText(`${o.name}${o.mag != null ? ` · V${(+o.mag).toFixed(1)}` : ''}`, x + 10, y + 4);
  });
  const bar = 60 / SCALE * z; c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(M.l + 10, M.t + w - 12); c.lineTo(M.l + 10 + bar, M.t + w - 12); c.stroke();
  c.font = `11px ${FONT}`; c.textAlign = 'left'; c.fillText('60″', M.l + 10, M.t + w - 17);
  arrow(c, M.l + w - 16, M.t + 40, 0, -24, 'N'); arrow(c, M.l + w - 16, M.t + 40, -24, 0, 'E');
  if (isDiff) {
    const bx = M.l + w + 14, g = c.createLinearGradient(0, M.t, 0, M.t + w);
    g.addColorStop(0, '#ffd6a0'); g.addColorStop(0.2, '#c83c28'); g.addColorStop(0.35, '#080a14'); g.addColorStop(0.65, '#080a14'); g.addColorStop(0.8, '#285ad2'); g.addColorStop(1, '#5aaaff');
    c.fillStyle = g; c.fillRect(bx, M.t, 12, w); c.strokeStyle = '#475569'; c.strokeRect(bx, M.t, 12, w);
    c.fillStyle = '#94a3b8'; c.font = `10px ${FONT}`; c.textAlign = 'left';
    c.fillText('+5σ', bx + 16, M.t + 8); c.fillText('0', bx + 16, M.t + w / 2 + 3); c.fillText('−5σ', bx + 16, M.t + w - 2);
  }
}

function motionText() {
  const pm = Math.hypot(D.pmra, D.pmdec) / 1000, F = D.frames, span = F[F.length - 1].year - F[0].year;
  if (!pm) return 'No proper motion is set, so this object is treated as fixed on the sky. Anything that changes between frames is then a change in brightness or an artefact. Slate-blue areas are masked (no data), not sky.';
  const dist = pm * span, pa = (Math.atan2(D.pmra, D.pmdec) * 180 / Math.PI + 360) % 360;
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return `Expected motion: <b>${pm.toFixed(2)}″ per year</b> toward ${dirs[Math.round(pa / 45) % 8]}. Across these frames (${mjdDate(F[0].mjd)} to ${mjdDate(F[F.length - 1].mjd)}, ${span.toFixed(2)} years) it moves <b>${dist.toFixed(1)}″ = ${(dist / SCALE).toFixed(1)} pixels</b>. Slate-blue areas are masked (no data).`;
}

function show(i) {
  if (!D) return;
  idx = i; $('blSlider').value = i;
  const f = D.frames[i], b = BAND[f.det];
  panel($('blCv'), imgs[i], f, false); panel($('blCv2'), imgs2[i], f, true);
  $('blFrame').textContent = `Frame ${i + 1} of ${D.frames.length} · detector ${f.det || 'mixed'}${b ? ` (${b[0]}–${b[1]} µm)` : ''} · observed ${mjdDate(f.mjd)}`;
  $('blInfo').textContent = `At the target: λ ≈ ${Number.isFinite(f.wl) ? f.wl.toFixed(3) : '?'} µm · flux ${f.flux.toFixed(3)} ± ${f.err.toFixed(3)} MJy/sr · ${f.obsid}`;
  $('blMotion').innerHTML = motionText();
}

function play() {
  if (!D || imgs.length < 2) return;
  stop();
  $('blPlay').innerHTML = PAUSE; $('blPlay').setAttribute('aria-label', 'Pause');
  timer = setInterval(() => show((idx + 1) % imgs.length), 1000 / $('blFps').value);
}
function stop() {
  clearInterval(timer); timer = null;
  if (root) { $('blPlay').innerHTML = PLAY; $('blPlay').setAttribute('aria-label', 'Play'); }
}

async function loadGrid() {
  const my = ++token;
  const name = $('blName').value.trim();
  try {
    if (name && name !== resolved) await resolveName(name);
    if (target.ra == null) throw new Error('Type an object name, or RA and Dec in degrees.');
    setStatus('Fetching one exposure from each detector… (the first time can take a few minutes)');
    const p = new URLSearchParams({ ra: target.ra, dec: target.dec, fov: $('blFov').value, scale: SCALE,
      pmra: $('blPmra').value || 0, pmdec: $('blPmdec').value || 0, epoch: 2026, follow: $('blFollow').checked ? 1 : 0 });
    const g = await jget(`api/grid?${p}`);
    const gi = await Promise.all(g.panels.map((x) => loadImg(x.png)));
    if (my !== token) return;
    G = g;
    const box = $('blGridBox'); box.replaceChildren();
    const order = g.panels.map((x, i) => i).sort((a, b) => (g.panels[a].wl ?? 9) - (g.panels[b].wl ?? 9));
    order.forEach((i) => {
      const P = g.panels[i], b = BAND[P.det], card = document.createElement('figure');
      const cv = document.createElement('canvas'); card.append(cv);
      card.insertAdjacentHTML('beforeend', `<figcaption><strong>Detector ${P.det}${P.wl != null ? ` · target at ${P.wl.toFixed(2)} µm` : ''}</strong><span>covers ${b[0]}–${b[1]} µm · ${mjdDate(P.mjd)}</span></figcaption>`);
      box.append(card); gpanel(cv, gi[i], P);
    });
    setStatus(`${g.panels.length} exposures, one per detector.`);
  } catch (e) { if (my === token) setStatus(`Error: ${e.message}`, true); }
}
function gpanel(cv, img, P) {
  const W = 360, c = prep(cv, W, W); cv.style.width = '100%';
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(img, 0, 0, W, W);
  const [oE, oN] = objOffset(G, P), k = W / (G.n * SCALE);
  c.strokeStyle = '#22d3ee'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2 - oE * k, W / 2 - oN * k, Math.max(12, W * 0.06), 0, 7); c.stroke();
  arrow(c, W - 26, W - 14, 0, -26, 'N'); arrow(c, W - 26, W - 14, -26, 0, 'E');
}

function setTab(tab) {
  $('blTabs').dataset.index = tab === 'grid' ? '1' : '0';
  root.querySelectorAll('#blTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('blBlink').hidden = tab === 'grid'; $('blGrid').hidden = tab !== 'grid';
  if (tab === 'grid') { stop(); loadGrid(); } else if (D) { setStatus(`${imgs.length} frames shown (${D.total} exposures found around this position).`); }
}

export function closeBlink() {
  if (!isOpen()) return;
  stop(); token++;
  root.classList.remove('open'); document.body.classList.remove('blink-open');
  clearURL(); onOpenChange(false);
}

// opts: { name } or { ra, dec, pmra, pmdec, name? }. Opens the panel and loads it.
export function openBlink(opts = {}) {
  if (!root) return;
  root.classList.add('open'); document.body.classList.add('blink-open'); onOpenChange(true);
  const name = (opts.name || '').trim();
  if (opts.ra != null && opts.dec != null) {
    target = { ra: +opts.ra, dec: +opts.dec };
    $('blPmra').value = opts.pmra ?? '0'; $('blPmdec').value = opts.pmdec ?? '0';
    resolved = name || `${opts.ra},${opts.dec}`;
    $('blName').value = name || `${(+opts.ra).toFixed(5)}, ${(+opts.dec).toFixed(5)}`;
  } else if (name) {
    if (name !== resolved) { target = { ra: null, dec: null }; $('blPmra').value = ''; $('blPmdec').value = ''; }
    $('blName').value = name;
  } else { $('blName').focus(); return; }
  setTab('blink');
  load();
}

export function initBlink({ onToggle } = {}) {
  root = document.createElement('section');
  root.id = 'blinkPanel';
  root.className = 'lg lg-regular';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Blink view');
  root.dataset.refract = '40';
  root.innerHTML = HTML;
  document.body.append(root);
  liquid(root); root.querySelectorAll('.lg').forEach(liquid);
  onOpenChange = onToggle || (() => {});

  $('blClose').onclick = closeBlink;
  $('blForm').onsubmit = (e) => { e.preventDefault(); resolved = ''; setTab('blink'); load(); };
  $('blTabs').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); };
  $('blPlay').onclick = () => (timer ? stop() : play());
  $('blNext').onclick = () => { if (D) { stop(); show((idx + 1) % imgs.length); } };
  $('blPrev').onclick = () => { if (D) { stop(); show((idx - 1 + imgs.length) % imgs.length); } };
  $('blSlider').oninput = (e) => { stop(); show(+e.target.value); };
  $('blFps').onchange = () => { if (timer) play(); if (D) pushURL(); };
  $('blCross').onchange = () => show(idx);
  for (const id of ['blFov', 'blMax', 'blDet', 'blFollow']) $(id).onchange = () => { if (target.ra != null) (root.querySelector('#blGrid').hidden ? load() : loadGrid()); };
  for (const id of ['blPmra', 'blPmdec']) $(id).onchange = () => { if (target.ra != null) load(); };
  for (const id of ['blGaia', 'blWise', 'blCat', 'blAst']) $(id).onchange = () => overlays();
  $('blLink').onclick = () => {
    pushURL();
    try { navigator.clipboard.writeText(location.href); setStatus('Link copied. Anyone can open it to see the same view.'); } catch { setStatus(location.href); }
  };
  $('blGif').onclick = () => { if (target.ra == null) { setStatus('Load an object first.', true); return false; } pushURL(); return true; };

  // While the panel is open, arrows and Space belong to it, not to the camera.
  window.addEventListener('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = /INPUT|SELECT|TEXTAREA/.test(t.tagName) && t.type !== 'range' && t.type !== 'checkbox';
    if (e.key === 'Escape' && !typing) { e.stopImmediatePropagation(); closeBlink(); return; }
    if (typing) return;
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowRight') { eat(); $('blNext').click(); }
    else if (e.key === 'ArrowLeft') { eat(); $('blPrev').click(); }
    else if (e.key === ' ') { eat(); $('blPlay').click(); }
  }, true);

  // Start from a shared link: ?blink=Name (or ra/dec/pmra/pmdec)
  const p = new URLSearchParams(location.search);
  if (p.has('blink')) {
    for (const [k, id] of [['fov', 'blFov'], ['detector', 'blDet'], ['max_frames', 'blMax']]) if (p.has(k)) $(id).value = p.get(k);
    if (p.get('follow') === '0') $('blFollow').checked = false;
    const name = p.get('blink');
    if (p.has('ra') && p.has('dec')) openBlink({ name: COORDS.test(name) ? '' : name, ra: p.get('ra'), dec: p.get('dec'), pmra: p.get('pmra') ?? 0, pmdec: p.get('pmdec') ?? 0 });
    else openBlink({ name });
  }
}

// Re-fit the pictures when the window (or the embedding page) changes size.
let _rs;
window.addEventListener('resize', () => {
  clearTimeout(_rs);
  _rs = setTimeout(() => { if (D && document.getElementById('blinkPanel')?.classList.contains('open')) show(idx); }, 150);
});
