import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SUN, PLANETS, MOON } from './data.js';
import { planetTexture, sunTexture, glowTexture, ringTexture } from './textures.js';
import {
  DEG, J2000_MS, AU_KM, periodDays, positionAt, positionFromE, positionAtMeanAnomaly, orbitalSpeed,
} from './orbits.js';
import { initLiquidGlass } from './glass.js';
import { loadDeepSky, loadTarget, panelGeometry } from './deepsky.js';
import { startTour, tourSeen, tourActive } from './tour.js';
import { initBlink, openBlink, closeBlink } from './blink.js';

// ---------------------------------------------------------------- state
const SPEEDS = [
  { label: 'real time', days: 1 / 86400 },
  { label: '1 hour/s', days: 1 / 24 },
  { label: '1 day/s', days: 1 },
  { label: '10 days/s', days: 10 },
  { label: '1 month/s', days: 30.44 },
  { label: '100 days/s', days: 100 },
  { label: '1 year/s', days: 365.25 },
  { label: '5 years/s', days: 1826.25 },
];

const nowDays = () => (Date.now() - J2000_MS) / 864e5;

const state = {
  mode: '3d',
  fov: 50,
  days: nowDays(),
  speedIdx: 3,
  direction: 1,
  playing: true,
  scale: 'compressed',
  sizeMul: 1,
  showOrbits: true,
  showTrails: false,
  showLabels: true,
  showSweep: false,
  focus: 'Sun',
};

const SUN_RADIUS = 7;
const AU_UNITS = 60; // scene units per AU at true scale
const ORTHO_BASE = 640; // world units visible vertically in 2D at 60° "field of view"

// Map a heliocentric distance (AU) to scene units.
function sceneDistance(rAu) {
  return state.scale === 'true' ? rAu * AU_UNITS : 14 + 30 * Math.pow(rAu, 0.6);
}

// Ecliptic (AU) -> scene coordinates. Ecliptic plane = XZ, ecliptic north = +Y.
// The compressed view shrinks each orbit as a whole (by its semi-major axis `a`),
// so every orbit keeps its true elliptical shape with the Sun at one focus.
function toScene(v, a, out = new THREE.Vector3()) {
  const r = Math.hypot(v.x, v.y, v.z);
  const s = state.scale === 'true' || !a ? sceneDistance(r) / r : sceneDistance(a) / a;
  return out.set(v.x * s, v.z * s, -v.y * s);
}

const bodyRadius = (km) => state.sizeMul * Math.sqrt(km / 6371);

// ---------------------------------------------------------------- renderer
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();

// Two cameras: perspective for 3D, orthographic top-down for 2D.
const persp = new THREE.PerspectiveCamera(state.fov, window.innerWidth / window.innerHeight, 0.01, 60000);
persp.position.set(0, 150, 240);
const START_DIR = persp.position.clone().normalize(); // the opening camera angle, for Reset

const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60000);
ortho.up.set(0, 0, -1); // screen-up = ecliptic +Y, so planets move counter-clockwise
ortho.position.set(0, 10000, 0);

function updateOrthoFrustum() {
  const h = (ORTHO_BASE * state.fov) / 60;
  const a = window.innerWidth / window.innerHeight;
  ortho.left = (-h * a) / 2;
  ortho.right = (h * a) / 2;
  ortho.top = h / 2;
  ortho.bottom = -h / 2;
  ortho.updateProjectionMatrix();
}
updateOrthoFrustum();

const controls3 = new OrbitControls(persp, renderer.domElement);
controls3.enableDamping = true;
controls3.dampingFactor = 0.08;
controls3.minDistance = 0.5;
controls3.maxDistance = 8000;

const controls2 = new OrbitControls(ortho, renderer.domElement);
controls2.enableRotate = false;
controls2.enableDamping = true;
controls2.screenSpacePanning = true;
controls2.zoomSpeed = 2.5;
controls2.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls2.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
controls2.minZoom = 0.05;
controls2.maxZoom = 600;
controls2.enabled = false;

const camera = () => (state.mode === '3d' ? persp : ortho);
const controls = () => (state.mode === '3d' ? controls3 : controls2);

// ---------------------------------------------------------------- background stars
{
  const n = 7000, R = 25000;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([R * s * Math.cos(t), R * u, R * s * Math.sin(t)], i * 3);
    const b = 0.45 + Math.random() * 0.55, warm = Math.random();
    col.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1 - 0.15 * warm)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
}

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0xffffff, 0.07));
const sunLight = new THREE.PointLight(0xffffff, 3.4, 0, 0);
scene.add(sunLight);

// ---------------------------------------------------------------- bodies
const sphereGeo = new THREE.SphereGeometry(1, 64, 32);
const bodies = []; // every clickable body
const byName = new Map();
const pickables = [];

function makeLabel(text, name) {
  const div = document.createElement('div');
  div.className = 'label';
  div.textContent = text;
  div.addEventListener('pointerdown', (e) => e.stopPropagation());
  div.addEventListener('click', () => focusOn(name));
  return new CSS2DObject(div);
}

function register(body) {
  bodies.push(body);
  byName.set(body.data.name, body);
  body.mesh.userData.name = body.data.name;
  pickables.push(body.mesh);
}

// Sun
const sunBody = (() => {
  const group = new THREE.Group();
  scene.add(group);
  const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ map: sunTexture() }));
  mesh.scale.setScalar(SUN_RADIUS);
  group.add(mesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glow.scale.setScalar(SUN_RADIUS * 7);
  group.add(glow);
  const label = makeLabel('Sun', 'Sun');
  label.position.set(0, SUN_RADIUS * 1.15, 0);
  group.add(label);
  const body = { data: SUN, kind: 'sun', group, mesh, label, radius: () => SUN_RADIUS };
  register(body);
  return body;
})();

// Planets
for (const p of PLANETS) {
  const group = new THREE.Group();
  scene.add(group);
  const tilt = new THREE.Group();
  tilt.rotation.z = p.tilt * DEG;
  group.add(tilt);
  const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ map: planetTexture(p.texture), roughness: 1, metalness: 0 }));
  tilt.add(mesh);

  if (p.rings) {
    const inner = 1.24, outer = 2.27;
    const rg = new THREE.RingGeometry(inner, outer, 128, 1);
    const uv = rg.attributes.uv, posAttr = rg.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(posAttr.getX(i), posAttr.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
      map: ringTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    mesh.add(ring);
  }

  const label = makeLabel(p.name, p.name);
  group.add(label);

  // Orbit path
  const orbitLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.38 }),
  );
  scene.add(orbitLine);

  // Motion trail (fades to black with additive blending)
  const TRAIL_N = 700;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  trail.frustumCulled = false;
  scene.add(trail);

  const body = {
    data: p, kind: 'planet', group, mesh, label, orbitLine, trail,
    trailPts: [], trailMax: TRAIL_N, colorRgb: new THREE.Color(p.color),
    radius: () => bodyRadius(p.radiusKm),
  };
  register(body);
}

// Moon (child of Earth's group; its distance is exaggerated to stay visible)
const earth = byName.get('Earth');
const moonBody = (() => {
  const group = new THREE.Group();
  earth.group.add(group);
  const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ map: planetTexture(MOON.texture), roughness: 1 }));
  group.add(mesh);
  const label = makeLabel('Moon', 'Moon');
  group.add(label);
  const body = { data: MOON, kind: 'moon', group, mesh, label, radius: () => bodyRadius(MOON.radiusKm) };
  register(body);
  return body;
})();

