// Keplerian orbit maths. Positions are heliocentric ecliptic coordinates in AU.

export const DEG = Math.PI / 180;
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const AU_KM = 149597870.7;
const GM_SUN = 1.32712440018e11; // km^3 / s^2

export const periodDays = (p) => 365.25 * Math.pow(p.a, 1.5);

export function meanAnomaly(p, days) {
  const n = 360 / periodDays(p); // deg / day
  const M = (p.L - p.peri + n * days) % 360;
  return (M < 0 ? M + 360 : M) * DEG;
}

export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// Position for a given eccentric anomaly E.
export function positionFromE(p, E) {
  const xp = p.a * (Math.cos(E) - p.e);
  const yp = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
  const w = (p.peri - p.node) * DEG, O = p.node * DEG, I = p.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  };
}

export function positionAt(p, days) {
  return positionFromE(p, solveKepler(meanAnomaly(p, days), p.e));
}

export function positionAtMeanAnomaly(p, M) {
  return positionFromE(p, solveKepler(M, p.e));
}

// Vis-viva equation: orbital speed in km/s at distance r (AU).
export function orbitalSpeed(p, rAu) {
  return Math.sqrt(GM_SUN * (2 / (rAu * AU_KM) - 1 / (p.a * AU_KM)));
}
