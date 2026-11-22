/**
 * The home page's solar system: the Sun, the eight planets, the Moon, Pluto, and beyond Pluto the
 * examinations, each on a track of its own. Everything about where things are is worked out here, in
 * plain TypeScript, once per frame; the shader (shaders.ts, SOLAR) only draws what it is told, and the
 * same numbers drive hit-testing, so what you point at is exactly what is drawn.
 *
 * Scale: distances and sizes are compressed so that all nine bodies are visible together (the real
 * Solar System would put Neptune 30 times further out than the Earth and make Mercury a speck);
 * their ORDER, eccentricities, inclinations, axial tilts and relative speeds follow the real ones.
 *   • orbits     J2000 elements (e, i, Ω, ϖ, L0); planets start where they really are today. Each
 *                eccentricity is drawn a little larger than it is (+0.03) so the ellipses read as ellipses
 *   • periods    real ratios, compressed (∝ P^0.5): Mercury laps the Sun in ~40 s, Pluto in ~20 min
 *   • spin       real sense and tilt: Venus and Uranus turn backwards, Uranus rolls on its side
 *
 * World axes: x to the right, y up out of the ecliptic, z towards the viewer. Seen from above,
 * everything goes round anticlockwise (prograde).
 */

export type Vec3 = [number, number, number];

export interface Body {
  key: string;
  name: string;
  kind: "star" | "planet" | "moon" | "dwarf";
  blurb: string;
  r: number; // radius, world units (desktop)
  tilt: number; // axial tilt, degrees
  tiltDir: number; // which way the axis leans (degrees round the ecliptic)
  spin: number; // rad/s, negative = retrograde
  orbit?: { a: number; e: number; i: number; node: number; peri: number; L0: number; P: number };
}

const DEG = Math.PI / 180;