// ---------------------------------------------------------------- deep-sky objects (SPHEREx)
// Each exported target becomes a glowing marker on the sky. Up close it is the
// SPHEREx infrared image itself, placed at its true position and angular size,
// north up and east left, exactly as it appears from Earth.
const deepBodies = [];
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function loadTex(url) {
  if (!texCache.has(url)) {
    const t = texLoader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texCache.set(url, t);
  }
  return texCache.get(url);
}
const markerTex = glowTexture();
// Build one target's marker, image panel, label and landmark pins. Runs at start-up
// for every exported target, and again whenever a live search adds a new one.
function createDeepBody(d) {
  {
    const g = panelGeometry(d.scene);
    const group = new THREE.Group();
    group.position.copy(g.centre);
    scene.add(group);
    const local = (v) => v.clone().sub(g.centre);
    const [bl, br, tr, tl] = [g.bl, g.br, g.tr, g.tl].map(local);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([bl, br, tr, tl].flatMap((v) => [v.x, v.y, v.z]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    // Additive: the black sky in the image stays transparent against space.
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: loadTex(d.composite), side: THREE.DoubleSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(mesh);

    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: markerTex, color: d.color, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, sizeAttenuation: false,
    }));
    marker.scale.setScalar(0.06);
    marker.userData.name = d.name;
    group.add(marker);

    const label = makeLabel(d.name, d.name);
    label.element.classList.add('deep');
    label.position.copy(tl).add(tr).multiplyScalar(0.5);
    group.add(label);

    // Named landmarks (e.g. the Trapezium), pinned onto the image.
    const pins = d.landmarks.map((m) => {
      const u = (m.col + 0.5) / d.scene.n, v = 1 - (m.row + 0.5) / d.scene.n;
      const div = document.createElement('div');
      div.className = 'pin';
      div.textContent = m.name;
      div.title = m.desc;
      const pin = new CSS2DObject(div);
      pin.center.set(0, 0.5); // anchor the left edge (the dot) on the spot, not the text's middle
      pin.position.copy(bl).addScaledVector(br.clone().sub(bl), u).addScaledVector(tl.clone().sub(bl), v);
      pin.visible = false;
      group.add(pin);
      return pin;
    });

    const body = { data: d, kind: 'deepsky', group, mesh, marker, label, pins, north: g.north, width: g.width, radius: () => g.width / 2 };
    label.visible = state.showLabels;
    register(body);
    pickables.push(marker);
    deepBodies.push(body);
    return body;
  }
}
for (const d of await loadDeepSky()) createDeepBody(d);

// Markers fade out as you arrive, so the image itself takes over.
function updateDeepSky() {
  for (const b of deepBodies) {
    const d = camera().position.distanceTo(b.group.position);
    const far = state.mode === '3d' ? THREE.MathUtils.clamp((d / b.width - 3) / 8, 0, 1) : 1;
    b.marker.material.opacity = far;
    b.marker.visible = far > 0.01;
    const show = state.showLabels && state.focus === b.data.name && far < 0.2 && !fly;
    for (const p of b.pins) p.visible = show;
  }
}

// Kepler's 2nd law sectors
const sweepMesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
);
scene.add(sweepMesh);

