/**
 * The Moon's phase, computed: where the Moon and the Sun really are on a given instant, and so how much
 * of the Moon is lit, which way the lit side faces, how old the lunation is and when the next New and
 * Full Moons fall.
 *
 * Method: Jean Meeus, Astronomical Algorithms (2nd ed., 1998)
 *   ch. 7   Julian Day
 *   ch. 10  ΔT (TT − UT), Espenak & Meeus polynomials
 *   ch. 13  ecliptic → equatorial
 *   ch. 25  the Sun's apparent longitude and distance
 *   ch. 47  the Moon's longitude, latitude and distance (the principal periodic terms of ELP-2000/82)
 *   ch. 48  phase angle, illuminated fraction, position angle of the bright limb
 *   ch. 53  optical libration
 * The principal phases are found by solving for the instant when the Moon's elongation from the Sun is
 * exactly 0°, 90°, 180° or 270°: every lunation has its own length (29.27 to 29.83 days), nothing here
 * assumes a fixed month. Accuracy: the Moon's position to ~0.01°, phase instants to a few minutes.
 */

const RAD = Math.PI / 180;
const AU_KM = 149597870.7;
const SYNODIC = 29.530588853; // mean synodic month, days: only a first guess for the solver

const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const norm180 = (d: number) => {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
};

/** Julian Day (UT) of a JavaScript instant. */
export const julianDay = (t: Date) => t.getTime() / 86400000 + 2440587.5;

/** ΔT = TT − UT in seconds (Espenak & Meeus 2006), good from 1900 to 2150. */
export function deltaT(year: number): number {
  const y = year;
  if (y < 1920) { const t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { const t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (y < 1961) { const t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y < 1986) { const t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  if (y < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  return -20 + 32 * ((y - 1820) / 100) ** 2;
}

/** Julian centuries of TT since J2000.0. */
function centuries(t: Date) {
  const year = t.getUTCFullYear() + t.getUTCMonth() / 12;
  return (julianDay(t) + deltaT(year) / 86400 - 2451545) / 36525;
}

// Meeus table 47.A: multiples of D, M, M′, F; Σl (1e-6°), Σr (1e-3 km)
const LR: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];
// Meeus table 47.B: multiples of D, M, M′, F; Σb (1e-6°)
const B: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
];

/** The Moon (ch. 47): geometric ecliptic longitude and latitude (°), distance (km), and the arguments used elsewhere. */
export function moonPosition(T: number) {
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T ** 2 + T ** 3 / 538841 - T ** 4 / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T ** 2 + T ** 3 / 545868 - T ** 4 / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T ** 2 - T ** 3 / 3526000 + T ** 4 / 863310000);
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = d * D + m * M + mp * Mp + f * F, e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sl += l * e * sin(arg);
    sr += r * e * cos(arg);
  }
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sb += b * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
  const Omega = norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T ** 2 + T ** 3 / 467441);
  return { lambda: norm360(Lp + sl / 1e6), beta: sb / 1e6, dist: 385000.56 + sr / 1000, F, Omega };
}

/** The Sun (ch. 25): apparent longitude (°) and distance (km). */
export function sunPosition(T: number) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T ** 2;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T ** 2;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T ** 2;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T ** 2) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const nu = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cos(nu));
  const Omega = 125.04 - 1934.136 * T;
  return { lambda: norm360(L0 + C - 0.00569 - 0.00478 * sin(Omega)), dist: R * AU_KM };
}

/** Ecliptic → equatorial (ch. 13): right ascension and declination, degrees. */
function equatorial(lambda: number, beta: number, T: number) {
  const eps = 23.4392911 - 0.0130042 * T;
  const ra = Math.atan2(sin(lambda) * cos(eps) - Math.tan(beta * RAD) * sin(eps), cos(lambda)) / RAD;
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda)) / RAD;
  return { ra, dec };
}

/** The Moon's elongation east of the Sun, 0–360°: 0 New, 90 First Quarter, 180 Full, 270 Last Quarter. */
export function elongation(t: Date) {
  const T = centuries(t);
  return norm360(moonPosition(T).lambda - sunPosition(T).lambda);
}

export interface MoonState {
  at: Date;
  elongation: number; // °, east of the Sun
  phaseAngle: number; // °, Sun–Moon–Earth: 0 = full, 180 = new
  illuminated: number; // 0..1
  waxing: boolean;
  brightLimb: number; // position angle of the bright limb, ° from celestial north towards east
  distance: number; // km, centre to centre
  libration: { lon: number; lat: number }; // optical libration, °
  axis: number; // position angle of the Moon's axis (its north pole), ° from celestial north towards east
}

