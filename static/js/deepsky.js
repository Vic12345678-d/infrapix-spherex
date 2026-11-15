// Deep-sky objects observed by SPHEREx, placed on the sky around the solar system.
// Reads the exports that spherex_scene.py writes to nebula/<slug>/ (scene.json,
// composite.png, layer_D1..6.png) and lists them from nebula/targets.json.
import * as THREE from 'three';

export const SKY_RADIUS = 12000; // scene units: far outside Neptune, inside the star field
const OBLIQUITY = 23.4392911 * (Math.PI / 180); // tilt between equator and ecliptic (J2000)
const DEG = Math.PI / 180;

// Extra facts for well-known targets. Anything else still shows, just with less text.
const KNOWN = {
  orion_nebula: {
    type: 'Emission nebula · star-forming region',
    distance: ['Distance from Earth', '≈ 1,350 light-years', 'measured from the parallax of its young stars'],
    description:
      'The nearest large stellar nursery to Earth, in the sword of Orion. Hot young stars at its heart, '
      + 'the Trapezium, light up the gas around them. SPHEREx sees through much of the dust that hides '
      + 'newborn stars in ordinary light.',
    color: '#ff8a6b',
  },
};

// Equatorial RA/Dec (degrees) -> unit vector in the app's frame
// (ecliptic plane = XZ, ecliptic north = +Y, vernal equinox = +X).
export function radecToScene(raDeg, decDeg, out = new THREE.Vector3()) {
  const a = raDeg * DEG, d = decDeg * DEG;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return out.set(x, ze, -ye);
}

// North and east directions on the sky at a position, in the app's frame.
function skyAxes(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  const toScene = (x, y, z) => {
    const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
    const ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
    return new THREE.Vector3(x, ze, -ye);
  };
  return {
    east: toScene(-Math.sin(a), Math.cos(a), 0),
    north: toScene(-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)),
  };
}

// The image is a north-up, east-left tangent-plane grid centred on (ra, dec),
// exactly as seen from Earth. Returns the panel's centre and corners in scene units.
export function panelGeometry(scene) {
  const centre = radecToScene(scene.ra, scene.dec).multiplyScalar(SKY_RADIUS);
  const { east, north } = skyAxes(scene.ra, scene.dec);
  const half = Math.tan((scene.size_deg * DEG) / 2) * SKY_RADIUS;
  const corner = (e, n) => centre.clone().addScaledVector(east, e * half).addScaledVector(north, n * half);
  return {
    centre,
    north: north.clone().normalize(),
    width: half * 2,
    // u runs east -> west (image left -> right), v runs south -> north
    tl: corner(1, 1), tr: corner(-1, 1), bl: corner(1, -1), br: corner(-1, -1),
  };
}

const fmtRA = (deg) => {
  const h = deg / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
};
const fmtDec = (deg) => {
  const s = deg < 0 ? '−' : '+', a = Math.abs(deg), dd = Math.floor(a), mm = Math.round((a - dd) * 60);
  return `${s}${dd}° ${String(mm).padStart(2, '0')}′`;
};

// Light-years, rounded to two significant figures (these are estimates).
function fmtLy(ly) {
  const sig = (x) => Number(x.toPrecision(2)).toLocaleString('en-US');
  if (ly >= 1e9) return `≈ ${sig(ly / 1e9)} billion light-years`;
  if (ly >= 1e6) return `≈ ${sig(ly / 1e6)} million light-years`;
  return `≈ ${sig(ly)} light-years`;
}

// Distance from Earth: a curated value, else what spherex_scene.py found
// (SIMBAD measurements, parallax or redshift), else an honest "unknown".
function distanceFact(known, scene) {
  if (known.distance) return known.distance;
  const d = scene.distance;
  if (d && d.ly > 0) return ['Distance from Earth', fmtLy(d.ly), d.note];
  if (scene.category === 'Sky fields') {
    return ['Distance from Earth', 'Varies', 'a patch of sky holding stars at many different distances'];
  }
  return ['Distance from Earth', 'Unknown', 'no distance measurement found for this object yet'];
}

const KIND_LABEL ={ hot: 'hot / starlight', mid: 'cool giant or reddened', dusty: 'dusty / embedded', flat: 'flat spectrum' };

// Turn one exported scene.json into the data the app's info card and rail use.
function describe(slug, scene) {
  const known = KNOWN[slug] || {};
  const base = `nebula/${slug}/`;
  const dates = scene.layers.map((l) => l.date).filter(Boolean).sort();
  const kinds = {};
  for (const s of scene.sources || []) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const moonFrac = scene.field_arcmin / 31; // the full Moon is about 31′ across
  const facts = [
    distanceFact(known, scene),
    // RA/Dec: the sky's own longitude and latitude, fixed to the stars.
    ['Sky position', `RA ${fmtRA(scene.ra)}`, `Dec ${fmtDec(scene.dec)} · its address on the sky, like longitude and latitude`],
    // How much sky the picture covers, in arcminutes (1′ = 1/60 of a degree).
    ['Field of view', `${scene.field_arcmin}′ × ${scene.field_arcmin}′`,
      `how much sky this image covers${moonFrac < 1 ? `: about ${Math.round(moonFrac * 100)}% of the full Moon's width` : ''}`],
  ];
  const more = [
    ['Wavelengths', '0.75 – 5.0 µm', 'near- to mid-infrared'],
    ['SPHEREx exposures', `${scene.layers.length}`, 'one per detector'],
    ...(dates.length ? [['Observed', dates[0].slice(0, 10), dates.length > 1 ? `to ${dates[dates.length - 1].slice(0, 10)}` : '']] : []),
    ['Bright sources found', `${(scene.sources || []).length}`,
      Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${KIND_LABEL[k] || k}`).join(', ')],
  ];
  return {
    name: scene.name,
    slug,
    type: known.type || scene.type_label || 'SPHEREx infrared field',
    // Rail section: set by spherex_scene.py from the object's SIMBAD type.
    category: scene.category || 'Other',
    color: known.color || '#9fb7ff',
    description: known.description
      || 'A patch of sky imaged by NASA\'s SPHEREx telescope in infrared light. The picture combines its six '
      + 'detectors: blue is short-wavelength starlight, red is warm dust.',
    facts,
    more,
    thumb: base + scene.composite,
    composite: base + scene.composite,
    layers: scene.layers.map((l) => ({ ...l, url: base + l.file })),
    landmarks: scene.landmarks || [],
    scene,
  };
}

// Fetch JSON, retrying a dropped connection (e.g. while the exporter rewrites the file).
async function getJSON(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw Object.assign(new Error(`${url}: HTTP ${r.status}`), { fatal: r.status === 404 });
      return await r.json();
    } catch (e) {
      if (e.fatal || i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 300 * i));
    }
  }
}

// Load one exported target (e.g. right after a live fetch finishes).
export async function loadTarget(slug) {
  return describe(slug, await getJSON(`nebula/${slug}/scene.json`));
}

// Load every exported target. Missing or broken exports are skipped, never fatal.
export async function loadDeepSky() {
  let targets = [];
  try { targets = await getJSON('nebula/targets.json'); } catch { return []; }
  const loaded = await Promise.all(targets.map((t) => loadTarget(t.slug).catch((e) => {
    console.warn(`Skipping SPHEREx target ${t.slug}:`, e.message);
    return null;
  })));
  return loaded.filter(Boolean);
}
