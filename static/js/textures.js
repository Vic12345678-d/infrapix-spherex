// Procedural planet textures drawn on canvases, so the app needs no image downloads.
import * as THREE from 'three';

function hash(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, seed, octaves = 5) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Paint an equirectangular canvas. fn(px, py, lat, lon, sx, sy, sz) -> [r,g,b]
function paint(w, h, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const lat = (0.5 - (py + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let px = 0; px < w; px++) {
      const lon = ((px + 0.5) / w) * Math.PI * 2;
      const c = fn(lat, lon, cl * Math.cos(lon), sl, cl * Math.sin(lon));
      const i = (py * w + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function rocky({ colors, seed, freq = 4, caps = false }) {
  const dark = hexToRgb(colors[0]), light = hexToRgb(colors[1]);
  return paint(512, 256, (lat, lon, x, y, z) => {
    let v = fbm(x * freq, y * freq, z * freq, seed);
    const crater = fbm(x * freq * 4, y * freq * 4, z * freq * 4, seed + 5, 3);
    v = v * 0.85 + (crater > 0.62 ? -0.15 : crater < 0.3 ? 0.08 : 0);
    let c = mix(dark, light, Math.min(1, Math.max(0, (v - 0.25) * 1.8)));
    if (caps && Math.abs(lat) > 1.3 + (fbm(x * 6, y * 6, z * 6, seed + 9, 3) - 0.5) * 0.25) c = [235, 230, 225];
    return c;
  });
}

function banded({ colors, seed, bands = 6, turb = 1, spot = false }) {
  const pal = colors.map(hexToRgb);
  return paint(512, 256, (lat, lon, x, y, z) => {
    const n = fbm(x * 3, y * 9, z * 3, seed);
    let t = (lat / Math.PI + 0.5) * bands + (n - 0.5) * turb;
    if (spot) {
      // A great storm in the southern hemisphere.
      const dLat = (lat + 0.38) / 0.09, dLon = (lon - 2.2) / 0.22;
      const d = dLat * dLat + dLon * dLon;
      if (d < 1) return mix(pal[1], [190, 90, 60], (1 - d) * 0.9);
    }
    const idx = ((Math.floor(t) % pal.length) + pal.length) % pal.length;
    const f = smooth(t - Math.floor(t));
    return mix(pal[idx], pal[(idx + 1) % pal.length], f);
  });
}

function earth({ seed }) {
  return paint(768, 384, (lat, lon, x, y, z) => {
    const h = fbm(x * 2.2, y * 2.2, z * 2.2, seed, 6);
    const absLat = Math.abs(lat);
    let c;
    if (h > 0.53) {
      const veg = fbm(x * 6, y * 6, z * 6, seed + 3, 4);
      const desert = absLat < 0.55 && veg > 0.55;
      c = desert ? [196, 170, 120] : mix([46, 102, 46], [120, 130, 70], veg);
    } else {
      c = mix([10, 32, 90], [30, 90, 170], Math.min(1, h / 0.53));
    }
    if (absLat > 1.2 + (h - 0.5) * 0.4) c = [240, 245, 250];
    const cloud = fbm(x * 4, y * 5, z * 4, seed + 7, 5);
    if (cloud > 0.56) c = mix(c, [255, 255, 255], Math.min(0.85, (cloud - 0.56) * 4));
    return c;
  });
}

export function sunTexture() {
  const canvas = paint(512, 256, (lat, lon, x, y, z) => {
    const n = fbm(x * 8, y * 8, z * 8, 7, 5);
    return mix([230, 110, 20], [255, 236, 150], Math.min(1, n * 1.4));
  });
  return toTexture(canvas);
}

export function glowTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,230,160,1)');
  g.addColorStop(0.18, 'rgba(255,200,90,0.75)');
  g.addColorStop(0.45, 'rgba(255,140,40,0.18)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return toTexture(canvas);
}

// Saturn's rings, mapped radially from inner edge (u=0) to outer edge (u=1).
export function ringTexture() {
  const w = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 4;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < w; x++) {
    const r = 1.24 + (x / w) * 1.03; // in planet radii
    let a = 0;
    if (r < 1.53) a = 0.18; // C ring
    else if (r < 1.95) a = 0.85; // B ring
    else if (r < 2.03) a = 0.05; // Cassini division
    else a = 0.6; // A ring
    a *= 0.75 + 0.25 * noise3(x * 0.15, 0, 0, 3);
    const b = 200 + 40 * noise3(x * 0.05, 1, 0, 4);
    ctx.fillStyle = `rgba(${b},${b * 0.9},${b * 0.72},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  return toTexture(canvas);
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function planetTexture(spec) {
  const painters = { rocky, banded, earth };
  return toTexture(painters[spec.kind](spec));
}