/** Everything about the Moon's appearance at one instant (ch. 47, 48, 53). */
export function moonState(at: Date): MoonState {
  const T = centuries(at);
  const m = moonPosition(T), s = sunPosition(T);
  const cosPsi = cos(m.beta) * cos(m.lambda - s.lambda);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) / RAD;
  const i = Math.atan2(s.dist * sin(psi), m.dist - s.dist * cos(psi)) / RAD;
  const mq = equatorial(m.lambda, m.beta, T), sq = equatorial(s.lambda, 0, T);
  const chi = Math.atan2(cos(sq.dec) * sin(sq.ra - mq.ra), sin(sq.dec) * cos(mq.dec) - cos(sq.dec) * sin(mq.dec) * cos(sq.ra - mq.ra)) / RAD;
  // optical libration (ch. 53): which part of the Moon is turned towards us
  const I = 1.54242, W = m.lambda - m.Omega;
  const A = Math.atan2(sin(W) * cos(m.beta) * cos(I) - sin(m.beta) * sin(I), cos(W) * cos(m.beta)) / RAD;
  const elong = norm360(m.lambda - s.lambda);
  const lat = Math.asin(-sin(W) * cos(m.beta) * sin(I) - sin(m.beta) * cos(I)) / RAD;
  // the axis's position angle (ch. 53, optical part: physical libration ≤ 0.04° is left out)
  const eps = 23.4392911 - 0.0130042 * T;
  const X = sin(I) * sin(m.Omega), Y = sin(I) * cos(m.Omega) * cos(eps) - cos(I) * sin(eps);
  const omega = Math.atan2(X, Y) / RAD;
  const P = Math.asin(Math.min(1, (Math.hypot(X, Y) * cos(mq.ra - omega)) / cos(lat))) / RAD;
  return {
    at,
    elongation: elong,
    phaseAngle: i,
    illuminated: (1 + cos(i)) / 2,
    waxing: elong < 180,
    brightLimb: norm360(chi),
    distance: m.dist,
    libration: { lon: norm180(A - m.F), lat },
    axis: P,
  };
}

/** The instant nearest `near` when the elongation is exactly `target` (°), by Newton's method on the real motion. */
export function solvePhase(target: number, near: Date): Date {
  let t = near.getTime();
  for (let k = 0; k < 12; k++) {
    const f = norm180(elongation(new Date(t)) - target);
    const h = 3600000; // the elongation's rate, measured over an hour either side
    const rate = norm180(elongation(new Date(t + h)) - elongation(new Date(t - h))) / (2 * h);
    t -= f / rate;
    if (Math.abs(f) < 1e-7) break;
  }
  return new Date(t);
}

/** The next time (after `from`) the elongation reaches `target`. */
export function nextPhase(target: number, from: Date): Date {
  const ahead = norm360(target - elongation(from));
  let t = solvePhase(target, new Date(from.getTime() + (ahead / 360) * SYNODIC * 86400000));
  if (t.getTime() <= from.getTime()) t = solvePhase(target, new Date(t.getTime() + SYNODIC * 86400000));
  return t;
}
/** The last time (at or before `from`) the elongation was `target`. */
export function previousPhase(target: number, from: Date): Date {
  const behind = norm360(elongation(from) - target);
  let t = solvePhase(target, new Date(from.getTime() - (behind / 360) * SYNODIC * 86400000));
  if (t.getTime() > from.getTime()) t = solvePhase(target, new Date(t.getTime() - SYNODIC * 86400000));
  return t;
}

export const PHASES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
] as const;
export type PhaseName = (typeof PHASES)[number];

export interface LunarReport extends MoonState {
  phase: PhaseName;
  exact?: Date; // when the principal phase is exact, if it falls on this day
  age: number; // days since the last New Moon
  lunation: number; // length of this lunation, days
  previousNew: Date;
  nextNew: Date;
  nextFull: Date;
}

/**
 * The Moon for one local calendar day, as an almanac gives it: the four principal phases (New, First
 * Quarter, Full, Last Quarter) are instants, and a day is named after one when that instant falls within
 * it (local midnight to midnight); every other day is a crescent or a gibbous Moon, waxing or waning.
 * `at` is the moment the figures are for; `dayStart`/`dayEnd` bound its local calendar day.
 */
export function lunarReport(at: Date, dayStart: Date, dayEnd: Date): LunarReport {
  const s = moonState(at);
  const previousNew = previousPhase(0, at);
  const nextNew = nextPhase(0, at);
  const nextFull = nextPhase(180, at);
  let phase: PhaseName = PHASES[s.elongation < 90 ? 1 : s.elongation < 180 ? 3 : s.elongation < 270 ? 5 : 7];
  let exact: Date | undefined;
  for (const [k, target] of [0, 90, 180, 270].entries()) {
    const ev = solvePhase(target, new Date(at.getTime() + (norm180(target - s.elongation) / 360) * SYNODIC * 86400000));
    if (ev >= dayStart && ev < dayEnd) {
      phase = PHASES[k * 2];
      exact = ev;
    }
  }
  return {
    ...s,
    phase,
    exact,
    age: (at.getTime() - previousNew.getTime()) / 86400000,
    lunation: (nextNew.getTime() - previousNew.getTime()) / 86400000,
    previousNew,
    nextNew,
    nextFull,
  };
}