// ---------------------------------------------------------------- geometry builders
function buildOrbitLines() {
  for (const b of bodies) {
    if (b.kind !== 'planet') continue;
    const pts = [];
    const N = 720;
    for (let k = 0; k <= N; k++) pts.push(toScene(positionFromE(b.data, (k / N) * Math.PI * 2), b.data.a));
    b.orbitLine.geometry.dispose();
    b.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
}

function buildSweep() {
  const b = byName.get(state.focus);
  sweepMesh.visible = state.showSweep && b?.kind === 'planet';
  if (!sweepMesh.visible) return;
  const SECTORS = 12, STEPS = 24;
  const c1 = b.colorRgb.clone().lerp(new THREE.Color('#ffffff'), 0.2);
  const c2 = new THREE.Color('#3a4a7a');
  const pos = [], col = [];
  for (let s = 0; s < SECTORS; s++) {
    const c = s % 2 ? c2 : c1;
    for (let k = 0; k < STEPS; k++) {
      const m0 = ((s + k / STEPS) / SECTORS) * Math.PI * 2;
      const m1 = ((s + (k + 1) / STEPS) / SECTORS) * Math.PI * 2;
      const a = toScene(positionAtMeanAnomaly(b.data, m0), b.data.a);
      const d = toScene(positionAtMeanAnomaly(b.data, m1), b.data.a);
      pos.push(0, 0, 0, a.x, a.y, a.z, d.x, d.y, d.z);
      for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sweepMesh.geometry.dispose();
  sweepMesh.geometry = g;
}

function applySizes() {
  for (const b of bodies) {
    if (b.kind === 'sun' || b.kind === 'deepsky') continue;
    const r = b.radius();
    b.mesh.scale.setScalar(r);
    b.label.position.set(0, r * 1.15, 0);
  }
}

function clearTrails() {
  for (const b of bodies) if (b.trailPts) { b.trailPts.length = 0; b.trail.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------- per-frame updates
const tmp = new THREE.Vector3();

function updatePositions() {
  for (const b of bodies) {
    if (b.kind !== 'planet') continue;
    b.helio = positionAt(b.data, state.days);
    toScene(b.helio, b.data.a, b.group.position);
  }
  // Moon: simple circular orbit, inclined 5°, around Earth.
  const L = (MOON.L0 + (360 / MOON.periodDays) * state.days) * DEG;
  const dist = earth.radius() * 2.2 + moonBody.radius() + 1.2;
  const inc = MOON.inclination * DEG;
  moonBody.group.position.set(Math.cos(L) * dist, Math.sin(L) * Math.sin(inc) * dist, -Math.sin(L) * Math.cos(inc) * dist);
}

function spinBodies(dDays) {
  for (const b of bodies) {
    if (b.kind === 'moon' || b.kind === 'deepsky') continue;
    const rate = (2 * Math.PI * dDays * 24) / b.data.dayHours;
    b.mesh.rotation.y += THREE.MathUtils.clamp(rate, -0.06, 0.06); // capped so fast time doesn't strobe
  }
  // The Moon is tidally locked: it keeps one face towards Earth.
  moonBody.mesh.rotation.y = Math.atan2(-moonBody.group.position.z, moonBody.group.position.x) + Math.PI;
}

function updateTrails() {
  for (const b of bodies) {
    if (b.kind !== 'planet') continue;
    b.trail.visible = state.showTrails;
    if (!state.showTrails) continue;
    const pts = b.trailPts;
    const p = b.group.position;
    const last = pts[pts.length - 1];
    const minStep = state.scale === 'true' ? 0.15 : 0.12;
    if (!last || last.distanceTo(p) > minStep) {
      pts.push(p.clone());
      if (pts.length > b.trailMax) pts.shift();
    }
    const posA = b.trail.geometry.attributes.position, colA = b.trail.geometry.attributes.color;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      posA.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      const f = (i / Math.max(1, n - 1)) ** 1.5;
      colA.setXYZ(i, b.colorRgb.r * f, b.colorRgb.g * f, b.colorRgb.b * f);
    }
    posA.needsUpdate = true;
    colA.needsUpdate = true;
    b.trail.geometry.setDrawRange(0, n);
  }
}

function worldPos(b, out = new THREE.Vector3()) {
  if (b.kind === 'moon') return out.copy(earth.group.position).add(moonBody.group.position);
  return out.copy(b.group.position);
}

// ---------------------------------------------------------------- camera focus / transitions
let fly = null;
const prevFocusPos = new THREE.Vector3();

// Frame the whole system (out to Neptune) for the current field of view.
const systemExtent = () => sceneDistance(31);
function overviewDistance() {
  return (systemExtent() / Math.tan((state.fov * DEG) / 2)) * 0.85;
}
function overviewZoom() {
  return ((ORTHO_BASE * state.fov) / 60) / (2.3 * systemExtent());
}

function focusDistance(b) {
  if (!b || b.kind === 'sun') return overviewDistance();
  // Deep-sky image: close enough that it fills the height of the view.
  if (b.kind === 'deepsky') return (b.width / 2 / Math.tan((state.fov * DEG) / 2)) * 1.12;
  return Math.max(4, b.radius() * 9 + (b.data.rings ? b.radius() * 4 : 0));
}

// Up close, a deep-sky image only tilts a little: it is a flat picture of the
// sky, so you should never see it edge-on or from behind.
function setOrbitLimits(b) {
  const c = controls3;
  if (b?.kind === 'deepsky') {
    const off = persp.position.clone().sub(c.target);
    const theta = Math.atan2(off.x, off.z);
    const phi = Math.acos(THREE.MathUtils.clamp(off.y / off.length(), -1, 1));
    const span = 0.3; // about 17° either way
    c.minAzimuthAngle = theta - span;
    c.maxAzimuthAngle = theta + span;
    c.minPolarAngle = Math.max(0.01, phi - span);
    c.maxPolarAngle = Math.min(Math.PI - 0.01, phi + span);
    c.minDistance = b.width * 0.12;
    c.maxDistance = b.width * 6;
  } else {
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.minDistance = 0.5;
    c.maxDistance = 8000;
  }
}

function startFly({ toDir = null, toDist = null } = {}) {
  const ctrl = controls(), cam = camera();
  const b = byName.get(state.focus);
  setOrbitLimits(null);
  // Arrive at a deep-sky image from the Sun's side: you see it as it looks from Earth.
  if (!toDir && b?.kind === 'deepsky') toDir = b.group.position.clone().negate();
  const longHaul = b?.kind === 'deepsky' || ctrl.target.length() > 1000;
  const offset = cam.position.clone().sub(ctrl.target);
  fly = {
    t0: performance.now(),
    dur: longHaul ? 2600 : 1300,
    fromTarget: ctrl.target.clone(),
    fromDir: offset.clone().normalize(),
    toDir: toDir ? toDir.clone().normalize() : offset.clone().normalize(),
    turn: new THREE.Quaternion(), // set below: the rotation from fromDir to toDir
    fromDist: offset.length(),
    toDist: toDist ?? (b ? focusDistance(b) : offset.length()),
    // Roll so celestial north is up at a SPHEREx image (the planets keep ecliptic north up).
    fromUp: persp.up.clone(),
    toUp: b?.kind === 'deepsky' ? b.north.clone() : new THREE.Vector3(0, 1, 0),
    fromZoom: ortho.zoom,
    toZoom: b ? (b.kind === 'sun' ? overviewZoom() : ((ORTHO_BASE * state.fov) / 60) / (focusDistance(b) * 3)) : ortho.zoom,
  };
  fly.turn.setFromUnitVectors(fly.fromDir, fly.toDir);
}
const flyTurn = new THREE.Quaternion();

function focusOn(name, { showCard = true } = {}) {
  state.focus = name;
  setOrbitLimits(null);
  if (byName.get(name)?.kind === 'deepsky' && state.mode === '2d') setMode('3d'); // the 2D map is the ecliptic plane only
  for (const chip of ui.rail.querySelectorAll('.body-chip')) chip.setAttribute('aria-current', String(chip.dataset.focus === name));
  revealInRail(name);
  moveLens();
  for (const b of bodies) b.label.element.classList.toggle('selected', b.data.name === name);
  updateMoonLabel();
  for (const b of bodies) if (b.orbitLine) b.orbitLine.material.opacity = b.data.name === name ? 0.9 : 0.38;
  buildSweep();
  if (showCard) showInfo(name);
  if (name !== 'free') startFly();
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateCamera(now) {
  const ctrl = controls(), cam = camera();
  const b = byName.get(state.focus);
  const focusPos = b ? worldPos(b, tmp) : null;

  if (fly) {
    const k = ease(Math.min(1, (now - fly.t0) / fly.dur));
    const target = focusPos ? fly.fromTarget.clone().lerp(focusPos, k) : fly.fromTarget;
    ctrl.target.copy(target);
    if (state.mode === '3d') {
      // Swing round at an even angular speed (a straight lerp of the two directions
      // speeds up mid-turn and can pass through the target). Zoom in log space, so
      // going from the whole system down to one planet feels evenly paced instead
      // of hanging far out and then rushing in at the end.
      const dir = fly.fromDir.clone().applyQuaternion(flyTurn.identity().slerp(fly.turn, k));
      const dist = Math.exp(THREE.MathUtils.lerp(Math.log(fly.fromDist), Math.log(fly.toDist), k));
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.up.copy(fly.fromUp).lerp(fly.toUp, k).normalize();
    } else {
      cam.position.set(target.x, target.y + 10000, target.z);
      cam.zoom = Math.exp(THREE.MathUtils.lerp(Math.log(fly.fromZoom), Math.log(fly.toZoom), k));
      cam.updateProjectionMatrix();
    }
    if (k >= 1) {
      fly = null;
      if (state.mode === '3d') setOrbitLimits(b);
    }
  } else if (focusPos) {
    // Follow the focused body as it moves along its orbit.
    const delta = focusPos.clone().sub(ctrl.target);
    ctrl.target.add(delta);
    cam.position.add(delta);
  }
  ctrl.update();
}

// ---------------------------------------------------------------- info card
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function formatDuration(days) {
  const a = Math.abs(days);
  if (a >= 365.25 * 2) return `${fmt(a / 365.25, 1)} years`;
  if (a >= 2) return `${fmt(a, 1)} days`;
  return `${fmt(a * 24, 1)} hours`;
}

function showInfo(name) {
  const b = byName.get(name);
  // Already open on another body: fade the new contents in rather than snapping.
  const swapping = b && !ui.info.hidden && ui.infoName.textContent !== b.data.name;
  ui.info.hidden = !b;
  if (!b) return;
  if (swapping) { ui.info.classList.remove('swap'); void ui.info.offsetWidth; ui.info.classList.add('swap'); }
  ui.infoName.textContent = b.data.name;
  ui.infoType.textContent = b.data.type;
  ui.infoSwatch.style.setProperty('--c', b.data.color);
  ui.infoSwatch.style.background = b.kind === 'deepsky' ? `url("${b.data.thumb}") center / cover` : '';
  ui.infoDesc.textContent = b.data.description;
  $('blinkBtn').hidden = b.kind !== 'deepsky';
  ui.infoDots.hidden = b.kind !== 'deepsky';
  ui.infoImages.hidden = b.kind !== 'deepsky';
  if (b.kind === 'deepsky') buildImages(b);
  if (b.kind === 'deepsky') {
    // How many of each colour the exporter found in this image.
    const counts = {};
    for (const s of b.data.scene.sources || []) counts[s.kind] = (counts[s.kind] || 0) + 1;
    for (const n of ui.infoDots.querySelectorAll('.key-n')) {
      const c = counts[n.dataset.kind] || 0;
      n.textContent = `· ${c} bright one${c === 1 ? '' : 's'} found here`;
    }
  }
  updateInfo();
}

// ---- The SPHEREx images in the card: the colour composite, then each of the six
// detectors' raw (greyscale) exposures, shortest wavelength first.
const COMPOSITE_NOTE = 'All six detectors combined. Blue is 0.75–1.6 µm (starlight), green 1.6–3.8 µm, red 3.8–5 µm (warm dust).';
function buildImages(b) {
  const opts = [
    { thumb: 'Colour', name: 'Colour composite · 0.75–5 µm', note: COMPOSITE_NOTE, url: b.data.composite },
    ...b.data.layers.map((l) => ({
      thumb: `${((l.band[0] + l.band[1]) / 2).toFixed(1)}`,
      name: `Detector ${l.det} · ${l.band[0]}–${l.band[1]} µm, raw`,
      note: l.note, url: l.url,
    })),
  ];
  ui.irStrip.replaceChildren(...opts.map((o, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ir-thumb';
    btn.setAttribute('aria-label', o.name);
    const img = document.createElement('img');
    img.src = o.url;
    img.alt = '';
    img.loading = 'lazy';
    btn.append(img, o.thumb);
    btn.addEventListener('click', () => showImage(o, i));
    return btn;
  }));
  showImage(opts[0], 0);
}
function showImage(o, i) {
  const img = ui.irMain;
  if (img.getAttribute('src') !== o.url) {
    img.classList.add('loading');
    img.onload = () => img.classList.remove('loading');
    img.src = o.url;
  }
  img.alt = o.name;
  ui.irName.textContent = o.name;
  ui.irNote.textContent = o.note || '';
  [...ui.irStrip.children].forEach((btn, j) => btn.setAttribute('aria-pressed', String(j === i)));
}

// Rows are [label, value, optional second line].
const distanceRow = (label, au) => [label, `${fmt(au, 3)} AU`, `${fmt((au * AU_KM) / 1e6, 1)} million km`];
const KEY_FACT = /distance|speed|day length|rotation/i;

function updateInfo() {
  const b = byName.get(state.focus);
  if (!b) return;
  const fromEarth = (v) => Math.hypot(v.x - earth.helio.x, v.y - earth.helio.y, v.z - earth.helio.z);
  let key, more;
  if (b.kind === 'deepsky') {
    key = b.data.facts;
    more = b.data.more;
  } else if (b.kind === 'planet') {
    const p = b.data;
    const r = Math.hypot(b.helio.x, b.helio.y, b.helio.z);
    key = [
      b === earth
        ? ['Distance from Earth', 'You are here', 'every distance in this app is measured from Earth']
        : distanceRow('Distance from Earth', fromEarth(b.helio)),
      distanceRow('Distance from Sun', r),
      ['Orbital speed', `${fmt(orbitalSpeed(p, r), 2)} km/s`],
      ['Day length', formatDuration(Math.abs(p.dayHours) / 24), p.dayHours < 0 ? 'Spins backwards' : ''],
    ];
    more = [
      ['Orbital period', formatDuration(periodDays(p))],
      ['Perihelion / aphelion', `${fmt(p.a * (1 - p.e), 2)} / ${fmt(p.a * (1 + p.e), 2)} AU`],
      ['Eccentricity', fmt(p.e, 4)],
      ['Inclination', `${fmt(Math.abs(p.i) < 0.005 ? 0 : p.i, 2)}°`],
      ['Radius', `${fmt(p.radiusKm)} km`],
      ['Axial tilt', `${fmt(p.tilt, 1)}°`],
      ['Known moons', p.moons],
    ];
  } else {
    const facts = b.data.facts;
    key = facts.filter(([k]) => KEY_FACT.test(k));
    if (b.kind === 'sun') key.unshift(distanceRow('Distance from Earth', Math.hypot(earth.helio.x, earth.helio.y, earth.helio.z)));
    more = facts.filter(([k]) => !KEY_FACT.test(k));
  }
  renderFacts(ui.infoKey, key);
  renderFacts(ui.infoFacts, more);
}

// Called several times a second while time runs. If the rows are the same as
// last time, only their text is updated: rebuilding them would reset any text
// the user is selecting and re-lay out the card on every tick.
function renderFacts(dl, rows) {
  const shape = rows.map(([k, , sub]) => `${k}${sub ? '+' : ''}`).join('|');
  if (dl.dataset.shape === shape) {
    dl.querySelectorAll('dd').forEach((dd, i) => {
      const [, v, sub] = rows[i];
      if (dd.firstChild.nodeValue !== String(v)) dd.firstChild.nodeValue = v;
      if (sub && dd.lastChild.textContent !== sub) dd.lastChild.textContent = sub;
    });
    return;
  }
  dl.dataset.shape = shape;
  dl.replaceChildren(...rows.flatMap(([k, v, sub]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.append(String(v)); // always a text node, even when empty
    if (sub) {
      const s = document.createElement('span');
      s.className = 'sub';
      s.textContent = sub;
      dd.append(s);
    }
    return [dt, dd];
  }));
}

// ---------------------------------------------------------------- UI wiring
const $ = (id) => document.getElementById(id);
const ui = {
  fov: $('fov'), fovVal: $('fovVal'), fovLabel: $('fovLabel'),
  rail: $('planetRail'), lens: $('railLens'), presets: $('presets'), hint: $('hint'),
  modeSeg: $('modeSeg'), scaleSeg: $('scaleSeg'),
  date: $('date'), status: $('status'),
  panel: $('displayPanel'), displayBtn: $('displayBtn'), transport: document.querySelector('.transport'),
  reverse: $('reverse'), play: $('play'), today: $('today'),
  speed: $('speed'), speedVal: $('speedVal'),
  showOrbits: $('showOrbits'), showTrails: $('showTrails'), showLabels: $('showLabels'), showSweep: $('showSweep'),
  sweepNote: $('sweepNote'), size: $('size'), sizeVal: $('sizeVal'),
  info: $('info'), infoName: $('infoName'), infoType: $('infoType'), infoSwatch: $('infoSwatch'),
  infoFacts: $('infoFacts'), infoKey: $('infoKey'), infoDesc: $('infoDesc'),
  infoDots: $('infoDots'), infoImages: $('infoImages'),
  irMain: $('irMain'), irName: $('irName'), irNote: $('irNote'), irStrip: $('irStrip'),
};

// ---- Display panel (opens above the time bar)
function setPanel(open) {
  ui.panel.classList.toggle('open', open);
  ui.displayBtn.setAttribute('aria-expanded', String(open));
}
ui.displayBtn.addEventListener('click', () => setPanel(!ui.panel.classList.contains('open')));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setPanel(false);
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); togglePlay(); }
});
// Keep the panel's right edge aligned with the time bar.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bar-w', `${ui.transport.offsetWidth}px`);
}).observe(ui.transport);

