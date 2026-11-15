// First-visit tour: a spotlight that walks through each part of the interface.
// main.js passes hooks so a step can open what it is about to point at
// (the details card, the display panel) and put things back afterwards.
import { liquid } from './glass.js';

const DONE_KEY = 'infrapics-tour-done';

export function tourSeen() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ }
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const touch = matchMedia('(hover: none)').matches;
const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join('');

function steps(h) {
  return [
    {
      title: 'Welcome to Infrapix',
      body: `<p>An explorable map of the Solar System and the deep sky as NASA's SPHEREx telescope sees it in infrared.</p>
        <p>This short tour shows you around.${touch ? '' : ` Use ${k('←')} ${k('→')} to step through, or ${k('Esc')} to skip.`}</p>`,
    },
    {
      title: 'Moving the camera',
      free: true, // no dimming, so the scene can be tried out during this step
      body: `<p>Try it now. The tour stays open.</p>
        <dl class="tour-keys">
          <dt>${touch ? 'Drag' : 'Left-drag'}</dt><dd>Orbit around what you're looking at</dd>
          <dt>${touch ? 'Pinch' : 'Scroll'}</dt><dd>Zoom in and out</dd>
          <dt>${touch ? 'Two-finger drag' : 'Right-drag'}</dt><dd>Pan sideways</dd>
          ${touch ? '' : `<dt>${k('W')}${k('A')}${k('S')}${k('D')}</dt><dd>Fly forward, left, back, right (arrow keys work too)</dd>
          <dt>${k('Q')} ${k('E')}</dt><dd>Fly down and up</dd>
          <dt>${k('Shift')}</dt><dd>Hold to fly three times faster</dd>
          <dt>${k('Space')}</dt><dd>Pause or resume time</dd>`}
        </dl>
        <p class="tour-note">${touch ? '' : 'Flying switches to the free camera, which stops following the selected body. '}In the 2D map, ${touch ? 'dragging' : 'left-drag'} pans instead of rotating.</p>`,
    },
    {
      target: '.search-wrap .search',
      title: 'Search',
      body: `<p>Find a planet, moon, nebula, galaxy or star cluster by name. Press ${k('/')} from anywhere to jump here.</p>
        <p>Results appear as you type. ${k('Tab')} completes the grey suggestion, ${k('↑')} ${k('↓')} pick a result and ${k('Enter')} flies there.</p>
        <p class="tour-note">If a deep-sky object isn't on the map yet, search for it anyway: it can be fetched live from the SPHEREx archive and added.</p>`,
    },
    {
      target: '.rail',
      title: 'Celestial bodies',
      body: `<p>Everything on the map, in collapsible groups. Click a name to fly to it.</p>
        <ul>
          <li><b>Solar system</b> runs outward from the Sun, with the Moon tucked under Earth.</li>
          <li><b>Nebulae, Galaxies, Star clusters, Stars</b> and <b>Sky fields</b> hold SPHEREx targets. Their dots are the infrared images themselves.</li>
          <li>Click a group's header to fold it away. The number beside it counts what's inside.</li>
          <li><b>Free camera</b> at the bottom stops following anything so you can fly freely.</li>
        </ul>`,
    },
    {
      target: '#info',
      title: 'Details',
      enter: h.showInfo,
      body: `<p>Clicking a body, in the scene, on its label or in the list, opens this card.</p>
        <ul>
          <li>Key facts sit at the top and update live as time runs.</li>
          <li><b>Show more</b> opens a description and the full set of figures.</li>
          <li>For deep-sky objects you get the <b>SPHEREx images</b> themselves: the colour picture and the raw image from each of its six detectors.</li>
          <li>A key explains what the <b>blue, green and red dots</b> in the colour picture are.</li>
        </ul>`,
    },
    {
      target: '.transport',
      title: 'Time controls',
      also: '.timeline',
      enter: h.closeInfo,
      body: `<p>The planets move in real time along their true orbits.</p>
        <ul>
          <li><b>Reverse</b> runs time backwards. The sun-coloured button pauses and plays.</li>
          <li>The date shows the moment you're looking at. Drag the <b>timeline</b> above to jump anywhere from 1900 to 2100.</li>
          <li><b>Speed</b> sets how fast time passes, from real time up to years per second.</li>
          <li><b>Today</b> jumps back to the present.</li>
        </ul>`,
    },
    {
      target: '#resetView',
      title: 'Back to the start',
      body: `<p>Lost somewhere in space? This button flies you back to where the app begins: the whole Solar System in 3D, centred on the Sun.</p>
        <p class="tour-note">It also returns the date to today, with time running forwards at the normal speed. Your display settings stay as they are.</p>`,
    },
    {
      target: '#displayPanel.open', // if the user closes it, the card just centres
      title: 'Display settings',
      enter: () => h.setPanel(true),
      leave: () => h.setPanel(false),
      compact: true, // the panel is big; a slim card fits beside it without covering controls
      body: `<p>Opened from the sliders button on the time bar. Try the switches.</p>
        <dl class="tour-keys tour-groups">
          <dt>View</dt><dd>3D or 2D map, field of view, camera angles</dd>
          <dt>Show</dt><dd>Orbits, trails, labels, Kepler's 2nd law</dd>
          <dt>Scale</dt><dd>Compressed or true distances, planet size</dd>
        </dl>`,
    },
    {
      target: '#tourBtn',
      title: "You're all set",
      body: `<p>Open this tour again any time with this button${touch ? '' : ` or the ${k('?')} key`}.</p>`,
      last: true,
    },
  ];
}