/** Index in this list = index in the shader's arrays. */
export const BODIES: Body[] = [
  { key: "sun", name: "The Sun", kind: "star", r: 1.5, tilt: 7.25, tiltDir: 75, spin: 0.035,
    blurb: "A yellow dwarf star holding 99.8% of the Solar System's mass. Its light reaches Earth in about 8 minutes 20 seconds." },
  { key: "mercury", name: "Mercury", kind: "planet", r: 0.15, tilt: 0.03, tiltDir: 0, spin: 0.06,
    orbit: { a: 2.75, e: 0.2056, i: 7.0, node: 48.33, peri: 77.46, L0: 252.25, P: 0.2408 },
    blurb: "The smallest planet and the closest to the Sun. No moons, no real atmosphere; a year lasts 88 days." },
  { key: "venus", name: "Venus", kind: "planet", r: 0.25, tilt: 177.4, tiltDir: 40, spin: 0.03,
    orbit: { a: 3.65, e: 0.0068, i: 3.39, node: 76.68, peri: 131.6, L0: 181.98, P: 0.6152 },
    blurb: "The hottest planet, under thick clouds of carbon dioxide and sulphuric acid. It spins from east to west." },
  { key: "earth", name: "Earth", kind: "planet", r: 0.27, tilt: 23.44, tiltDir: 210, spin: 0.32,
    orbit: { a: 4.65, e: 0.0167, i: 0, node: 0, peri: 102.94, L0: 100.46, P: 1 },
    blurb: "Our home: the only world known to hold life, with liquid water on 71% of its surface. Its axis leans 23.4°." },
  { key: "moon", name: "The Moon", kind: "moon", r: 0.075, tilt: 6.7, tiltDir: 210, spin: 0,
    blurb: "Earth's only natural satellite. Chandrayaan-3 landed near its south pole in August 2023." },
  { key: "mars", name: "Mars", kind: "planet", r: 0.19, tilt: 25.19, tiltDir: 200, spin: 0.31,
    orbit: { a: 5.6, e: 0.0934, i: 1.85, node: 49.56, peri: 336.04, L0: 355.45, P: 1.8808 },
    blurb: "The Red Planet, rusted by iron oxide, with Olympus Mons, the tallest volcano known. India's Mangalyaan reached it in 2014." },
  { key: "jupiter", name: "Jupiter", kind: "planet", r: 0.78, tilt: 3.13, tiltDir: 200, spin: 0.7,
    orbit: { a: 8.6, e: 0.0484, i: 1.3, node: 100.46, peri: 14.33, L0: 34.4, P: 11.862 },
    blurb: "The largest planet, a gas giant. Its Great Red Spot is a storm wider than the Earth, raging for centuries." },
  { key: "saturn", name: "Saturn", kind: "planet", r: 0.66, tilt: 26.73, tiltDir: 230, spin: 0.64,
    orbit: { a: 10.5, e: 0.0539, i: 2.49, node: 113.66, peri: 92.43, L0: 49.94, P: 29.457 },
    blurb: "The ringed planet: its rings are ice and rock. Less dense than water; Titan is its largest moon." },
  { key: "uranus", name: "Uranus", kind: "planet", r: 0.42, tilt: 97.77, tiltDir: 150, spin: 0.48,
    orbit: { a: 12.4, e: 0.0473, i: 0.77, node: 74.0, peri: 170.95, L0: 313.23, P: 84.011 },
    blurb: "An ice giant that rolls round the Sun on its side, its axis tilted 98°. It also spins from east to west." },
  { key: "neptune", name: "Neptune", kind: "planet", r: 0.41, tilt: 28.32, tiltDir: 220, spin: 0.5,
    orbit: { a: 14.0, e: 0.0086, i: 1.77, node: 131.78, peri: 44.97, L0: 304.88, P: 164.79 },
    blurb: "The farthest planet, a deep-blue ice giant with the fastest winds in the Solar System." },
  { key: "pluto", name: "Pluto", kind: "dwarf", r: 0.12, tilt: 122.5, tiltDir: 180, spin: 0.09,
    orbit: { a: 15.4, e: 0.2, i: 17.16, node: 110.3, peri: 224.07, L0: 238.93, P: 247.94 },
    blurb: "A dwarf planet of the Kuiper Belt (reclassified in 2006), with a heart-shaped plain of nitrogen ice: Tombaugh Regio." },
];
export const SUN = 0, MOON = 4, SATURN = 7, URANUS = 8, PLUTO = 10;
/** The examinations come after the natural bodies: indices FIRST_EXAM … FIRST_EXAM + 2. */
export const FIRST_EXAM = BODIES.length;
export const MAX_EXAMS = 3;
/** Their tracks: beyond Pluto's aphelion, one per examination, in order. */
export const EXAM_TRACK = (k: number) => 19.8 + k * 1.7;
/** The orbit lines the shader draws: one per planet and Pluto, then one per examination. */
export const ORBITING = BODIES.map((b, i) => (b.orbit ? i : -1)).filter((i) => i >= 0);
export const N_ORBITS = ORBITING.length + MAX_EXAMS;

// ── vectors ──
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(...a));

/** Ecliptic (X towards the vernal equinox, Z north) to world. */
const toWorld = (x: number, y: number, z: number): Vec3 => [x, z, -y];

/** An orbit's frame: U towards perihelion, V 90° ahead, N its pole (all in world axes). */
function orbitFrame(o: NonNullable<Body["orbit"]>) {
  const O = o.node * DEG, i = o.i * DEG, w = (o.peri - o.node) * DEG;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
  // the columns of Rz(Ω)·Rx(i)·Rz(ω)
  const U = toWorld(cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si);
  const V = toWorld(-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si);
  const N = toWorld(sO * si, -cO * si, ci);
  return { U, V, N };
}
/** The eccentricity we draw: the real one, opened a little so each orbit reads as an ellipse. */
const ecc = (o: NonNullable<Body["orbit"]>) => Math.min(0.26, o.e + 0.03);
const frames = BODIES.map((b) => (b.orbit ? orbitFrame(b.orbit) : null));

/** A planet's axis: tilted from the ecliptic pole, leaning towards tiltDir. */
const axes: Vec3[] = BODIES.map((b) => {
  const t = b.tilt * DEG, d = b.tiltDir * DEG;
  return norm(toWorld(Math.sin(t) * Math.cos(d), Math.sin(t) * Math.sin(d), Math.cos(t)));
});

