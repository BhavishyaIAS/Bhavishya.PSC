/**
 * One 3D backdrop per kind of page. Each scene says something about where the
 * learner is: an open book on the home page, a secretariat for the commission,
 * a stupa for history, a globe for geography, the Ashoka Chakra for polity…
 */
import {
  BLUE, GOLD, GREEN, INK, PAPER, RED, VIOLET,
  box, dome, extrude, frustum, item, merge, polyline, ring, rotate, seeded, sheet, wireSphere,
  type Item, type Mesh, type Scene, type V3,
} from "./engine";

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;

/** Gentle bobbing and tumbling, as if weightless. */
function float(it: Item, amp = 0.07, speed = 0.6, rate: V3 = [0.08, 0.16, 0.05]): Item {
  const p0 = [...it.pos] as V3, r0 = [...it.rot] as V3, phase = it.pos[0] * 3.1 + it.pos[2] * 5.3;
  it.tick = (o, t) => {
    o.pos[1] = p0[1] + Math.sin(t * speed + phase) * amp;
    o.rot = [r0[0] + t * rate[0], r0[1] + t * rate[1], r0[2] + t * rate[2]];
  };
  return it;
}

/** A closed book: coloured cover around a block of pages. */
function book(pos: V3, rot: V3, color: number, w = 0.52, h = 0.1, d = 0.38): Item[] {
  const cover = merge([box(w, 0.014, d), [0, h / 2, 0]], [box(w, 0.014, d), [0, -h / 2, 0]], [box(0.014, h, d), [-w / 2, 0, 0]]);
  const pages = merge([box(w - 0.04, h - 0.016, d - 0.04), [0.008, 0, 0]]);
  return [
    float(item({ mesh: pages, color: PAPER, pos: [...pos] as V3, rot: [...rot] as V3 })),
    float(item({ mesh: cover, color, pos: [...pos] as V3, rot: [...rot] as V3 })),
  ];
}

/** A sheet of ruled paper. */
function paper(w = 0.44, h = 0.58): Mesh {
  const lines: [Mesh][] = [];
  for (let y = h / 2 - 0.1; y > -h / 2 + 0.06; y -= 0.075) lines.push([polyline([[-w / 2 + 0.06, y, 0], [w / 2 - 0.06, y, 0]])]);
  return merge([sheet(w, h)], ...lines);
}

/** Points drifting upwards in a widening spiral. */
function risingSparks(n: number, color: number, seed: number, base = -0.6, height = 2.1, spread = 0.75): Item {
  const rnd = seeded(seed);
  const seeds = Array.from({ length: n }, () => [rnd(), rnd(), rnd()]);
  const pts: V3[] = seeds.map(() => [0, 0, 0]);
  return item({
    pts,
    color,
    size: 2.2,
    alpha: 0.9,
    tick: (_, t) =>
      seeds.forEach((s, i) => {
        const y = (s[0] + t * (0.04 + s[1] * 0.05)) % 1;
        const a = s[2] * TAU + t * 0.4 + y * 4;
        const r = 0.12 + y * spread;
        pts[i] = [Math.cos(a) * r, base + y * height, Math.sin(a) * r];
      }),
  });
}

const circlePts = (r: number, n: number, y = 0): V3[] =>
  Array.from({ length: n }, (_, i): V3 => [Math.cos((i / n) * TAU) * r, y, Math.sin((i / n) * TAU) * r]);

// ───────────────────────────── scenes ─────────────────────────────