// ---- Body rail: collapsible sections. The solar system first (outward from the
// Sun, the Moon under Earth), then SPHEREx targets grouped by what they are.
const SECTION_ORDER = ['Solar system', 'Nebulae', 'Galaxies', 'Star clusters', 'Stars', 'Sky fields', 'Other'];
const RAIL_KEY = 'ssx-rail-collapsed';
const collapsedSections = new Set((() => {
  try { return JSON.parse(localStorage.getItem(RAIL_KEY) || '[]'); } catch { return []; }
})());
function saveCollapsed() {
  try { localStorage.setItem(RAIL_KEY, JSON.stringify([...collapsedSections])); } catch { /* private mode */ }
}

const KIND_TAG = { sun: 'Star', planet: 'Planet', moon: 'Moon' };

function makeChip(b) {
  const chip = document.createElement('button');
  chip.className = `body-chip${b.kind === 'moon' ? ' moon' : ''}${b.kind === 'deepsky' ? ' deep' : ''}`;
  chip.dataset.focus = b.data.name;
  chip.dataset.sub = b.kind === 'deepsky' ? b.data.type || '' : KIND_TAG[b.kind] || '';
  chip.setAttribute('aria-label', b.data.name);
  const orb = document.createElement('span');
  orb.className = 'planet-orb';
  orb.style.setProperty('--c', b.data.color);
  if (b.kind === 'deepsky') orb.style.background = `url("${b.data.thumb}") center / cover`; // the infrared image itself
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = b.data.name;
  chip.append(orb, name);
  return chip;
}

function buildRail() {
  const groups = new Map([['Solar system',
    ['Sun', ...PLANETS.flatMap((p) => (p.name === 'Earth' ? ['Earth', 'Moon'] : [p.name]))].map((n) => byName.get(n))]]);
  for (const b of deepBodies) {
    const cat = b.data.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(b);
  }
  const rank = (c) => (SECTION_ORDER.includes(c) ? SECTION_ORDER.indexOf(c) : SECTION_ORDER.length);
  const nodes = [ui.lens];
  for (const [cat, list] of [...groups].sort((a, b) => rank(a[0]) - rank(b[0]))) {
    const sec = document.createElement('section');
    sec.className = 'rail-section';
    sec.dataset.cat = cat;
    const open = !collapsedSections.has(cat);
    if (!open) sec.dataset.collapsed = '';
    const head = document.createElement('button');
    head.className = 'rail-head';
    head.setAttribute('aria-expanded', String(open));
    head.setAttribute('aria-label', `${cat} (${list.length})`);
    head.innerHTML = '<span class="rh-label"></span><span class="rh-count"></span>'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    head.querySelector('.rh-label').textContent = cat;
    head.querySelector('.rh-count').textContent = list.length;
    const body = document.createElement('div');
    body.className = 'rail-body';
    const inner = document.createElement('div');
    inner.className = 'rail-inner';
    inner.append(...list.map(makeChip));
    body.append(inner);
    sec.append(head, body);
    nodes.push(sec);
  }
  const free = document.createElement('button');
  free.className = 'body-chip free';
  free.dataset.focus = 'free';
  free.dataset.sub = 'W A S D to move';
  free.setAttribute('aria-label', 'Free camera');
  free.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/></svg><span class="name">Free camera</span>';
  nodes.push(free);
  ui.rail.replaceChildren(...nodes);
  for (const chip of ui.rail.querySelectorAll('.body-chip')) chip.setAttribute('aria-current', String(chip.dataset.focus === state.focus));
  moveLens();
  updateRailFade();
}

function setSectionOpen(sec, open) {
  if (open) { delete sec.dataset.collapsed; collapsedSections.delete(sec.dataset.cat); } else {
    sec.dataset.collapsed = '';
    collapsedSections.add(sec.dataset.cat);
  }
  const head = sec.querySelector('.rail-head');
  head.setAttribute('aria-expanded', String(open));
  saveCollapsed();
  if (railTip.classList.contains('show') && head.matches(':hover, :focus-visible')) showRailTip(head);
  trackLens();
}

// Selecting something inside a collapsed section opens that section.
function revealInRail(name) {
  const sec = ui.rail.querySelector(`.body-chip[data-focus="${CSS.escape(name)}"]`)?.closest('.rail-section');
  if (sec && sec.dataset.collapsed !== undefined) setSectionOpen(sec, true);
}

ui.rail.addEventListener('click', (e) => {
  const head = e.target.closest('.rail-head');
  if (head) return setSectionOpen(head.parentElement, head.getAttribute('aria-expanded') !== 'true');
  const chip = e.target.closest('.body-chip');
  if (chip) focusOn(chip.dataset.focus);
});

// The highlight slides to whichever body is selected.
const isPhone = () => window.innerWidth <= 760;
function moveLens({ reveal = true } = {}) {
  const chip = ui.rail.querySelector('.body-chip[aria-current="true"]');
  // hidden when nothing is selected, or the selection is inside a collapsed section
  const folded = !isPhone() && chip?.closest('.rail-section[data-collapsed]'); // phones show every section
  if (!chip || folded) { ui.lens.dataset.hidden = ''; return; }
  delete ui.lens.dataset.hidden;
  ui.lens.style.width = `${chip.offsetWidth}px`;
  ui.lens.style.height = `${chip.offsetHeight}px`;
  ui.lens.style.transform = `translate3d(${chip.offsetLeft}px, ${chip.offsetTop}px, 0)`;
  if (reveal) revealChip(chip);
}