/** Visible seconds per orbit: the real ratios, compressed. */
const period = (P: number) => 80 * Math.sqrt(P);

function kepler(M: number, e: number) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Days from J2000 to now, at the moment the page loaded: the planets start where they really are. */
const DAYS = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;

export interface Scene {
  pos: Vec3[]; // centre of each body (natural ones, then the examinations)
  rad: number[];
  axis: Vec3[];
  spin: number[];
  E: number[]; // each orbiter's eccentric anomaly (for the glow along its orbit)
  orbits: { c: Vec3; U: Vec3; V: Vec3; N: Vec3; a: number; b: number; E: number; body: number }[];
}

/** Where everything is, t seconds into the visit. `big` scales the planets up (phones). */
export function bodiesAt(t: number, big = 1): Omit<Scene, "orbits"> & { orbits: Scene["orbits"] } {
  const pos: Vec3[] = [], rad: number[] = [], spin: number[] = [], E: number[] = [];
  const orbits: Scene["orbits"] = [];
  BODIES.forEach((b, i) => {
    rad.push(b.r * (i === SUN ? Math.min(big, 1.3) : big));
    spin.push(b.spin * t);
    if (!b.orbit) {
      pos.push([0, 0, 0]);
      E.push(0);
      return;
    }
    const o = b.orbit, f = frames[i]!;
    const n0 = 360 / (o.P * 365.25); // degrees a day
    const M = ((o.L0 + n0 * DAYS - o.peri) * DEG) + (2 * Math.PI * t) / period(o.P);
    const e = ecc(o);
    const Ei = kepler(M % (2 * Math.PI), e);
    const x = o.a * (Math.cos(Ei) - e), y = o.a * Math.sqrt(1 - e * e) * Math.sin(Ei);
    pos.push(add(mul(f.U, x), mul(f.V, y)));
    E.push(Ei);
    orbits.push({ c: mul(f.U, -o.a * e), U: f.U, V: f.V, N: f.N, a: o.a, b: o.a * Math.sqrt(1 - e * e), E: Ei, body: i });
  });
  // the Moon goes round the Earth (tidally locked: it turns once per orbit)
  const th = (2 * Math.PI * t) / period(27.32 / 365.25) + 1.2;
  const md = 0.62 * big;
  pos[MOON] = add(pos[3], [Math.cos(th) * md, Math.sin(th) * md * 0.09, -Math.sin(th) * md]);
  spin[MOON] = -th;
  return { pos, rad, axis: axes.slice(), spin, E, orbits };
}

// ── the camera ──
export interface Camera {
  pos: Vec3;
  R: Vec3;
  U: Vec3;
  F: Vec3;
  D: number; // distance to the Sun
  zoom: number; // px per world unit at the Sun's distance
  cx: number; // where the Sun is on screen (CSS px, from the top left of the viewport)
  cy: number;
}
export function makeCamera(elev: number, az: number, D: number): Omit<Camera, "zoom" | "cx" | "cy"> {
  const pos: Vec3 = [D * Math.sin(az) * Math.cos(elev), D * Math.sin(elev), D * Math.cos(az) * Math.cos(elev)];
  const F = norm(mul(pos, -1));
  const R = norm(cross(F, [0, 1, 0]));
  const U = cross(R, F);
  return { pos, R, U, F, D };
}
/** Perspective projection to "Sun-distance units" (multiply by zoom for px); depth along the view. */
export function projectRaw(cam: Omit<Camera, "zoom" | "cx" | "cy">, P: Vec3) {
  const v = sub(P, cam.pos), z = dot(v, cam.F);
  return { x: (dot(v, cam.R) / z) * cam.D, y: (dot(v, cam.U) / z) * cam.D, z };
}
export function toScreen(cam: Camera, P: Vec3) {
  const p = projectRaw(cam, P);
  return { x: cam.cx + cam.zoom * p.x, y: cam.cy - cam.zoom * p.y, z: p.z, k: (cam.zoom * cam.D) / p.z };
}