/** Home: an open book, knowledge rising from it, books in orbit. */
function home(): Scene {
  const page = box(0.8, 0.06, 1.08);
  const ruled = merge(...Array.from({ length: 7 }, (_, i): [Mesh] => [polyline([[-0.28, 0.035, -0.4 + i * 0.13], [0.28, 0.035, -0.4 + i * 0.13]])]));
  const items: Item[] = [
    item({ mesh: box(0.86, 0.03, 1.14), color: RED, pos: [-0.42, -0.8, 0], rot: [0, 0, 0.2] }),
    item({ mesh: box(0.86, 0.03, 1.14), color: RED, pos: [0.42, -0.8, 0], rot: [0, 0, -0.2] }),
    item({ mesh: page, color: PAPER, pos: [-0.41, -0.75, 0], rot: [0, 0, 0.2] }),
    item({ mesh: page, color: PAPER, pos: [0.41, -0.75, 0], rot: [0, 0, -0.2] }),
    item({ mesh: ruled, color: INK, pos: [-0.41, -0.75, 0], rot: [0, 0, 0.2], alpha: 0.4 }),
    item({ mesh: ruled, color: INK, pos: [0.41, -0.75, 0], rot: [0, 0, -0.2], alpha: 0.4 }),
    risingSparks(64, GOLD, 7),
    risingSparks(30, BLUE, 19, -0.6, 2.3, 0.95),
    item({ mesh: ring(1.55), color: INK, alpha: 0.3, rot: [0.28, 0, 0.14] }),
    item({ mesh: ring(1.2), color: INK, alpha: 0.2, rot: [-0.2, 0, -0.1], pos: [0, 0.25, 0] }),
  ];
  const colours = [BLUE, VIOLET, GREEN, RED, GOLD];
  colours.forEach((c, i) => {
    const a = (i / colours.length) * TAU;
    items.push(...book([Math.cos(a) * 1.45, 0.1 + Math.sin(i * 1.7) * 0.45, Math.sin(a) * 1.45], [0.3 * i, a, 0.2 * (i - 2)], c));
  });
  return { items, spin: 0.14, tilt: -0.34 };
}

/** Commission: a pillared secretariat with its flag — the service the learner is preparing to join. */
function institution(): Scene {
  const columns: [Mesh, V3][] = [];
  for (let i = 0; i < 6; i++)
    for (const z of [-0.42, 0.42]) columns.push([frustum(8, 0.07, 0.058, 0.82, -0.5), [-0.8 + i * 0.32, 0, z]]);
  const flag = item({ mesh: sheet(0.34, 0.2), color: GOLD, ds: true, pos: [0.17, 1.2, 0] });
  flag.tick = (o, t) => {
    o.rot[1] = Math.sin(t * 1.6) * 0.35;
    o.pos[0] = 0.17 * Math.cos(o.rot[1]);
    o.pos[2] = -0.17 * Math.sin(o.rot[1]);
  };
  return {
    items: [
      item({ mesh: merge([box(2.5, 0.08, 1.6), [0, -0.74, 0]], [box(2.3, 0.08, 1.4), [0, -0.66, 0]], [box(2.1, 0.08, 1.2), [0, -0.58, 0]]), color: PAPER }),
      item({ mesh: box(1.5, 0.8, 0.6), color: BLUE, pos: [0, -0.12, 0], alpha: 0.55 }),
      item({ mesh: merge(...columns), color: PAPER }),
      item({ mesh: box(2.08, 0.12, 1.16), color: PAPER, pos: [0, 0.38, 0] }),
      item({ mesh: extrude([[-1.1, 0], [1.1, 0], [0, 0.42]], 1.16), color: RED, pos: [0, 0.44, 0] }),
      item({ mesh: polyline([[0, 0.86, 0], [0, 1.32, 0]]), color: INK, size: 1.6 }),
      flag,
      item({ pts: circlePts(1.95, 44, -0.74), color: BLUE, size: 1.8, alpha: 0.7 }),
      item({ mesh: ring(1.95), color: INK, alpha: 0.18, pos: [0, -0.74, 0] }),
    ],
    spin: 0.11,
    tilt: -0.24,
  };
}

/** Notes: a weightless library — books and loose pages. */
function library(): Scene {
  const rnd = seeded(42);
  const items: Item[] = [];
  const colours = [RED, BLUE, VIOLET, GREEN, GOLD, BLUE, RED];
  colours.forEach((c) => {
    items.push(...book([rnd() * 3.2 - 1.6, rnd() * 1.9 - 0.95, rnd() * 2 - 1], [rnd() * TAU, rnd() * TAU, rnd() * 0.6], c));
  });
  for (let i = 0; i < 5; i++)
    items.push(
      float(
        item({ mesh: paper(), color: PAPER, ds: true, alpha: 0.9, pos: [rnd() * 3 - 1.5, rnd() * 1.8 - 0.9, rnd() * 2 - 1], rot: [rnd() * TAU, rnd() * TAU, 0] }),
        0.1,
        0.5,
        [0.12, 0.2, 0.06],
      ),
    );
  items.push(item({ mesh: ring(1.9), color: INK, alpha: 0.16, rot: [0.3, 0, 0.1] }));
  return { items, spin: 0.05, tilt: -0.15 };
}