let active = null;
export const tourActive = () => !!active;

// The controls the card should try not to cover.
const UI = '.brand, .search-wrap .search, .search-list:not([hidden]), .fetch-status:not([hidden]), .rail, #info:not([hidden]), .timeline, .transport, #displayPanel.open';
const grow = (r, p) => ({ left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p });
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);

export function startTour(hooks) {
  if (active) return;
  const list = steps(hooks);

  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <div class="tour-spot" aria-hidden="true"></div>
    <section class="tour-card lg lg-regular" role="dialog" aria-labelledby="tourTitle" data-refract="30">
      <div class="tour-top">
        <span class="tour-count"></span>
        <button class="tour-skip" type="button">Skip tour</button>
      </div>
      <h2 id="tourTitle"></h2>
      <div class="tour-body"></div>
      <div class="tour-foot">
        <div class="tour-dots" aria-hidden="true">${list.map(() => '<span></span>').join('')}</div>
        <button class="pill tour-back" type="button">Back</button>
        <button class="pill tour-next" type="button"></button>
      </div>
    </section>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const card = $('.tour-card'), spot = $('.tour-spot');
  liquid(card);

  let i = -1, raf = 0, step = null, pos = null, moved = true;
  let size = null, swapTimer = 0, sizeTimer = 0;

  // Motion: the card and spotlight glide towards where place() wants them on a
  // critically damped spring (no overshoot), integrated exactly so it stays smooth
  // at any frame rate. A target that is itself moving (a panel sliding in) is
  // followed continuously instead of restarting a CSS transition every frame.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const OMEGA = 12; // stiffness: higher settles faster
  let anim = null, vel = {}, lastT = 0;
  function animate(target, now) {
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
    lastT = now;
    if (!anim || reduce.matches) { anim = { ...target }; vel = {}; return anim; }
    const e = Math.exp(-OMEGA * dt);
    for (const key in target) {
      const d = anim[key] - target[key], v = vel[key] || 0, tmp = (v + OMEGA * d) * dt;
      vel[key] = (v - OMEGA * tmp) * e;
      anim[key] = target[key] + (d + tmp) * e;
    }
    return anim;
  }

  // Score a card position: never cover the thing being explained, avoid covering
  // any other control, and otherwise stay close to the target (or the centre).
  function score(x, y, cw, ch, r, ui, anchor) {
    const c = { left: x, top: y, right: x + cw, bottom: y + ch };
    let s = 0;
    if (r) s += overlap(c, grow(r, 10)) * 20;
    for (const u of ui) s += overlap(c, grow(u, 8));
    return s + Math.hypot(x + cw / 2 - anchor[0], y + ch / 2 - anchor[1]) * 2;
  }

  function place(now) {
    const el = step?.target && document.querySelector(step.target);
    let r = el?.getBoundingClientRect();
    if (r && (!r.width || !r.height)) r = null; // hidden: fall back to a centred card
    // `also`: a second element the spotlight should wrap together with the target
    const extra = r && step.also && document.querySelector(step.also)?.getBoundingClientRect();
    if (extra?.width) {
      r = { left: Math.min(r.left, extra.left), top: Math.min(r.top, extra.top),
        right: Math.max(r.right, extra.right), bottom: Math.max(r.bottom, extra.bottom) };
      r.width = r.right - r.left; r.height = r.bottom - r.top;
    }
    const vw = innerWidth, vh = innerHeight, m = 16;
    root.classList.toggle('free', !!step?.free);
    root.classList.toggle('centered', !r);
    const pad = 6;
    // Nothing to point at: shrink the hole to nothing, the shadow dims the whole screen.
    const hole = r
      ? { sx: r.left - pad, sy: r.top - pad, sw: r.width + pad * 2, sh: r.height + pad * 2,
        sr: (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12) + pad }
      : { sx: vw / 2, sy: vh / 2, sw: 0, sh: 0, sr: 0 };
    // While the card is resizing to fit a new step, place it by its final size.
    const [cw, ch] = size || [card.offsetWidth, card.offsetHeight];
    const clampX = (x) => Math.min(Math.max(m, x), vw - cw - m);
    const clampY = (y) => Math.min(Math.max(m, y), vh - ch - m);

    // Every visible control except the target itself (and anything inside it).
    const ui = [...document.querySelectorAll(UI)]
      .filter((u) => !el || (u !== el && !el.contains(u)))
      .map((u) => u.getBoundingClientRect())
      .filter((u) => u.width && u.height);

    // Candidates: hugging each side of the target at a few alignments, plus a grid
    // over the whole screen for when nothing next to the target is free.
    const cands = [];
    if (r) {
      const g = 18;
      for (const y of [r.top, r.top + r.height / 2 - ch / 2, r.bottom - ch]) {
        cands.push([r.right + g, y], [r.left - g - cw, y]);
      }
      for (const x of [r.left, r.left + r.width / 2 - cw / 2, r.right - cw]) {
        cands.push([x, r.bottom + g], [x, r.top - g - ch]);
      }
    }
    for (let gx = 0; gx <= 10; gx++) {
      for (let gy = 0; gy <= 10; gy++) cands.push([m + (vw - cw - 2 * m) * gx / 10, m + (vh - ch - 2 * m) * gy / 10]);
    }
    const anchor = r ? [r.left + r.width / 2, r.top + r.height / 2] : [vw / 2, vh / 2];
    let best = null, bestS = Infinity;
    for (const [cx, cy] of cands) {
      const x = clampX(cx), y = clampY(cy);
      const s = score(x, y, cw, ch, r, ui, anchor);
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    // Stay put unless the step changed or the spot we're in got clearly worse,
    // so the card doesn't hop about while panels animate or the user drags things.
    if (pos) pos = [clampX(pos[0]), clampY(pos[1])];
    if (moved || !pos || bestS < score(pos[0], pos[1], cw, ch, r, ui, anchor) - 4000) pos = best;
    moved = false;
    const a = animate({ ...hole, cx: Math.round(pos[0]), cy: Math.round(pos[1]) }, now);
    spot.style.transform = `translate3d(${a.sx}px, ${a.sy}px, 0)`;
    spot.style.width = `${Math.max(0, a.sw)}px`;
    spot.style.height = `${Math.max(0, a.sh)}px`;
    spot.style.borderRadius = `${Math.max(0, a.sr)}px`;
    card.style.transform = `translate3d(${a.cx}px, ${a.cy}px, 0)`;
  }
  // Panels animate in and the layout reflows, so follow the target every frame.
  const loop = (now) => { place(now); raf = requestAnimationFrame(loop); };

  // Write a step's text into the card. The card's width and height animate from
  // the old step's size to the new one instead of jumping.
  function fill(first) {
    const w0 = card.offsetWidth, h0 = card.offsetHeight;
    clearTimeout(sizeTimer);
    card.classList.toggle('compact', !!step.compact);
    $('#tourTitle').textContent = step.title;
    $('.tour-body').innerHTML = step.body;
    $('.tour-back').hidden = i === 0;
    $('.tour-next').textContent = step.last ? 'Start exploring' : i === 0 ? 'Show me around' : 'Next';
    $('.tour-skip').hidden = !!step.last;
    card.style.width = card.style.height = '';
    const w1 = card.offsetWidth, h1 = card.offsetHeight;
    moved = true; // pick a new spot for the card now that its size is known
    if (!first && !reduce.matches && (w0 !== w1 || h0 !== h1)) {
      size = [w1, h1];
      card.style.width = `${w0}px`;
      card.style.height = `${h0}px`;
      void card.offsetWidth;
      card.style.width = `${w1}px`;
      card.style.height = `${h1}px`;
      sizeTimer = setTimeout(() => { card.style.width = card.style.height = ''; size = null; }, 450);
    } else size = null;
    card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
    $('.tour-next').focus({ preventScroll: true });
  }

  function go(n) {
    if (n < 0 || n >= list.length) return;
    const first = i < 0;
    step?.leave?.();
    i = n;
    step = list[i];
    root.classList.remove('hands-on');
    step.enter?.();
    $('.tour-count').textContent = `${i + 1} of ${list.length}`;
    root.querySelectorAll('.tour-dots span').forEach((d, j) => d.classList.toggle('on', j === i));
    // The spotlight sets off at once; the old text fades out briefly, then the
    // new text fades in as the card glides to its new place.
    clearTimeout(swapTimer);
    if (first || reduce.matches) { fill(first); return; }
    card.classList.add('leaving');
    swapTimer = setTimeout(() => { card.classList.remove('leaving'); fill(false); }, 140);
  }

  function end() {
    step?.leave?.();
    clearTimeout(swapTimer);
    clearTimeout(sizeTimer);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onTouchUi, true);
    document.removeEventListener('focusin', onTouchUi, true);
    markSeen();
    root.classList.add('out');
    setTimeout(() => root.remove(), 300);
    active = null;
    hooks.onEnd?.();
  }

  // The app stays fully usable during the tour. Only ← → and Esc belong to the
  // tour (capture phase, ahead of the camera's arrow-key flight), and not while
  // typing, so the search box keeps its own keys.
  function onKey(e) {
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Escape') { swallow(); end(); }
    else if (e.key === 'ArrowRight') { swallow(); step.last ? end() : go(i + 1); }
    else if (e.key === 'ArrowLeft') { swallow(); go(i - 1); }
  }
  // Once the user reaches for the interface, lift the dimming for this step.
  function onTouchUi(e) {
    if (!card.contains(e.target)) root.classList.add('hands-on');
  }

  $('.tour-next').addEventListener('click', () => (step.last ? end() : go(i + 1)));
  $('.tour-back').addEventListener('click', () => go(i - 1));
  $('.tour-skip').addEventListener('click', end);
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onTouchUi, true);
  document.addEventListener('focusin', onTouchUi, true);

  active = { end };
  go(0);
  requestAnimationFrame(() => root.classList.add('in'));
  loop(performance.now());
}