export interface Layout {
  cam: Camera;
  scene: Scene;
  exams: { x: number; y: number; r: number }[]; // on screen, CSS px
}

/**
 * Fit the system to the page: the Sun centred on the stage, the far side of the outermost orbit no
 * higher than `top`, and the examinations' spheres sitting on `front` at the x positions asked for
 * (their plates' centres), each on its own track. Zoom is the largest that satisfies all of it.
 */
export function layout(opts: {
  t: number;
  phone: boolean;
  stageX: number; // centre of the stage, px
  stageW: number;
  top: number;
  front: number;
  targets: number[]; // where the examinations should sit, px across
  examR: number; // their radius on screen, px
  lean: [number, number]; // pointer parallax, -1..1
}): Layout {
  const { phone, targets } = opts;
  const big = phone ? 1.75 : 1.4;
  const base = bodiesAt(opts.t, big);
  const cam0 = makeCamera((phone ? 0.52 : 0.27) + opts.lean[1] * 0.012, -0.32 + opts.lean[0] * 0.02, 70);
  // the bounding box of every orbit, seen from here
  let xmin = 0, xmax = 0, ytop = -1e9;
  base.orbits.forEach((o) => {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const p = projectRaw(cam0, add(o.c, add(mul(o.U, o.a * Math.cos(a)), mul(o.V, o.b * Math.sin(a)))));
      xmin = Math.min(xmin, p.x);
      xmax = Math.max(xmax, p.x);
      ytop = Math.max(ytop, p.y);
    }
  });
  const span = 2 * Math.max(-xmin, xmax);
  const zoomW = (opts.stageW * (phone ? 0.97 : 0.9)) / span;
  let zoom = zoomW, cy = opts.front;
  let exams: { P: Vec3; x: number; y: number; z: number }[] = [];
  const solve = (zoom: number) =>
    targets.map((tx, k) => {
      // along the front half of the track, find where it crosses x = tx on screen
      const r = EXAM_TRACK(k), want = (tx - opts.stageX) / zoom;
      const at = (th: number): Vec3 => [r * Math.cos(th), 0, -r * Math.sin(th)];
      let lo = Math.PI, hi = 2 * Math.PI;
      for (let s = 0; s < 40; s++) {
        const mid = (lo + hi) / 2;
        if (projectRaw(cam0, at(mid)).x < want) lo = mid;
        else hi = mid;
      }
      const P = at((lo + hi) / 2), p = projectRaw(cam0, P);
      return { P, x: p.x, y: p.y, z: p.z };
    });
  for (let pass = 0; pass < 4; pass++) {
    exams = solve(zoom);
    const ybot = exams.length ? Math.min(...exams.map((e) => e.y)) : projectRaw(cam0, [0, 0, EXAM_TRACK(0)]).y;
    const zoomV = (opts.front - opts.top) / Math.max(1, ytop - ybot);
    zoom = Math.min(zoomW, zoomV);
    cy = opts.front + zoom * ybot;
  }
  const cam: Camera = { ...cam0, zoom, cx: opts.stageX, cy };
  // each sphere is as big on screen as the page asked, wherever its track puts it
  const pos = base.pos.slice(), rad = base.rad.slice(), axis = base.axis.slice(), spin = base.spin.slice();
  const out = exams.map((e) => {
    const k = (zoom * cam.D) / e.z;
    pos.push(e.P);
    rad.push(opts.examR / k);
    axis.push([0, 1, 0]);
    spin.push(0);
    return { x: cam.cx + zoom * e.x, y: cam.cy - zoom * e.y, r: opts.examR };
  });
  const orbits = base.orbits.slice();
  for (let k = 0; k < exams.length; k++) {
    const r = EXAM_TRACK(k);
    orbits.push({ c: [0, 0, 0], U: [1, 0, 0], V: [0, 0, -1], N: [0, 1, 0], a: r, b: r, E: -100, body: FIRST_EXAM + k });
  }
  return { cam, scene: { pos, rad, axis, spin, E: base.E, orbits }, exams: out };
}