/** History: a stupa with its railing and an Ashokan pillar. */
function history(): Scene {
  const posts = merge(...circlePts(1.12, 20).map((p): [Mesh] => [polyline([[p[0], -0.75, p[2]], [p[0], -0.58, p[2]]])]));
  return {
    items: [
      item({ mesh: merge([frustum(20, 0.98, 0.98, 0.16, -0.75)], [frustum(20, 0.8, 0.8, 0.14, -0.59)]), color: PAPER }),
      item({ mesh: dome(20, 0.72, 4), color: PAPER, pos: [0, -0.45, 0] }),
      item({ mesh: box(0.26, 0.16, 0.26), color: RED, pos: [0, 0.35, 0] }),
      item({
        mesh: merge([frustum(6, 0.02, 0.02, 0.52, 0.43)], [frustum(14, 0.2, 0.2, 0.03, 0.56)], [frustum(14, 0.15, 0.15, 0.03, 0.69)], [frustum(14, 0.1, 0.1, 0.03, 0.82)]),
        color: GOLD,
      }),
      item({ mesh: merge([ring(1.12), [0, -0.58, 0]], [ring(1.12), [0, -0.66, 0]], [posts]), color: INK, alpha: 0.5 }),
      item({ mesh: merge([frustum(10, 0.07, 0.055, 1.25, -0.75)], [frustum(10, 0.055, 0.11, 0.08, 0.5)], [frustum(10, 0.12, 0.12, 0.05, 0.58)]), color: PAPER, pos: [1.5, 0, 0.3] }),
      item({ mesh: dome(8, 0.09, 3, true), color: GOLD, pos: [1.5, 0.72, 0.3] }),
      item({ pts: circlePts(1.85, 60, -0.75), color: RED, size: 1.7, alpha: 0.6 }),
    ],
    spin: 0.1,
    tilt: -0.22,
  };
}