// Scroll the rail (never the page) just enough to show the chip.
function revealChip(chip) {
  const list = ui.rail, pad = 28; // keep it clear of the faded edge
  if (isPhone()) {
    const box = list.closest('.rail');
    const l = chip.offsetLeft, r = l + chip.offsetWidth;
    if (l < box.scrollLeft) box.scrollTo({ left: l - pad, behavior: 'smooth' });
    else if (r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: r - box.clientWidth + pad, behavior: 'smooth' });
    return;
  }
  const t = chip.offsetTop, b = t + chip.offsetHeight;
  if (t < list.scrollTop + pad) list.scrollTo({ top: t - pad, behavior: 'smooth' });
  else if (b > list.scrollTop + list.clientHeight - pad) list.scrollTo({ top: b - list.clientHeight + pad, behavior: 'smooth' });
}

// While a section folds, chips below it move every frame: keep the highlight
// glued to its chip until the fold animation ends.
let trackUntil = 0;
function trackLens(ms = 460) {
  const running = performance.now() < trackUntil;
  trackUntil = performance.now() + ms;
  if (running) return;
  ui.lens.classList.add('tracking');
  const step = () => {
    moveLens({ reveal: false });
    updateRailFade();
    if (performance.now() < trackUntil) return requestAnimationFrame(step);
    ui.lens.classList.remove('tracking');
    moveLens();
  };
  requestAnimationFrame(step);
}

// Fade the clipped edge(s) when the list is taller than the rail.
function updateRailFade() {
  const l = ui.rail;
  const more = [];
  if (l.scrollTop > 2) more.push('up');
  if (l.scrollTop + l.clientHeight < l.scrollHeight - 2) more.push('down');
  if (more.length) l.dataset.more = more.join(' '); else delete l.dataset.more;
}
ui.rail.addEventListener('scroll', () => { updateRailFade(); hideRailTip(); }, { passive: true });

// Orb-only rail: a quick name tag beside the hovered or focused orb.
const railTip = document.createElement('div');
railTip.className = 'rail-tip';
railTip.setAttribute('aria-hidden', 'true');
document.body.append(railTip);
const compactRail = matchMedia('(min-width: 761px) and ((max-width: 1100px) or (max-height: 640px))');
const canHover = matchMedia('(hover: hover)');
function showRailTip(el) {
  if (!compactRail.matches) return hideRailTip();
  const head = el.classList.contains('rail-head');
  const name = head ? el.parentElement.dataset.cat : el.getAttribute('aria-label');
  const sub = head ? `${el.querySelector('.rh-count').textContent} · click to ${el.getAttribute('aria-expanded') === 'true' ? 'fold' : 'open'}` : el.dataset.sub;
  railTip.replaceChildren(name);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; railTip.append(s); }
  const r = el.getBoundingClientRect(), rail = ui.rail.closest('.rail').getBoundingClientRect();
  railTip.style.setProperty('--x', `${rail.right + 10}px`);
  railTip.style.setProperty('--y', `${r.top + r.height / 2 - railTip.offsetHeight / 2}px`);
  railTip.classList.add('show');
}
function hideRailTip() { railTip.classList.remove('show'); }
ui.rail.addEventListener('pointerover', (e) => {
  const el = e.target.closest('.body-chip, .rail-head');
  if (el && canHover.matches && e.pointerType !== 'touch') showRailTip(el); else hideRailTip();
});
ui.rail.addEventListener('pointerleave', hideRailTip);
ui.rail.addEventListener('focusin', (e) => {
  const el = e.target.closest('.body-chip, .rail-head');
  if (el?.matches(':focus-visible')) showRailTip(el);
});
ui.rail.addEventListener('focusout', hideRailTip);

// Arrow keys move through the rail; Home/End jump to the ends.
ui.rail.addEventListener('keydown', (e) => {
  const keys = isPhone() ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  if (![...keys, 'Home', 'End'].includes(e.key)) return;
  const items = [...ui.rail.querySelectorAll('.body-chip, .rail-head')]
    .filter((el) => el.offsetParent && !el.closest('.rail-section[data-collapsed] .rail-inner'));
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : Math.max(0, Math.min(items.length - 1, i + (e.key === keys[0] ? -1 : 1)));
  items[j].focus();
  if (items[j].classList.contains('body-chip')) revealChip(items[j]);
});

new ResizeObserver(() => { moveLens({ reveal: false }); updateRailFade(); }).observe(ui.rail);
buildRail();
updateRailFade();

// ---- Segmented controls & range fill
function setSegment(seg, attr, value) {
  const btns = [...seg.querySelectorAll('button')];
  btns.forEach((btn, i) => {
    const on = btn.dataset[attr] === value;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', String(on));
    if (on) seg.dataset.index = i;
  });
}
function paintRange(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}
for (const input of document.querySelectorAll('input[type="range"]')) {
  paintRange(input);
  input.addEventListener('input', () => paintRange(input));
}

function setMode(mode) {
  if (mode === state.mode) return;
  const from = controls();
  state.mode = mode;
  const to = controls();
  to.target.copy(from.target);
  controls3.enabled = mode === '3d';
  controls2.enabled = mode === '2d';
  if (mode === '2d') {
    ortho.position.set(to.target.x, to.target.y + 10000, to.target.z);
  }
  setSegment(ui.modeSeg, 'mode', mode);
  for (const btn of ui.presets.querySelectorAll('button')) btn.disabled = mode === '2d';
  ui.hint.textContent = mode === '3d'
    ? 'Drag to rotate, scroll to zoom, right-drag to pan. W A S D to fly, Q / E down and up, Shift for speed.'
    : 'Drag to pan, scroll to zoom. W A S D to move, Q / E to zoom, Shift for speed.';
  updateFovUi();
  if (state.focus !== 'free') startFly();
}
for (const btn of ui.modeSeg.querySelectorAll('button')) btn.addEventListener('click', () => setMode(btn.dataset.mode));

function updateFovUi() {
  ui.fovLabel.textContent = state.mode === '3d' ? 'Field of view' : 'Visible area';
  ui.fovVal.textContent = `${state.fov}°`;
}
ui.fov.addEventListener('input', () => {
  state.fov = Number(ui.fov.value);
  persp.fov = state.fov;
  persp.updateProjectionMatrix();
  updateOrthoFrustum();
  updateFovUi();
});

const PRESETS = {
  top: new THREE.Vector3(0, 1, 0.002),
  angled: new THREE.Vector3(0, 0.55, 1),
  side: new THREE.Vector3(0, 0.015, 1),
};
for (const btn of ui.presets.querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    const offset = persp.position.clone().sub(controls3.target);
    startFly({ toDir: PRESETS[btn.dataset.preset], toDist: offset.length() });
  });
}

function updateSpeedUi() {
  const speed = (state.direction < 0 ? '−' : '') + SPEEDS[state.speedIdx].label;
  ui.speedVal.textContent = speed;
  ui.status.textContent = !state.playing ? 'Paused' : state.direction < 0 ? 'Running backwards' : 'Running';
  document.body.classList.toggle('paused', !state.playing);
  ui.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  ui.reverse.setAttribute('aria-pressed', String(state.direction < 0));
}
function togglePlay() { state.playing = !state.playing; updateSpeedUi(); }
ui.speed.addEventListener('input', () => { state.speedIdx = Number(ui.speed.value); updateSpeedUi(); });
ui.play.addEventListener('click', togglePlay);
ui.reverse.addEventListener('click', () => { state.direction *= -1; clearTrails(); updateSpeedUi(); });
ui.today.addEventListener('click', () => { state.days = nowDays(); clearTrails(); });

// Reset: back to how the app opens. 3D, centred on the Sun at the opening angle,
// today's date, time running forwards at the default speed.
const START_SPEED = state.speedIdx;
function resetView() {
  setMode('3d');
  state.days = nowDays();
  state.direction = 1;
  state.playing = true;
  state.speedIdx = START_SPEED;
  ui.speed.value = START_SPEED;
  paintRange(ui.speed);
  clearTrails();
  updateSpeedUi();
  focusOn('Sun', { showCard: window.innerWidth > 760 });
  startFly({ toDir: START_DIR });
}
$('resetView').addEventListener('click', resetView);