/** What is under the pointer (CSS px): the nearest body whose disc contains it, with a little slack. */
export function pick(l: Layout, x: number, y: number, slack = 6): number {
  let best = -1, bestZ = Infinity;
  l.scene.pos.forEach((P, i) => {
    const s = toScreen(l.cam, P);
    const r = l.scene.rad[i] * s.k + (i === SUN ? 0 : slack);
    if ((x - s.x) ** 2 + (y - s.y) ** 2 < r * r && s.z < bestZ) {
      best = i;
      bestZ = s.z;
    }
  });
  return best;
}

/**
 * Beyond the Solar System: the other things in the home page's sky, drawn in screen space by the
 * shader (SOLAR) at the places Universe.tsx gives them, with the same labels when pointed at.
 * Index = the shader's uDeep[] slot.
 */
export const DEEP = [
  { key: "andromeda", name: "Andromeda Galaxy (M31)", kind: "Spiral galaxy",
    blurb: "Our nearest large galactic neighbour, about 2.5 million light-years away, with its two small companions M32 and M110. It is the most distant thing the naked eye can see." },
  { key: "nebula", name: "A stellar nursery", kind: "Emission nebula",
    blurb: "A cloud of hydrogen glowing red where new stars are being born, like the Orion Nebula (M42); dark lanes of dust cut through it." },
  { key: "blackhole", name: "A black hole", kind: "Astronomical phenomenon",
    blurb: "Gravity so strong that not even light escapes. Its glowing disc of gas bends round it, and the stars behind are lensed. The first image of one (M87*) came in 2019." },
  { key: "ring", name: "A ring nebula", kind: "Planetary nebula",
    blurb: "The shell of gas a dying Sun-like star throws off, lit by the white dwarf left at its centre, like the Ring Nebula (M57) in Lyra." },
  { key: "pulsar", name: "A pulsar", kind: "Neutron star",
    blurb: "The spinning core of an exploded star, sweeping beams of radiation round like a lighthouse. The first was found by Jocelyn Bell Burnell in 1967." },
] as const;
export interface DeepPlace { x: number; y: number; s: number; a: number } // CSS px; size; angle

/** Where the deep-sky objects go: the right of the stage beside the Solar System, or, on narrow screens, a few in the corners. */
export function deepPlaces(front: DOMRect, head: DOMRect, split: boolean): DeepPlace[] {
  const top = head.bottom, H = Math.max(200, front.bottom - top);
  if (split) {
    const x0 = front.left + front.width * 0.6, W = front.width * 0.4;
    return [
      { x: x0 + W * 0.5, y: top + H * 0.3, s: Math.min(W * 0.46, 270), a: 0.42 },
      { x: x0 + W * 0.6, y: top + H * 0.9, s: W * 0.34, a: 0 },
      { x: x0 + W * 0.8, y: top + H * 0.7, s: 20, a: -0.18 },
      { x: x0 + W * 0.1, y: top + H * 0.56, s: 16, a: 0.5 },
      { x: x0 + W * 0.9, y: top + H * 0.04, s: 26, a: 0 },
    ];
  }
  return [
    { x: front.left + front.width * 0.86, y: head.top + 4, s: Math.min(front.width * 0.17, 150), a: 0.42 },
    { x: 0, y: 0, s: 0, a: 0 },
    { x: 0, y: 0, s: 0, a: 0 },
    { x: front.left + front.width * 0.08, y: head.top + 14, s: 11, a: 0.5 },
    { x: 0, y: 0, s: 0, a: 0 },
  ];
}
/** The reach of each deep-sky object for pointing, as a multiple of its size. */
export const DEEP_REACH = [0.62, 0.55, 3.2, 1.4, 1.2];

/**
 * The refined home page: the whole system, its examination tracks included, fitted into a wide, shallow
 * band behind the page, a distant panorama. The examinations sit at fixed places on their tracks (front
 * left, front, front right) and never move from them; they only turn.
 */