/** Geography: the globe, turning on its tilted axis, with Andhra Pradesh pinned. */
function geography(): Scene {
  const rnd = seeded(11);
  const onSphere = (lat: number, lon: number, r: number): V3 => [Math.cos(lat) * Math.cos(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.sin(lon) * r];
  const land: V3[] = [];
  for (let c = 0; c < 10; c++) {
    const lat = (rnd() - 0.5) * 2.2, lon = rnd() * TAU, size = 0.18 + rnd() * 0.3;
    for (let i = 0; i < 26; i++) land.push(onSphere(lat + (rnd() - 0.5) * size, lon + (rnd() - 0.5) * size * 1.6, 1.01));
  }
  const ap = onSphere(0.28, 1.4, 1);
  const turn = (o: Item, t: number) => {
    o.rot = [0, t * 0.22, 0.41];
  };
  const orbit: V3 = [0.5, 0, 0.2];
  const satellite = item({ mesh: box(0.1, 0.05, 0.05), color: GOLD });
  satellite.tick = (o, t) => {
    o.pos = rotate([Math.cos(t * 0.5) * 1.5, 0, Math.sin(t * 0.5) * 1.5], orbit);
    o.rot = [0, -t * 0.5, 0];
  };
  return {
    items: [
      item({ mesh: dome(18, 0.97, 5, true), color: BLUE, alpha: 0.24, tick: turn }),
      item({ mesh: wireSphere(1, 8, 12), color: INK, alpha: 0.4, tick: turn }),
      item({ pts: land, color: GREEN, size: 1.9, tick: turn }),
      item({ mesh: polyline([ap, [ap[0] * 1.2, ap[1] * 1.2, ap[2] * 1.2]]), color: RED, line: RED, size: 2, tick: turn }),
      item({ pts: [[ap[0] * 1.22, ap[1] * 1.22, ap[2] * 1.22]], color: RED, size: 5, tick: turn }),
      item({ mesh: ring(1.5), color: INK, alpha: 0.28, rot: orbit }),
      satellite,
    ],
    spin: 0.03,
    tilt: -0.14,
  };
}

/** Polity: the Ashoka Chakra — 24 spokes, turning. */
function polity(): Scene {
  const spokes = merge(
    ...Array.from({ length: 24 }, (_, i): [Mesh] => {
      const a = (i / 24) * TAU;
      return [polyline([[Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], [Math.cos(a) * 0.87, 0, Math.sin(a) * 0.87]])];
    }),
  );
  const turn = (o: Item, t: number) => {
    o.rot = [HALF, 0, t * 0.22];
  };
  const rnd = seeded(5);
  const dust = Array.from({ length: 36 }, () => [rnd() * TAU, 1.25 + rnd() * 0.5, (rnd() - 0.5) * 1.2, 0.1 + rnd() * 0.2]);
  const dustPts: V3[] = dust.map(() => [0, 0, 0]);
  return {
    items: [
      item({ mesh: frustum(48, 1, 1, 0.12, -0.06, false), color: BLUE, ds: true, alpha: 0.9, tick: turn }),
      item({ mesh: frustum(48, 0.88, 0.88, 0.12, -0.06, false), color: BLUE, ds: true, alpha: 0.6, tick: turn }),
      item({ mesh: frustum(18, 0.17, 0.17, 0.16, -0.08), color: BLUE, tick: turn }),
      item({ mesh: merge([spokes, [0, 0.05, 0]], [spokes, [0, -0.05, 0]]), color: BLUE, line: BLUE, size: 1.8, tick: turn }),
      item({ mesh: merge([ring(1), [0, 0.06, 0]], [ring(1), [0, -0.06, 0]], [ring(0.88), [0, 0.06, 0]]), color: INK, alpha: 0.5, tick: turn }),
      item({ pts: circlePts(0.94, 24), color: PAPER, size: 2.4, tick: turn }),
      item({ mesh: ring(1.45), color: INK, alpha: 0.2, rot: [0.4, 0, 0.2] }),
      item({
        pts: dustPts,
        color: GOLD,
        size: 1.8,
        alpha: 0.8,
        tick: (_, t) => dust.forEach((d, i) => (dustPts[i] = [Math.cos(d[0] + t * d[3]) * d[1], d[2], Math.sin(d[0] + t * d[3]) * d[1]])),
      }),
    ],
    spin: 0.16,
    tilt: -0.1,
  };
}

/** Economy: growth — rising bars, a trend line, coins. */
function economy(): Scene {
  const heights = [0.4, 0.55, 0.48, 0.75, 0.9, 1.18];
  const bar = merge([box(0.22, 1, 0.22), [0, 0.5, 0]]);
  const items: Item[] = [item({ mesh: box(2.3, 0.06, 0.9), color: PAPER, pos: [0, -0.78, 0] })];
  heights.forEach((h, i) =>
    items.push(
      item({
        mesh: bar,
        color: i === heights.length - 1 ? GREEN : i % 2 ? VIOLET : BLUE,
        pos: [-0.85 + i * 0.34, -0.75, 0],
        stretch: [1, h, 1],
        tick: (o, t) => {
          o.stretch = [1, h * (0.9 + 0.1 * Math.sin(t * 0.8 + i * 0.9)), 1];
        },
      }),
    ),
  );
  const trend = heights.map((h, i): V3 => [-0.85 + i * 0.34, -0.75 + h + 0.22, 0]);
  const tip = trend[trend.length - 1];
  items.push(
    item({ mesh: merge([polyline(trend)], [polyline([[tip[0] - 0.14, tip[1] + 0.02, 0], tip, [tip[0] - 0.04, tip[1] - 0.14, 0]])]), color: GOLD, line: GOLD, size: 2.2 }),
    item({ pts: trend, color: GOLD, size: 3 }),
  );
  const coin = frustum(20, 0.17, 0.17, 0.035, -0.0175);
  ([[-1.35, 0.5, 0.4], [1.25, 0.85, -0.3], [1.45, -0.1, 0.5]] as V3[]).forEach((p, i) =>
    items.push(float(item({ mesh: coin, color: GOLD, pos: p, rot: [HALF, 0, i] }), 0.09, 0.7, [0, 0.9, 0])),
  );
  items.push(float(item({ glyph: "₹", color: GOLD, size: 0.2, pos: [-1.25, 1.0, -0.2] }), 0.08, 0.5, [0, 0, 0]));
  return { items, spin: 0.12, tilt: -0.3 };
}

/** Science & technology: an atom, and a strand of DNA. */
function science(): Scene {
  const orbits: V3[] = [[0, 0, 0], [1.05, 0, 0.5], [-1.05, 0, -0.5]];
  const electrons: V3[] = orbits.map(() => [0, 0, 0]);
  const nucleus = dome(8, 0.13, 3, true);
  const strandA: V3[] = [], strandB: V3[] = [], rungs: [Mesh][] = [];
  for (let k = 0; k <= 40; k++) {
    const y = -1 + k * 0.05, a = k * 0.36;
    strandA.push([Math.cos(a) * 0.22, y, Math.sin(a) * 0.22]);
    strandB.push([-Math.cos(a) * 0.22, y, -Math.sin(a) * 0.22]);
    if (k % 3 === 0) rungs.push([polyline([strandA[k], strandB[k]])]);
  }
  return {
    items: [
      ...([[0, 0, 0, RED], [0.13, 0.06, 0.05, BLUE], [-0.1, 0.09, -0.06, BLUE], [0.02, -0.12, 0.08, RED], [-0.04, 0.02, 0.14, RED]] as number[][]).map((n) =>
        item({ mesh: nucleus, color: n[3], pos: [n[0], n[1], n[2]] }),
      ),
      ...orbits.map((rot) => item({ mesh: ring(1.05), color: INK, alpha: 0.45, rot })),
      item({
        pts: electrons,
        color: GOLD,
        size: 4,
        tick: (_, t) => orbits.forEach((rot, i) => (electrons[i] = rotate([Math.cos(t * (1.1 + i * 0.3) + i * 2) * 1.05, 0, Math.sin(t * (1.1 + i * 0.3) + i * 2) * 1.05], rot))),
      }),
      item({ mesh: merge([polyline(strandA)], [polyline(strandB)]), color: VIOLET, line: VIOLET, size: 1.8, pos: [-1.75, 0, 0], tick: (o, t) => void (o.rot[1] = t * 0.6) }),
      item({ mesh: merge(...rungs), color: INK, alpha: 0.5, pos: [-1.75, 0, 0], tick: (o, t) => void (o.rot[1] = t * 0.6) }),
    ],
    spin: 0.1,
    tilt: -0.16,
  };
}

/** Environment: a small green island — trees, falling leaves, the sun. */
function environment(): Scene {
  const rnd = seeded(23);
  const trunks: [Mesh, V3][] = [], crowns: [Mesh, V3][] = [];
  ([[0, 0, 1], [-0.5, 0.25, 0.75], [0.48, -0.2, 0.8], [0.15, 0.5, 0.6], [-0.3, -0.45, 0.65]] as number[][]).forEach(([x, z, s]) => {
    trunks.push([frustum(6, 0.035 * s, 0.03 * s, 0.24 * s, -0.65), [x, 0, z]]);
    crowns.push([merge([frustum(8, 0.25 * s, 0, 0.36 * s, -0.65 + 0.2 * s)], [frustum(8, 0.19 * s, 0, 0.32 * s, -0.65 + 0.4 * s)], [frustum(8, 0.13 * s, 0, 0.28 * s, -0.65 + 0.58 * s)]), [x, 0, z]]);
  });
  const leaves = Array.from({ length: 14 }, () => {
    const s = [rnd(), rnd() * 2.4 - 1.2, rnd() * 2 - 1, 0.05 + rnd() * 0.05, rnd() * TAU];
    return item({
      mesh: sheet(0.08, 0.045),
      color: GREEN,
      ds: true,
      tick: (o, t) => {
        const y = (s[0] + t * s[3]) % 1;
        o.pos = [s[1] + Math.sin(t * 0.8 + s[4]) * 0.15, 1.3 - y * 2.1, s[2]];
        o.rot = [t * 1.1 + s[4], t * 0.7, s[4]];
      },
    });
  });
  return {
    items: [
      item({ mesh: frustum(14, 0.6, 1.02, 0.3, -0.95), color: GREEN }),
      item({ mesh: frustum(14, 0.18, 0.6, 0.34, -1.29), color: GOLD, alpha: 0.85 }),
      item({ mesh: merge(...trunks), color: GOLD }),
      item({ mesh: merge(...crowns), color: GREEN }),
      item({ mesh: ring(1.3), color: BLUE, line: BLUE, alpha: 0.4, pos: [0, -0.86, 0] }),
      item({ mesh: ring(1.55), color: BLUE, line: BLUE, alpha: 0.2, pos: [0, -0.9, 0] }),
      item({ mesh: dome(10, 0.2, 3, true), color: GOLD, pos: [-1.35, 1.05, 0.5] }),
      item({ mesh: ring(0.34), color: GOLD, line: GOLD, alpha: 0.7, pos: [-1.35, 1.05, 0.5], tick: (o, t) => void (o.rot = [HALF + Math.sin(t) * 0.3, t * 0.4, 0]) }),
      ...leaves,
    ],
    spin: 0.1,
    tilt: -0.26,
  };
}

/** Prelims: objective questions — a target with the arrow in the bullseye, options A–D drifting by. */
function prelims(): Scene {
  const aim = (o: Item, t: number) => {
    o.rot = [HALF, Math.sin(t * 0.4) * 0.45 + 0.35, 0];
  };
  const discs = [[0.95, RED], [0.76, PAPER], [0.57, RED], [0.38, PAPER], [0.19, GOLD]].map(([r, c], k) =>
    item({ mesh: frustum(28, r, r, 0.03, -k * 0.03), color: c, tick: aim }),
  );
  const fletch = sheet(0.16, 0.24);
  const options = ["A", "B", "C", "D", "✓", "?"].map((g, i) => {
    const a0 = (i / 6) * TAU, y0 = Math.sin(i * 2.4) * 0.7, r = 1.55 + (i % 2) * 0.25;
    return item({
      glyph: g,
      color: [BLUE, VIOLET, BLUE, VIOLET, GREEN, RED][i],
      size: 0.17,
      tick: (o, t) => {
        o.pos = [Math.cos(a0 + t * 0.18) * r, y0 + Math.sin(t * 0.6 + i) * 0.12, Math.sin(a0 + t * 0.18) * r];
      },
    });
  });
  return {
    items: [
      ...discs,
      item({ mesh: frustum(6, 0.02, 0.02, 0.95, -1.1), color: GOLD, tick: aim }),
      item({ mesh: merge([fletch, [0, -1.0, 0]], [fletch, [0, -1.0, 0], [0, HALF, 0]]), color: RED, ds: true, tick: aim }),
      ...options,
    ],
    spin: 0,
    sway: 0.25,
    tilt: -0.06,
  };
}

/** Mains: descriptive answers — ruled sheets and a pen at work. */
function mains(): Scene {
  const rnd = seeded(31);
  const items: Item[] = [];
  for (let i = 0; i < 6; i++)
    items.push(
      float(
        item({ mesh: paper(0.6, 0.8), color: PAPER, ds: true, alpha: 0.92, pos: [rnd() * 3 - 1.5, rnd() * 1.6 - 0.8, rnd() * 1.8 - 0.9], rot: [rnd() * 1.2 - 0.6, rnd() * TAU, rnd() * 0.5] }),
        0.09,
        0.45,
        [0.05, 0.12, 0.03],
      ),
    );
  const write = (o: Item, t: number) => {
    o.pos = [Math.sin(t * 0.5) * 0.5 + Math.sin(t * 5) * 0.03, 0.1 + Math.abs(Math.sin(t * 5)) * 0.03, -1.1];
    o.rot = [0.25, 0, -0.55];
  };
  items.push(
    item({ mesh: frustum(8, 0.045, 0.045, 0.85, 0.14), color: BLUE, tick: write }),
    item({ mesh: frustum(8, 0, 0.045, 0.14, 0), color: GOLD, tick: write }),
    item({ mesh: frustum(8, 0.047, 0.047, 0.06, 0.93), color: RED, tick: write }),
  );
  return { items, spin: 0, sway: 0.3, tilt: -0.16 };
}

/** Progress: steps climbing to a flag. */
function progress(): Scene {
  const items: Item[] = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.16 + i * 0.18;
    items.push(item({ mesh: box(0.36, h, 0.62), color: i === 5 ? GREEN : i % 2 ? VIOLET : BLUE, pos: [-0.95 + i * 0.38, -0.85 + h / 2, 0] }));
  }
  const top: V3 = [0.95, -0.85 + 0.16 + 5 * 0.18, 0];
  const flag = item({ mesh: extrude([[0, 0], [0.34, 0.11], [0, 0.22]], 0.012), color: RED, pos: [top[0], top[1] + 0.34, 0] });
  flag.tick = (o, t) => void (o.rot[1] = Math.sin(t * 1.5) * 0.4);
  const path: V3[] = Array.from({ length: 16 }, (_, i): V3 => [-1.25 + i * 0.15, -0.5 + Math.pow(i / 15, 1.6) * 1.75, -0.45]);
  const end = path[path.length - 1];
  items.push(
    item({ mesh: polyline([top, [top[0], top[1] + 0.58, 0]]), color: INK, size: 1.6 }),
    flag,
    item({ mesh: merge([polyline(path)], [polyline([[end[0] - 0.16, end[1] - 0.02, end[2]], end, [end[0] - 0.02, end[1] - 0.17, end[2]]])]), color: GOLD, line: GOLD, size: 2 }),
    risingSparks(40, GOLD, 3, -0.9, 2.2, 1.2),
    item({ mesh: ring(1.7), color: INK, alpha: 0.2, pos: [0, -0.85, 0] }),
  );
  return { items, spin: 0.12, tilt: -0.28 };
}

