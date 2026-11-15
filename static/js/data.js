// Orbital elements (J2000, ecliptic) from JPL "Approximate Positions of the Planets".
// a: semi-major axis [AU], e: eccentricity, i: inclination [deg],
// L: mean longitude [deg], peri: longitude of perihelion [deg], node: longitude of ascending node [deg]

export const SUN = {
  name: 'Sun',
  type: 'G-type main-sequence star',
  radiusKm: 696340,
  tilt: 7.25,
  dayHours: 609.12,
  color: '#ffcc55',
  facts: [
    ['Radius', '696,340 km'],
    ['Surface temp.', '≈ 5,772 K'],
    ['Rotation', '≈ 25 days (equator)'],
    ['Age', '≈ 4.6 billion years'],
  ],
  description:
    'The star at the centre of the system. It holds 99.8% of the solar system\'s mass, and its gravity sets the orbit of every planet.',
};

export const PLANETS = [
  {
    name: 'Mercury', type: 'Terrestrial planet', color: '#b5aea6',
    a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, peri: 77.45779628, node: 48.33076593,
    radiusKm: 2439.7, tilt: 0.03, dayHours: 1407.6, moons: '0',
    texture: { kind: 'rocky', colors: ['#5d5853', '#b9b1a8'], seed: 11, freq: 5 },
    description: 'The smallest planet and the closest to the Sun. Its orbit is the most eccentric of the eight planets, so its speed changes a lot over one orbit.',
  },
  {
    name: 'Venus', type: 'Terrestrial planet', color: '#e8c27a',
    a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, peri: 131.60246718, node: 76.67984255,
    radiusKm: 6051.8, tilt: 177.36, dayHours: -5832.5, moons: '0',
    texture: { kind: 'banded', colors: ['#d9b26a', '#f1d9a0', '#c99a52', '#ead1a0'], seed: 22, bands: 5, turb: 1.6 },
    description: 'Wrapped in thick clouds of sulphuric acid, Venus is the hottest planet. It spins backwards, and very slowly.',
  },
  {
    name: 'Earth', type: 'Terrestrial planet', color: '#4f8fe0',
    a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0,
    radiusKm: 6371, tilt: 23.44, dayHours: 23.934, moons: '1',
    texture: { kind: 'earth', seed: 33 },
    description: 'Our home, and the only world known to have life. Its 23.4° axial tilt causes the seasons.',
  },
  {
    name: 'Mars', type: 'Terrestrial planet', color: '#d0603a',
    a: 1.52371034, e: 0.0933941, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891,
    radiusKm: 3389.5, tilt: 25.19, dayHours: 24.623, moons: '2',
    texture: { kind: 'rocky', colors: ['#7a2e17', '#d27148'], seed: 44, freq: 3, caps: true },
    description: 'The red planet. Iron oxide dust covers its surface, and it has the tallest volcano in the solar system, Olympus Mons.',
  },
  {
    name: 'Jupiter', type: 'Gas giant', color: '#d8b48a',
    a: 5.202887, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909,
    radiusKm: 69911, tilt: 3.13, dayHours: 9.925, moons: '95+',
    texture: { kind: 'banded', colors: ['#e9dcc6', '#b98a5e', '#f3ead8', '#a8704a', '#d9c2a0'], seed: 55, bands: 9, turb: 0.9, spot: true },
    description: 'The largest planet, with more than twice the mass of all the other planets combined. The Great Red Spot is a storm wider than Earth.',
  },
  {
    name: 'Saturn', type: 'Gas giant', color: '#e3cf98',
    a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448,
    radiusKm: 58232, tilt: 26.73, dayHours: 10.656, moons: '270+', rings: true,
    texture: { kind: 'banded', colors: ['#e8d7a8', '#cdb27a', '#f2e6c4', '#bfa06a'], seed: 66, bands: 7, turb: 0.5 },
    description: 'Known for its large ring system, made of ice and rock. Saturn is less dense than water.',
  },
  {
    name: 'Uranus', type: 'Ice giant', color: '#9fd8e0',
    a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, peri: 170.9542763, node: 74.01692503,
    radiusKm: 25362, tilt: 97.77, dayHours: -17.24, moons: '28',
    texture: { kind: 'banded', colors: ['#a6dde4', '#93ced8', '#b5e6ea'], seed: 77, bands: 4, turb: 0.3 },
    description: 'An ice giant tipped on its side. Its axis is tilted about 98°, so it rolls around the Sun.',
  },
  {
    name: 'Neptune', type: 'Ice giant', color: '#4a6fe0',
    a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574,
    radiusKm: 24622, tilt: 28.32, dayHours: 16.11, moons: '16',
    texture: { kind: 'banded', colors: ['#3d5fd0', '#5a7ee6', '#2f4fb8', '#6b8cf0'], seed: 88, bands: 6, turb: 0.8 },
    description: 'The farthest planet. It has the fastest winds in the solar system, above 2,000 km/h.',
  },
  {
    name: 'Pluto', type: 'Dwarf planet', dwarf: true, color: '#d9c6a8',
    a: 39.48211675, e: 0.2488273, i: 17.14001206, L: 238.92903833, peri: 224.06891629, node: 110.30393684,
    radiusKm: 1188.3, tilt: 122.53, dayHours: -153.29, moons: '5',
    texture: { kind: 'rocky', colors: ['#7d6650', '#eadbc4'], seed: 101, freq: 4 },
    description: 'Found in 1930 by Clyde Tombaugh with a blink comparator, the same technique Infrapix uses. Its orbit is so eccentric and tilted that it sometimes comes closer to the Sun than Neptune.',
  },
  // Other dwarf planets. Elements from their Wikipedia infoboxes (JPL Small-Body Database),
  // converted to J2000 mean longitude.
  {
    name: 'Ceres', type: 'Dwarf planet (asteroid belt)', dwarf: true, color: '#9c968c',
    a: 2.7675, e: 0.0785, i: 10.6, L: 163.0939, peri: 153.9, node: 80.3,
    radiusKm: 469.7, tilt: 4, dayHours: 9.074, moons: '0',
    texture: { kind: 'rocky', colors: ['#4d4a45', '#a8a296'], seed: 111, freq: 5, w: 256 },
    description: 'The largest object in the asteroid belt and the only dwarf planet in the inner solar system. NASA\'s Dawn spacecraft found bright salt deposits in its craters.',
  },
  {
    name: 'Haumea', type: 'Dwarf planet (Kuiper belt)', dwarf: true, color: '#e6e2da',
    a: 43.116, e: 0.19642, i: 28.2137, L: 192.7611, peri: 1.208, node: 122.167,
    radiusKm: 780, tilt: 0, dayHours: 3.915, moons: '2',
    texture: { kind: 'rocky', colors: ['#bdb8ae', '#f4f1ea'], seed: 121, freq: 3, w: 256 },
    description: 'Spins once every 4 hours, so fast that it is stretched into an egg shape. It has a thin ring and two small moons.',
  },
  {
    name: 'Makemake', type: 'Dwarf planet (Kuiper belt)', dwarf: true, color: '#c98e6a',
    a: 45.499, e: 0.1604, i: 29.002, L: 155.6366, peri: 15.506, node: 79.441,
    radiusKm: 715, tilt: 0, dayHours: 22.8, moons: '1',
    texture: { kind: 'rocky', colors: ['#8a4f33', '#e0b090'], seed: 131, freq: 4, w: 256 },
    description: 'A reddish world covered in frozen methane. It was found in 2005 shortly after Easter and is named after the creator god of Easter Island.',
  },
  {
    name: 'Eris', type: 'Dwarf planet (scattered disc)', dwarf: true, color: '#efefef',
    a: 67.864, e: 0.43607, i: 44.04, L: 20.4349, peri: 187.59, node: 35.951,
    radiusKm: 1163, tilt: 0, dayHours: 25.9, moons: '1',
    texture: { kind: 'rocky', colors: ['#c9c9c9', '#ffffff'], seed: 141, freq: 3, w: 256 },
    description: 'Almost the same size as Pluto. Its discovery in 2005 led astronomers to define "dwarf planet" in 2006. Its orbit is tilted 44° and very stretched.',
  },
];