export const EXAM_ANGLES: Record<number, number[]> = { 1: [0], 2: [-0.42, 0.42], 3: [-0.6, 0, 0.6] };
export function layoutBand(opts: {
  t: number;
  phone: boolean;
  band: { x: number; y: number; w: number; h: number }; // CSS px, viewport
  exams: number;
  lean: [number, number];
}): Layout {
  const { phone, band } = opts;
  const big = phone ? 1.45 : 0.9;
  const base = bodiesAt(opts.t, big);
  const cam0 = makeCamera((phone ? 0.4 : 0.2) + opts.lean[1] * 0.01, -0.32 + opts.lean[0] * 0.015, 70);
  const angles = EXAM_ANGLES[opts.exams] ?? [];
  const examP: Vec3[] = angles.map((a, k) => {
    const r = EXAM_TRACK(k), th = 1.5 * Math.PI + a; // 3π/2 is the front, towards us
    return [r * Math.cos(th), 0, -r * Math.sin(th)];
  });
  // the box round everything: every orbit and every examination's track
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const take = (P: Vec3) => {
    const p = projectRaw(cam0, P);
    xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
  };
  base.orbits.forEach((o) => {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      take(add(o.c, add(mul(o.U, o.a * Math.cos(a)), mul(o.V, o.b * Math.sin(a)))));
    }
  });
  for (let k = 0; k < angles.length; k++) {
    for (let j = 0; j < 48; j++) {
      const a = (j / 48) * Math.PI * 2, r = EXAM_TRACK(k);
      take([r * Math.cos(a), 0, -r * Math.sin(a)]);
    }
  }
  const zoom = Math.min((band.w * 0.98) / (xmax - xmin), band.h / (ymax - ymin));
  const cam: Camera = {
    ...cam0, zoom,
    cx: band.x + band.w / 2 - (zoom * (xmax + xmin)) / 2,
    cy: band.y + band.h / 2 + (zoom * (ymax + ymin)) / 2,
  };
  const pos = base.pos.slice(), rad = base.rad.slice(), axis = base.axis.slice(), spin = base.spin.slice();
  const orbits = base.orbits.slice();
  const exams = examP.map((P, k) => {
    pos.push(P);
    rad.push((phone ? 0.85 : 0.62) * (big / 0.9));
    axis.push([0, 1, 0]);
    spin.push(0);
    const r = EXAM_TRACK(k);
    orbits.push({ c: [0, 0, 0], U: [1, 0, 0], V: [0, 0, -1], N: [0, 1, 0], a: r, b: r, E: -100, body: FIRST_EXAM + k });
    const s = toScreen(cam, P);
    return { x: s.x, y: s.y, r: rad[rad.length - 1] * s.k };
  });
  return { cam, scene: { pos, rad, axis, spin, E: base.E, orbits }, exams };
}

/** The deep-sky objects for the refined home page: small, faint, at the edges of the band and above it. */
export function deepPlacesBand(band: { x: number; y: number; w: number; h: number }, phone: boolean): DeepPlace[] {
  const { x, y, w, h } = band;
  if (phone) {
    return [
      { x: x + w * 0.86, y: y - h * 0.15, s: Math.min(w * 0.15, 70), a: 0.42 },
      { x: 0, y: 0, s: 0, a: 0 },
      { x: 0, y: 0, s: 0, a: 0 },
      { x: x + w * 0.08, y: y + h * 0.05, s: 7, a: 0.5 },
      { x: 0, y: 0, s: 0, a: 0 },
    ];
  }
  return [
    { x: x + w * 0.9, y: y - h * 0.55, s: Math.min(w * 0.085, 135), a: 0.42 }, // Andromeda, high on the right
    { x: x + w * 0.02, y: y + h * 0.2, s: w * 0.09, a: 0 }, // a faint nursery at the far left
    { x: x + w * 0.955, y: y + h * 0.62, s: 8, a: -0.18 }, // a small black hole at the far right
    { x: x + w * 0.06, y: y - h * 0.62, s: 9, a: 0.5 }, // a ring nebula high on the left
    { x: x + w * 0.18, y: y - h * 0.95, s: 14, a: 0 }, // a pulsar, far off
  ];
}
