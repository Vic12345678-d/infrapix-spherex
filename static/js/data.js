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