/** Search: a lens sweeping over a cloud of knowledge. */
function search(): Scene {
  const rnd = seeded(77);
  const cloud = (n: number): V3[] =>
    Array.from({ length: n }, () => {
      const a = rnd() * TAU, b = Math.acos(rnd() * 2 - 1), r = 0.5 + rnd() * 1.1;
      return [Math.sin(b) * Math.cos(a) * r * 1.3, Math.cos(b) * r * 0.8, Math.sin(b) * Math.sin(a) * r];
    });
  const drift = (o: Item, t: number) => void (o.rot[1] = t * 0.08);
  const sweep = (o: Item, t: number) => {
    o.pos = [Math.sin(t * 0.45) * 0.9, Math.sin(t * 0.7) * 0.4, -1.2];
    o.rot = [HALF, 0, 0];
  };
  return {
    items: [
      item({ pts: cloud(90), color: BLUE, size: 2, tick: drift }),
      item({ pts: cloud(60), color: VIOLET, size: 1.7, tick: drift }),
      item({ pts: cloud(24), color: GOLD, size: 2.4, tick: drift }),
      item({ mesh: frustum(32, 0.44, 0.44, 0.07, -0.035, false), color: RED, ds: true, tick: sweep }),
      item({ mesh: frustum(32, 0.42, 0.42, 0.004), color: PAPER, ds: true, alpha: 0.28, tick: sweep }),
      item({ mesh: merge([frustum(8, 0.04, 0.04, 0.55), [0.31, 0, 0.31], [HALF, 0, -Math.PI / 4]]), color: INK, alpha: 0.85, tick: sweep }),
    ],
    spin: 0,
    sway: 0.3,
    tilt: -0.08,
  };
}

