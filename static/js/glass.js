// Liquid glass: each `.lg` element gets an SVG filter whose displacement map is
// generated for its exact size and corner radius, so the scene behind it bends
// at the rim like light through a thick lens. Chromium only (backdrop-filter: url()).
// Other browsers keep the CSS blur fallback.

const NS = 'http://www.w3.org/2000/svg';

export const liquidSupported = (() => {
  const brands = navigator.userAgentData?.brands || [];
  return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Opera/.test(b.brand));
})();

let defs = null;
let uid = 0;
const state = new WeakMap();

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(NS, 'defs');
  svg.append(defs);
  document.body.append(svg);
  return defs;
}

// Maps are pure functions of size, radius and band: build each one once.
const mapCache = new Map();
function cachedMap(w, h, radius, band) {
  const key = `${w}x${h}:${radius}:${band}`;
  let url = mapCache.get(key);
  if (!url) {
    url = displacementMap(w, h, radius, band);
    if (mapCache.size > 64) mapCache.delete(mapCache.keys().next().value);
    mapCache.set(key, url);
  }
  return url;
}

// Red = x displacement, green = y displacement, 128 = none.
// Strength rises towards the rim along the rounded-rect normal (a convex lens profile).
function displacementMap(w, h, radius, band) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2, hh = h / 2;
  const r = Math.min(radius, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
      let sd, nx, ny;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy);
        sd = l - r; nx = qx / l; ny = qy / l;
      } else {
        sd = Math.max(qx, qy) - r;
        if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
      }
      nx *= px < 0 ? -1 : 1;
      ny *= py < 0 ? -1 : 1;
      const inside = -sd;
      let a = 0;
      if (inside < band) {
        const t = 1 - Math.max(0, inside) / band;
        a = t * t;
      }
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * a * 127;
      d[i + 1] = 128 - ny * a * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function channel(i) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
  m[i * 6] = 1;
  return m.join(' ');
}

function build(el) {
  const s = state.get(el);
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  if (s.w === w && s.h === h) return;
  s.w = w; s.h = h;

  const cs = getComputedStyle(el);
  const radius = parseFloat(cs.borderTopLeftRadius) || 0;
  const scale = Number(el.dataset.refract || 46);
  const band = Number(el.dataset.band || Math.min(26, Math.min(w, h) * 0.42));
  // Panes meant for reading get more frost so the scene doesn't compete with text.
  const blur = Number(el.dataset.frost || (el.classList.contains('lg-regular') ? 5 : 0.6));
  const map = cachedMap(w, h, radius, band);

  const id = `lg-${++uid}`;
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', String(w));
  f.setAttribute('height', String(h));
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  // Three displacement passes at slightly different strengths split the
  // colour channels at the rim, the faint prism edge real glass shows.
  f.innerHTML = `
    <feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="src"/>
    <feDisplacementMap in="src" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feColorMatrix in="dr" type="matrix" values="${channel(0)}" result="r"/>
    <feDisplacementMap in="src" in2="map" scale="${scale * 0.9}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feColorMatrix in="dg" type="matrix" values="${channel(1)}" result="g"/>
    <feDisplacementMap in="src" in2="map" scale="${scale * 0.8}" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="db" type="matrix" values="${channel(2)}" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen" result="rgb"/>
    <feColorMatrix in="rgb" type="saturate" values="1.4"/>`;
  ensureDefs().append(f);
  el.style.backdropFilter = `url(#${id})`;
  s.filter?.remove();
  s.filter = f;
}

// First build happens on the next frame. After that, an element that is
// resizing (a panel opening, a list folding) is rebuilt once it has held the
// same size for SETTLE_MS, not at every frame of the animation: each rebuild
// swaps the SVG filter, which the compositor has to recompile.
const SETTLE_MS = 140;
const queue = new Set();
let scheduled = false;
const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target, s = state.get(el);
    if (s.w === undefined) { queue.add(el); continue; }
    clearTimeout(s.timer);
    s.timer = setTimeout(() => build(el), SETTLE_MS);
  }
  if (scheduled || !queue.size) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const el of queue) build(el);
    queue.clear();
  });
});

export function liquid(el) {
  if (!liquidSupported || state.has(el)) return;
  state.set(el, {});
  ro.observe(el);
}

export function initLiquidGlass(root = document) {
  if (!liquidSupported) return;
  document.documentElement.classList.add('liquid');
  root.querySelectorAll('.lg').forEach(liquid);
}