// ---- Timeline: drag (or click, or use the arrow keys) to any date from 1900 to 2100.
// Time pauses while you drag and carries on from the new date when you let go.
const tl = {
  input: $('timeline'), date: $('tlDate'), today: $('tlToday'), years: $('tlYears'),
  min: (Date.UTC(1900, 0, 1) - J2000_MS) / 864e5, max: (Date.UTC(2101, 0, 1) - J2000_MS) / 864e5,
  width: 0, dragging: false, resume: false, shown: '', x: NaN, half: 0,
};
tl.input.min = tl.min;
tl.input.max = tl.max;
const tlFrac = (days) => Math.min(1, Math.max(0, (days - tl.min) / (tl.max - tl.min)));
const tlX = (days) => 15 + tlFrac(days) * (tl.width - 30); // handle centre; the handle is 30px wide
for (let y = 1900; y <= 2100; y += 25) {
  const s = document.createElement('span');
  s.textContent = y;
  if (y % 100) s.classList.add('minor');
  s.style.left = `${((y - 1900) / 201) * 100}%`;
  tl.years.append(s);
}
new ResizeObserver(() => {
  tl.width = tl.input.offsetWidth;
  tl.x = NaN; // force a redraw at the new width
  tl.today.style.setProperty('--today-x', `${tlX(nowDays())}px`);
}).observe(tl.input);

function setDate(days) {
  state.days = Math.min(tl.max, Math.max(tl.min, days));
  clearTrails();
}
// Keep the handle and its date label on the current date. Runs every frame;
// writes only when the handle has visibly moved or the date text changed.
function syncTimeline() {
  if (!tl.dragging) tl.input.value = state.days;
  const text = dateFmt.format(new Date(J2000_MS + state.days * 864e5));
  if (text !== tl.shown) { // the time bar's date too, so the two never disagree
    tl.shown = text;
    tl.date.textContent = text;
    ui.date.textContent = text;
    tl.input.setAttribute('aria-valuetext', text);
    tl.half = tl.date.offsetWidth / 2;
  }
  // Centred over the handle, but never past either end of the bar.
  const x = tlX(state.days);
  const labelX = Math.min(tl.width - tl.half, Math.max(tl.half, x));
  if (!(Math.abs(x - tl.x) < 0.25)) { // also true while tl.x is NaN (first frame, after a resize)
    tl.x = x;
    tl.input.style.setProperty('--pct', `${tlFrac(state.days) * 100}%`);
    tl.date.style.setProperty('--x', `${labelX}px`);
  }
}
tl.input.addEventListener('pointerdown', () => {
  tl.dragging = true;
  tl.resume = state.playing;
  state.playing = false;
  updateSpeedUi();
});
const endDrag = () => {
  if (!tl.dragging) return;
  tl.dragging = false;
  state.playing = tl.resume;
  updateSpeedUi();
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
tl.input.addEventListener('input', () => setDate(Number(tl.input.value)));
// Arrows step a month (Shift: a year), Page Up/Down a decade, Home/End the ends.
tl.input.addEventListener('keydown', (e) => {
  const step = { ArrowRight: 30.44, ArrowUp: 30.44, ArrowLeft: -30.44, ArrowDown: -30.44, PageUp: 3652.5, PageDown: -3652.5 }[e.key];
  if (step) setDate(state.days + step * (e.shiftKey && Math.abs(step) < 100 ? 12 : 1));
  else if (e.key === 'Home') setDate(tl.min);
  else if (e.key === 'End') setDate(tl.max);
  else return;
  e.preventDefault();
});

ui.showOrbits.addEventListener('change', () => {
  state.showOrbits = ui.showOrbits.checked;
  for (const b of bodies) if (b.orbitLine) b.orbitLine.visible = state.showOrbits;
});
ui.showTrails.addEventListener('change', () => { state.showTrails = ui.showTrails.checked; clearTrails(); });
ui.showLabels.addEventListener('change', () => {
  state.showLabels = ui.showLabels.checked;
  for (const b of bodies) b.label.visible = state.showLabels;
  updateMoonLabel();
});

// The Moon's label would sit on top of Earth's unless we're close to Earth.
function updateMoonLabel() {
  moonBody.label.visible = state.showLabels && (state.focus === 'Earth' || state.focus === 'Moon');
}
ui.showSweep.addEventListener('change', () => {
  state.showSweep = ui.showSweep.checked;
  ui.sweepNote.hidden = !state.showSweep;
  buildSweep();
});
for (const btn of ui.scaleSeg.querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    if (state.scale === btn.dataset.scale) return;
    state.scale = btn.dataset.scale;
    setSegment(ui.scaleSeg, 'scale', state.scale);
    buildOrbitLines();
    updatePositions();
    buildSweep();
    clearTrails();
    if (state.focus !== 'free') startFly();
  });
}
ui.size.addEventListener('input', () => {
  state.sizeMul = Number(ui.size.value);
  ui.sizeVal.textContent = `${state.sizeMul.toFixed(1)}×`;
  applySizes();
});

$('infoClose').addEventListener('click', () => { ui.info.hidden = true; });

// ---- Blink view (js/blink.js): the SPHEREx exposures of one spot as a blink movie
initBlink();
$('blinkOpen').addEventListener('click', () => openBlink());
$('blinkBtn').addEventListener('click', () => {
  const b = byName.get(state.focus);
  const sc = b?.data?.scene;
  if (b?.kind === 'deepsky' && sc) openBlink({ name: b.data.name, ra: sc.ra, dec: sc.dec, pmra: 0, pmdec: 0 });
});

// ---------------------------------------------------------------- search
// Finds bodies already in the scene. For anything else, when the page is served
// by spherex_server.py, it can fetch the object from SPHEREx and add it live.
const search = {
  input: $('searchInput'), list: $('searchList'),
  status: $('fetchStatus'), fsTitle: $('fsTitle'), fsStep: $('fsStep'), fsLog: $('fsLog'),
  live: false, items: [], active: -1, job: null,
};
// The SPHEREx backend can take a few seconds to start after launch, so keep
// checking until it answers instead of giving up after one try.
(function checkLive(tries = 0) {
  fetch('api/health', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((j) => {
      if (j?.ok) {
        search.live = true;
        if (!search.list.hidden) renderSearch();
      } else if (tries < 60) setTimeout(() => checkLive(tries + 1), 2000);
    });
})();

const KIND_SUB = { sun: 'Star', planet: 'Planet', moon: 'Moon of Earth', deepsky: 'SPHEREx infrared image' };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ICONS = {
  fetch: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  recent: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>',
};

// Well-known infrared targets the name service resolves, so autocomplete can guess
// objects that aren't in the scene yet. Choosing one fetches it from SPHEREx.
const CATALOG = [
  ['Orion Nebula', 'M42', 'Nebula'], ['Andromeda Galaxy', 'M31', 'Galaxy'], ['Crab Nebula', 'M1', 'Supernova remnant'],
  ['Eagle Nebula', 'M16', 'Nebula'], ['Lagoon Nebula', 'M8', 'Nebula'], ['Trifid Nebula', 'M20', 'Nebula'],
  ['Omega Nebula', 'M17', 'Nebula'], ['Ring Nebula', 'M57', 'Planetary nebula'], ['Dumbbell Nebula', 'M27', 'Planetary nebula'],
  ['Helix Nebula', 'NGC 7293', 'Planetary nebula'], ["Cat's Eye Nebula", 'NGC 6543', 'Planetary nebula'],
  ['Owl Nebula', 'M97', 'Planetary nebula'], ['Horsehead Nebula', 'Barnard 33', 'Dark nebula'],
  ['Carina Nebula', 'NGC 3372', 'Nebula'], ['Rosette Nebula', 'NGC 2237', 'Nebula'], ['Tarantula Nebula', 'NGC 2070', 'Nebula'],
  ['North America Nebula', 'NGC 7000', 'Nebula'], ['Bubble Nebula', 'NGC 7635', 'Nebula'], ['Veil Nebula', 'NGC 6960', 'Supernova remnant'],
  ['Pleiades', 'M45', 'Star cluster'], ['Whirlpool Galaxy', 'M51', 'Galaxy'], ['Sombrero Galaxy', 'M104', 'Galaxy'],
  ['Pinwheel Galaxy', 'M101', 'Galaxy'], ['Triangulum Galaxy', 'M33', 'Galaxy'], ['Cigar Galaxy', 'M82', 'Galaxy'],
  ["Bode's Galaxy", 'M81', 'Galaxy'], ['Sunflower Galaxy', 'M63', 'Galaxy'], ['Black Eye Galaxy', 'M64', 'Galaxy'],
  ['Centaurus A', 'NGC 5128', 'Galaxy'], ['Large Magellanic Cloud', 'LMC', 'Galaxy'], ['Small Magellanic Cloud', 'SMC', 'Galaxy'],
].map(([name, alias, type]) => ({ name, alias, type }));

// ---- Recent searches (this browser only)
const RECENT_KEY = 'infrapics.recentSearches';
const RECENT_MAX = 8;
function loadRecent() {
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((s) => typeof s === 'string') : []; } catch { return []; }
}
let recent = loadRecent();
function saveRecent() {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode */ }
}
function addRecent(name) {
  recent = [name, ...recent.filter((r) => norm(r) !== norm(name))].slice(0, RECENT_MAX);
  saveRecent();
}
function removeRecent(name) {
  recent = recent.filter((r) => r !== name);
  saveRecent();
}