// Moons, grouped under their planet. aKm: distance from the planet, period: days
// (negative = goes round backwards). Distances are compressed in the app so the
// moons stay visible, and where along its orbit each moon starts is illustrative.
const m = (name, parent, radiusKm, aKm, period, color, description, extra = {}) => ({
  name, parent, radiusKm, aKm, period, color, description, type: `Moon of ${parent}`,
  texture: { kind: 'rocky', colors: [extra.dark || '#3e3e3e', color], seed: name.length * 7 + Math.round(radiusKm) % 97, freq: 4, w: 128 },
  ...extra,
});
export const MOONS = [
  m('Phobos', 'Mars', 11.1, 9376, 0.31891, '#8f7d6c', 'The larger of Mars\'s two small moons. It is slowly spiralling inwards and will break apart in about 50 million years.'),
  m('Deimos', 'Mars', 6.2, 23463, 1.26244, '#a39282', 'Mars\'s smaller, outer moon, probably a captured asteroid.'),
  m('Amalthea', 'Jupiter', 83.5, 181366, 0.498, '#b05a3a', 'A small, very red moon inside Io\'s orbit.'),
  m('Io', 'Jupiter', 1821.6, 421700, 1.769, '#e8d36a', 'The most volcanic world known, with hundreds of active volcanoes heated by Jupiter\'s tides.', { dark: '#b0702a' }),
  m('Europa', 'Jupiter', 1560.8, 671034, 3.551, '#d9cdb8', 'Its icy crust hides a salty ocean with more water than all of Earth\'s oceans.', { dark: '#8a6a4a' }),
  m('Ganymede', 'Jupiter', 2634.1, 1070412, 7.155, '#a89f92', 'The largest moon in the solar system, bigger than Mercury, with its own magnetic field.'),
  m('Callisto', 'Jupiter', 2410.3, 1882709, 16.689, '#7d7468', 'One of the most heavily cratered surfaces in the solar system.', { dark: '#3a352f' }),
  m('Himalia', 'Jupiter', 85, 11461000, 250.6, '#8c8478', 'The largest of Jupiter\'s far-out irregular moons, probably a captured asteroid.'),
  m('Mimas', 'Saturn', 198.2, 185539, 0.942, '#c8c8c8', 'Its giant Herschel crater makes it look like the Death Star.'),
  m('Enceladus', 'Saturn', 252.1, 237948, 1.37, '#f4f8ff', 'Sprays water from a hidden ocean out of cracks near its south pole.', { dark: '#c8d4e4' }),
  m('Tethys', 'Saturn', 531.1, 294619, 1.888, '#e2e2e2', 'Made almost entirely of water ice.'),
  m('Dione', 'Saturn', 561.4, 377396, 2.737, '#d4d4d4', 'Covered in bright ice cliffs.'),
  m('Rhea', 'Saturn', 763.8, 527108, 4.518, '#cfcfcf', 'Saturn\'s second-largest moon, an icy, cratered world.'),
  m('Titan', 'Saturn', 2574.7, 1221870, 15.945, '#e0a24a', 'The only moon with a thick atmosphere, and lakes of liquid methane on its surface.', { dark: '#a0662a' }),
  m('Hyperion', 'Saturn', 135, 1481010, 21.28, '#b8a68e', 'A sponge-like moon that tumbles chaotically.'),
  m('Iapetus', 'Saturn', 734.5, 3560820, 79.32, '#bdb5a8', 'One side is as dark as coal, the other as bright as snow.', { dark: '#2a2420' }),
  m('Phoebe', 'Saturn', 106.5, 12929400, -550.3, '#5e5a55', 'A dark captured object that orbits Saturn backwards.'),
  m('Miranda', 'Uranus', 235.8, 129390, 1.413, '#b8b8b8', 'Has some of the tallest cliffs known, up to 20 km high.'),
  m('Ariel', 'Uranus', 578.9, 191020, 2.52, '#c4c4c4', 'The brightest of Uranus\'s large moons.'),
  m('Umbriel', 'Uranus', 584.7, 266300, 4.144, '#7a7a7a', 'The darkest of Uranus\'s large moons.'),
  m('Titania', 'Uranus', 788.4, 435910, 8.706, '#b0aaa2', 'Uranus\'s largest moon.'),
  m('Oberon', 'Uranus', 761.4, 583520, 13.46, '#a09890', 'The outermost large moon of Uranus, heavily cratered.'),
  m('Proteus', 'Neptune', 210, 117647, 1.122, '#6e6a66', 'One of the darkest objects in the solar system.'),
  m('Triton', 'Neptune', 1353.4, 354759, -5.877, '#d8c8c0', 'Orbits backwards, so it was probably captured from the Kuiper belt. It has nitrogen geysers.', { dark: '#9a8278' }),
  m('Nereid', 'Neptune', 178, 5513818, 360.1, '#9a9690', 'Has one of the most stretched orbits of any moon.'),
  m('Charon', 'Pluto', 606, 19591, 6.387, '#a8a39c', 'So large compared with Pluto that the two orbit a point in the space between them.'),
  m('Nix', 'Pluto', 25, 48694, 24.85, '#d0d0d0', 'A small moon of Pluto.'),
  m('Hydra', 'Pluto', 25, 64738, 38.2, '#d0d0d0', 'Pluto\'s outermost known moon.'),
  m('Dysnomia', 'Eris', 350, 37300, 15.79, '#7a7a7a', 'Eris\'s only known moon. Its orbit let astronomers weigh Eris.'),
];