/** Log in / sign up: a gateway, with light streaming through. */
function gateway(): Scene {
  const arch: [number, number][] = [];
  for (let i = 0; i <= 14; i++) arch.push([Math.cos((i / 14) * Math.PI) * 0.94, Math.sin((i / 14) * Math.PI) * 0.94]);
  for (let i = 14; i >= 0; i--) arch.push([Math.cos((i / 14) * Math.PI) * 0.66, Math.sin((i / 14) * Math.PI) * 0.66]);
  const rnd = seeded(9);
  const seeds = Array.from({ length: 50 }, () => [rnd(), rnd() * 1.1 - 0.55, rnd() * 1.3 - 0.75, 0.08 + rnd() * 0.12]);
  const light: V3[] = seeds.map(() => [0, 0, 0]);
  return {
    items: [
      item({ mesh: merge([box(2.5, 0.1, 1.1), [0, -0.9, 0]], [box(2.1, 0.1, 0.85), [0, -0.8, 0]]), color: PAPER }),
      item({ mesh: merge([box(0.28, 1.4, 0.28), [-0.8, -0.05, 0]], [box(0.28, 1.4, 0.28), [0.8, -0.05, 0]]), color: PAPER }),
      item({ mesh: extrude(arch, 0.28), color: RED, pos: [0, 0.65, 0] }),
      item({ pts: light, color: GOLD, size: 2.2, tick: (_, t) => seeds.forEach((s, i) => (light[i] = [s[1], s[2], 2.2 - ((s[0] + t * s[3]) % 1) * 4.4])) }),
      item({ mesh: ring(1.6), color: INK, alpha: 0.2, pos: [0, -0.9, 0] }),
    ],
    spin: 0,
    sway: 0.55,
    tilt: -0.14,
  };
}