// Edit distance, capped: used so a typo like "jupyter" still finds Jupiter.
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

// How well a name matches what's typed so far; 0 means no match.
function matchScore(name, nq, fuzzy = true) {
  const n = norm(name);
  if (!nq || !n) return 0;
  if (n === nq) return 100;
  if (n.startsWith(nq)) return 80 - Math.min(10, n.length - nq.length) * 0.1;
  const words = n.split(' ');
  if (words.some((w, i) => words.slice(i).join(' ').startsWith(nq))) return 60;
  if (n.includes(nq)) return 40;
  const compact = nq.replace(/ /g, '');
  if (fuzzy && compact.length >= 4) {
    // typo tolerance against the same-length start of the name, or any word
    const allow = compact.length >= 6 ? 2 : 1;
    const flat = n.replace(/ /g, '');
    if (editDistance(compact, flat.slice(0, compact.length), allow) <= allow) return 25;
    if (words.some((w) => w.length >= 3 && editDistance(compact, w.slice(0, compact.length), allow) <= allow)) return 20;
  }
  return 0;
}

// Every name the search knows: bodies in the scene, then catalog targets not loaded yet.
function candidates() {
  const out = bodies.map((b) => ({
    kind: 'body', b, name: b.data.name, sub: b.data.type || KIND_SUB[b.kind], type: b.data.type || '',
    alias: CATALOG.find((c) => norm(c.name) === norm(b.data.name))?.alias,
  }));
  const have = new Set(bodies.map((b) => norm(b.data.name)));
  for (const c of CATALOG) {
    if (have.has(norm(c.name))) continue;
    out.push({ kind: 'fetch', q: c.name, name: c.name, sub: `${c.type} · ${c.alias} · not in the scene yet`, alias: c.alias, type: c.type });
  }
  return out;
}

function suggest(nq) {
  const recentSet = new Set(recent.map(norm));
  return candidates()
    .map((c) => {
      // a catalog alias ("M42") counts less than the name; the type
      // ("Planet", "Galaxy") matches weakly so it can't outrank names
      let s = matchScore(c.name, nq);
      if (c.alias) s = Math.max(s, matchScore(c.alias, nq, false) * 0.7);
      if (c.type) s = Math.max(s, Math.min(matchScore(c.type, nq, false), 30));
      if (s) s += (c.kind === 'body' ? 3 : 0) + (recentSet.has(norm(c.name)) ? 2 : 0);
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, 5) // short, so the Recent section below stays in view
    .map((x) => x.c);
}

const fetchHint = () => 'Fetch the SPHEREx pictures and add it to the map (about a minute)';

function renderSearch() {
  const q = search.input.value.trim();
  const nq = norm(q);
  const items = [];
  const shown = new Set();

  if (nq) {
    for (const c of suggest(nq)) { items.push({ ...c, section: 'suggest' }); shown.add(norm(c.name)); }
    if (!shown.has(nq)) items.push({ kind: 'fetch', q, name: `Add “${q}” from SPHEREx`, section: 'fetch', custom: true });
  }
  // Recent searches go at the bottom: all of them on an empty box, the matching ones while typing.
  const recents = recent.filter((r) => !shown.has(norm(r)) && (!nq || matchScore(r, nq) > 0)).slice(0, nq ? 3 : 6);
  for (const r of recents) {
    const b = byName.get(r);
    items.push(b
      ? { kind: 'body', b, name: r, sub: b.data.type || KIND_SUB[b.kind], section: 'recent', recent: r }
      : { kind: 'fetch', q: r, name: r, sub: 'Not on the map yet · fetch from SPHEREx', section: 'recent', recent: r });
  }
  search.items = items;

  const nodes = [];
  let lastSection = null;
  items.forEach((it, i) => {
    if (it.section !== lastSection && (it.section === 'recent' || (it.section === 'fetch' && i > 0))) {
      nodes.push(groupHeader(it.section === 'recent' ? 'Recent' : 'Search SPHEREx', it.section === 'recent'));
    }
    lastSection = it.section;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sr-item';
    btn.id = `sr-${i}`;
    btn.setAttribute('role', 'option');
    if (it.section === 'recent') {
      btn.classList.add('sr-recent');
      btn.append(iconEl(ICONS.recent), srText(it.name, it.sub, ''));
      
    } else if (it.kind === 'body') {
      const orb = document.createElement('span');
      orb.className = 'planet-orb';
      orb.style.setProperty('--c', it.b.data.color);
      if (it.b.kind === 'deepsky') orb.style.background = `url("${it.b.data.thumb}") center / cover`;
      btn.append(orb, srText(it.name, it.sub, nq));
    } else {
      btn.classList.add('sr-fetch');
      btn.append(iconEl(ICONS.fetch), srText(it.name, it.custom ? fetchHint() : it.sub, it.custom ? '' : nq));
      if (btn.disabled && !it.custom) btn.title = fetchHint();
    }
    btn.addEventListener('click', () => choose(i));
    btn.addEventListener('pointermove', () => setActive(i));

    if (it.recent) {
      const row = document.createElement('div');
      row.className = 'sr-row';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sr-remove';
      del.tabIndex = -1;
      del.setAttribute('aria-label', `Remove ${it.recent} from recent searches`);
      del.innerHTML = ICONS.x;
      del.addEventListener('click', () => { removeRecent(it.recent); renderSearch(); search.input.focus(); });
      row.append(btn, del);
      nodes.push(row);
    } else {
      nodes.push(btn);
    }
  });
  search.list.replaceChildren(...nodes);
  search.list.hidden = nodes.length === 0;
  search.input.setAttribute('aria-expanded', String(!search.list.hidden));
  setActive(items.length ? 0 : -1);
  updateGhost();
}

function groupHeader(label, clearable) {
  const g = document.createElement('div');
  g.className = 'sr-group';
  const t = document.createElement('span');
  t.textContent = label;
  g.append(t);
  if (clearable) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'sr-clear';
    clear.tabIndex = -1;
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => { recent = []; saveRecent(); renderSearch(); search.input.focus(); });
    g.append(clear);
  }
  return g;
}

function iconEl(svg) {
  const icon = document.createElement('span');
  icon.className = 'sr-icon';
  icon.innerHTML = svg;
  return icon;
}

// Name with the part that matches the query in bold.
function srText(name, sub, nq) {
  const t = document.createElement('span');
  t.className = 'sr-text';
  const n = document.createElement('span'); n.className = 'sr-name';
  const at = nq ? name.toLowerCase().indexOf(nq) : -1;
  if (at >= 0) {
    const m = document.createElement('mark');
    m.textContent = name.slice(at, at + nq.length);
    n.append(name.slice(0, at), m, name.slice(at + nq.length));
  } else {
    n.textContent = name;
  }
  const s = document.createElement('span'); s.className = 'sr-sub'; s.textContent = sub;
  t.append(n, s);
  return t;
}

// ---- Inline completion: the rest of the top guess appears in grey after the cursor.
// Tab or → accepts it.
search.ghost = $('searchGhost');
function ghostCompletion() {
  const v = search.input.value;
  if (!v.trim() || search.input.selectionStart !== v.length) return null;
  const top = search.items.find((it) => it.section === 'suggest' || it.section === 'recent');
  if (!top || top.custom || !top.name.toLowerCase().startsWith(v.toLowerCase()) || top.name.length === v.length) return null;
  return top.name;
}
function updateGhost() {
  const full = document.activeElement === search.input ? ghostCompletion() : null;
  if (!full || search.input.scrollWidth > search.input.clientWidth) { search.ghost.replaceChildren(); return; }
  const typed = document.createElement('span');
  typed.className = 'ghost-typed';
  typed.textContent = search.input.value;
  search.ghost.replaceChildren(typed, full.slice(search.input.value.length));
}
function acceptGhost() {
  const full = ghostCompletion();
  if (!full) return false;
  search.input.value = full;
  renderSearch();
  return true;
}

function setActive(i) {
  search.active = i;
  [...search.list.querySelectorAll('.sr-item')].forEach((el, j) => el.setAttribute('aria-selected', String(j === i)));
  if (i >= 0) search.input.setAttribute('aria-activedescendant', `sr-${i}`);
  else search.input.removeAttribute('aria-activedescendant');
}