// The two belts of small bodies, drawn as clouds of particles (illustrative dots, not real objects).
export const BELTS = [
  {
    name: 'Asteroid belt', type: 'Region of small rocky bodies', color: '#b8ab96',
    inner: 2.1, outer: 3.3, maxI: 15, maxE: 0.15, count: 4000, labelAt: 2.7,
    facts: [['Distance from Sun', '2.1 – 3.3 AU', 'between Mars and Jupiter'], ['Known objects', 'over 1.3 million'], ['Total mass', '≈ 3% of the Moon\'s']],
    description: 'Millions of rocky fragments left over from the formation of the planets, between Mars and Jupiter. Ceres, Vesta, Pallas and Hygiea hold about half of its mass. The dots here show where the belt is; they are not real asteroids.',
  },
  {
    name: 'Kuiper belt', type: 'Region of icy bodies beyond Neptune', color: '#9fc4e8',
    inner: 30, outer: 50, peak: [42, 48], maxI: 20, maxE: 0.15, count: 7000, labelAt: 45,
    facts: [['Distance from Sun', '30 – 50 AU', 'beyond Neptune'], ['Known objects', 'over 3,000'], ['Dwarf planets', 'Pluto, Haumea, Makemake']],
    description: 'A huge ring of icy bodies beyond Neptune: home to Pluto, Haumea and Makemake, and the source of many comets. The search for a hidden "Planet X" uses the odd orbits of its farthest members. The dots here show where the belt is; they are not real objects.',
  },
];


export const MOON = {
  name: 'Moon', type: 'Natural satellite of Earth', color: '#cfcfcf',
  radiusKm: 1737.4, periodDays: 27.321661, L0: 218.316, inclination: 5.145,
  texture: { kind: 'rocky', colors: ['#5e5e5e', '#c8c8c8'], seed: 99, freq: 4 },
  facts: [
    ['Radius', '1,737 km'],
    ['Distance from Earth', '≈ 384,400 km'],
    ['Orbital speed', '≈ 1.02 km/s'],
    ['Day length', '27.3 days'],
    ['Orbital period', '27.3 days'],
  ],
  description: 'Earth\'s only natural satellite. It always shows the same face to Earth. (Its distance from Earth is exaggerated here so it can be seen.)',
};