/** Manage: the machinery behind the site — meshing gears. */
function workshop(): Scene {
  const gear = (teeth: number, r: number): Mesh => {
    const pts: [number, number][] = [];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU, step = TAU / teeth;
      pts.push([Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82], [Math.cos(a + step * 0.2) * r, Math.sin(a + step * 0.2) * r]);
      pts.push([Math.cos(a + step * 0.5) * r, Math.sin(a + step * 0.5) * r], [Math.cos(a + step * 0.7) * r * 0.82, Math.sin(a + step * 0.7) * r * 0.82]);
    }
    return extrude(pts, 0.16);
  };
  const hub = (r: number): Mesh => merge([ring(r * 0.3), [0, 0, 0], [HALF, 0, 0]]);
  const turning = (mesh: Mesh, color: number, pos: V3, speed: number, extra: Partial<Item> = {}) =>
    item({ mesh, color, pos, tick: (o, t) => void (o.rot[2] = t * speed), ...extra });
  return {
    items: [
      turning(gear(14, 0.72), BLUE, [-0.5, 0.05, 0], 0.3),
      turning(gear(8, 0.42), RED, [0.6, 0.32, 0], -0.525),
      turning(gear(10, 0.52), VIOLET, [0.33, -0.83, 0], -0.42),
      turning(hub(0.72), INK, [-0.5, 0.05, -0.09], 0.3, { alpha: 0.5 }),
      turning(hub(0.42), INK, [0.6, 0.32, -0.09], -0.525, { alpha: 0.5 }),
      turning(hub(0.52), INK, [0.33, -0.83, -0.09], -0.42, { alpha: 0.5 }),
    ],
    spin: 0,
    sway: 0.6,
    tilt: -0.1,
  };
}