function closeSearch() {
  search.list.hidden = true;
  search.input.setAttribute('aria-expanded', 'false');
  search.ghost.replaceChildren();
}

function choose(i) {
  const it = search.items[i];
  if (!it) return;
  if (it.kind === 'body') {
    addRecent(it.b.data.name);
    closeBlink();
    focusOn(it.b.data.name);
    search.input.value = '';
    closeSearch();
    search.input.blur();
  } else {
    addRecent(it.q);
    if (!search.job) startFetch(it.q);
    search.input.value = '';
    closeSearch();
    search.input.blur();
  }
}

search.input.addEventListener('input', renderSearch);
search.input.addEventListener('focus', renderSearch);
search.input.addEventListener('blur', () => search.ghost.replaceChildren());
search.input.addEventListener('keydown', (e) => {
  const n = search.items.length;
  const atEnd = search.input.selectionStart === search.input.value.length;
  if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'ArrowRight' && atEnd)) {
    if (acceptGhost()) e.preventDefault();
  } else if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((search.active + 1) % n); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((search.active - 1 + n) % n); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(search.active); }
  else if (e.key === 'Escape') { closeSearch(); search.input.blur(); }
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.search-wrap')) closeSearch();
});
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== search.input && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    search.input.focus();
  }
});

// ---------------------------------------------------------------- keyboard flight
// W/S forward and back, A/D left and right, Q/E down and up (arrow keys work too),
// Shift to go faster. Speed scales with how far away you're looking, so the same
// keys work next to a moon or out at a nebula. Moving switches to the free camera.
const MOVE_KEYS = {
  KeyW: [0, 0, 1], ArrowUp: [0, 0, 1], KeyS: [0, 0, -1], ArrowDown: [0, 0, -1],
  KeyA: [-1, 0, 0], ArrowLeft: [-1, 0, 0], KeyD: [1, 0, 0], ArrowRight: [1, 0, 0],
  KeyE: [0, 1, 0], KeyQ: [0, -1, 0],
};
const held = new Set();
const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || typing()) return;
  if (MOVE_KEYS[e.code] || e.key === 'Shift') {
    held.add(e.key === 'Shift' ? 'Shift' : e.code);
    if (MOVE_KEYS[e.code]) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key === 'Shift' ? 'Shift' : e.code));
window.addEventListener('blur', () => held.clear());

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
function keyboardMove(dt) {
  let x = 0, y = 0, z = 0;
  for (const k of held) if (MOVE_KEYS[k]) { x += MOVE_KEYS[k][0]; y += MOVE_KEYS[k][1]; z += MOVE_KEYS[k][2]; }
  if (!x && !y && !z) return;
  if (state.focus !== 'free') focusOn('free', { showCard: false }); // stop following, keep the card
  fly = null;
  const boost = held.has('Shift') ? 3 : 1;
  const ctrl = controls();
  if (state.mode === '3d') {
    const cam = persp;
    const speed = Math.max(2, cam.position.distanceTo(ctrl.target)) * 0.8 * boost; // units per second
    cam.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, cam.up).normalize();
    _move.set(0, 0, 0).addScaledVector(_fwd, z).addScaledVector(_right, x).addScaledVector(cam.up, y);
    if (_move.lengthSq() === 0) return;
    _move.normalize().multiplyScalar(speed * dt);
    cam.position.add(_move);
    ctrl.target.add(_move);
  } else {
    // 2D map: W/S/A/D pan the view, Q/E zoom out and in
    const visible = ((ORTHO_BASE * state.fov) / 60) / ortho.zoom;
    const step = visible * 0.6 * boost * dt;
    _move.set(x * step, 0, -z * step); // screen-up is -Z on the map
    ortho.position.add(_move);
    ctrl.target.add(_move);
    if (y) {
      ortho.zoom = THREE.MathUtils.clamp(ortho.zoom * Math.exp(y * 1.6 * boost * dt), controls2.minZoom, controls2.maxZoom);
      ortho.updateProjectionMatrix();
    }
  }
}

// ---- Live fetch, with progress polled from the server
const STEP_TEXT = {
  queued: 'Waiting for another fetch to finish…',
  start: 'Starting…',
  resolve: 'Looking up where it is in the sky…',
  search: 'Searching the SPHEREx archive at NASA IRSA…',
  download: 'Downloading infrared images, one per detector…',
  export: 'Building the images…',
};

function showStatus(state, title, step, log = '') {
  search.status.hidden = false;
  search.status.dataset.state = state;
  search.fsTitle.textContent = title;
  search.fsStep.textContent = step;
  search.fsLog.textContent = log;
}
$('fsClose').addEventListener('click', () => { search.status.hidden = true; });

async function startFetch(name) {
  search.job = name;
  showStatus('running', `Fetching ${name}`, STEP_TEXT.start);
  try {
    let s = await fetch(`api/fetch?name=${encodeURIComponent(name)}`).then((r) => r.json());
    while (s.state === 'queued' || s.state === 'running') {
      const extra = s.step === 'download' && s.n_images ? ` (${s.n_images} exposures found)` : '';
      showStatus('running', `Fetching ${name} · ${s.elapsed ?? 0}s`, (STEP_TEXT[s.step] || 'Working…') + extra, s.log?.[s.log.length - 1] || '');
      await new Promise((r) => setTimeout(r, 1500));
      s = await fetch(`api/status?name=${encodeURIComponent(name)}`, { cache: 'no-store' }).then((r) => r.json());
    }
    if (s.state !== 'done') throw new Error(s.error || 'The fetch did not finish.');
    const d = await loadTarget(s.slug);
    let b = byName.get(d.name);
    if (!b) {
      b = createDeepBody(d);
      buildRail();
    }
    showStatus('done', `${d.name} added`, 'Flying there now. It stays in the sky and the list.');
    setTimeout(() => { if (search.status.dataset.state === 'done') search.status.hidden = true; }, 6000);
    focusOn(d.name);
  } catch (err) {
    showStatus('error', `Couldn't fetch ${name}`, err.message || String(err));
  } finally {
    search.job = null;
  }
}

// Click a planet to focus it (ignore drags).
const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  setPanel(false); // a plain click on the scene dismisses the panel
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera());
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit && hit.object.userData.name !== state.focus) focusOn(hit.object.userData.name);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  updateOrthoFrustum();
});

// ---------------------------------------------------------------- loop
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
let last = performance.now();
let infoTimer = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const dDays = state.playing ? SPEEDS[state.speedIdx].days * state.direction * dt : 0;
  state.days += dDays;

  updatePositions();
  spinBodies(dDays);
  updateTrails();
  keyboardMove(dt);
  updateCamera(now);
  updateDeepSky();
  syncTimeline();

  infoTimer += dt;
  if (infoTimer > 0.15) {
    infoTimer = 0;
    if (!ui.info.hidden) updateInfo(); // the date itself is kept in step by syncTimeline()
  }

  renderer.render(scene, camera());
  labelRenderer.render(scene, camera());
  requestAnimationFrame(frame);
}

buildOrbitLines();
applySizes();
updatePositions();
updateSpeedUi();
updateFovUi();
focusOn('Sun', { showCard: window.innerWidth > 760 });
initLiquidGlass();
document.getElementById('loading').classList.add('done');
requestAnimationFrame(frame);

// ---------------------------------------------------------------- tour
// Runs once on the first visit; the ? button or key replays it.
let tourOpenedInfo = false;
const tourHooks = {
  setPanel,
  showInfo() { // the details step needs a card to point at
    if (!ui.info.hidden) return;
    tourOpenedInfo = true;
    showInfo(byName.has(state.focus) ? state.focus : 'Earth');
  },
  closeInfo() { if (tourOpenedInfo) ui.info.hidden = true; tourOpenedInfo = false; },
  onEnd() { tourHooks.closeInfo(); },
};
const runTour = () => {
  if (tourActive()) return; // the UI stays live during the tour, so don't reset it mid-way
  closeSearch(); setPanel(false); startTour(tourHooks);
};
$('tourBtn').addEventListener('click', runTour);
window.addEventListener('keydown', (e) => {
  if (e.key === '?' && !typing()) { e.preventDefault(); runTour(); }
});
if (!tourSeen() && !new URLSearchParams(location.search).has('blink')) setTimeout(runTour, 900); // let the loading screen fade first

// The website embeds this page and can ask it to search for an object.
window.addEventListener('message', (e) => {
  const q = e.data && e.data.infrapixSearch;
  if (!q || typeof q !== 'string') return;
  const b = byName.get(q);
  if (b) { focusOn(b.data.name); return; }
  if (!search.job) startFetch(q);
});
if (window.self !== window.top) document.documentElement.classList.add('framed');