/** Everything else: a slowly turning constellation. */
function network(): Scene {
  const rnd = seeded(101);
  const pts: V3[] = Array.from({ length: 64 }, () => {
    const a = rnd() * TAU, b = Math.acos(rnd() * 2 - 1), r = 0.6 + rnd() * 1.0;
    return [Math.sin(b) * Math.cos(a) * r * 1.3, Math.cos(b) * r, Math.sin(b) * Math.sin(a) * r];
  });
  const links: [Mesh][] = [];
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => ({ j, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }))
      .filter((n) => n.j > i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach((n) => n.d < 0.75 && links.push([polyline([p, pts[n.j]])]));
  });
  return {
    items: [
      item({ mesh: merge(...links), color: INK, alpha: 0.3 }),
      item({ pts: pts.filter((_, i) => i % 3 !== 0), color: BLUE, size: 2.2 }),
      item({ pts: pts.filter((_, i) => i % 3 === 0), color: RED, size: 2.6 }),
    ],
    spin: 0.07,
    tilt: -0.12,
  };
}

export const SCENES = { home, institution, library, history, geography, polity, economy, science, environment, prelims, mains, progress, search, gateway, workshop, network };
export type SceneName = keyof typeof SCENES;

/** The backdrop that suits a syllabus topic, from the words in its name. */
export function sceneForTopic(title: string): SceneName {
  const t = title.toLowerCase();
  if (t.includes("history") || t.includes("culture")) return "history";
  if (t.includes("geograph")) return "geography";
  if (t.includes("polity") || t.includes("constitution") || t.includes("governance")) return "polity";
  if (t.includes("econom")) return "economy";
  if (t.includes("science") || t.includes("technology")) return "science";
  if (t.includes("environment") || t.includes("ecology")) return "environment";
  return "library";
}

/** The backdrop for a URL, when the page doesn't ask for a specific one. */
export function sceneForPath(path: string): SceneName {
  if (path === "/") return "home";
  if (path.startsWith("/login") || path.startsWith("/signup")) return "gateway";
  if (path.startsWith("/manage")) return "workshop";
  if (path.startsWith("/search")) return "search";
  if (path.endsWith("/progress")) return "progress";
  if (path.endsWith("/prelims")) return "prelims";
  if (path.endsWith("/mains")) return "mains";
  if (path.includes("/materials") || path.includes("/micro/")) return "library";
  if (/^\/exams\/[^/]+$/.test(path)) return "institution";
  return "network";
}
