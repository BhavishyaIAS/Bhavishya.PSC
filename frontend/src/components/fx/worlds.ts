/**
 * Every page is its own world. A world is three things:
 *   • a sculpture on the stage (scenes.ts),
 *   • a great figure turning slowly in the sky behind it — sacred geometry that
 *     belongs to the subject (a mandala, the chakra, an astrolabe, an eight-point star…),
 *   • the colour of its light: three nebula colours, and sometimes its own
 *     materials for the sculpture (sandstone for the ancient world, copper and
 *     teal for the medieval…).
 */
import { GOLD, INK, item, merge, polyline, ring, seeded, type Item, type Mesh, type Scene, type V3 } from "./engine";
import type { SceneName } from "./scenes";

const TAU = Math.PI * 2;
const at = (a: number, r: number, y = 0): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
const rays = (n: number, r0: number, r1: number, offset = 0): [Mesh][] =>
  Array.from({ length: n }, (_, k): [Mesh] => [polyline([at((k / n) * TAU + offset, r0), at((k / n) * TAU + offset, r1)])]);
const rings = (...radii: number[]): [Mesh][] => radii.map((r): [Mesh] => [ring(r, r > 0.5 ? 72 : 40)]);

/** A ring of petals between two radii: the building block of mandalas and lotuses. */
function petals(n: number, r0: number, r1: number, offset = 0): [Mesh][] {
  const out: [Mesh][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + offset, half = Math.PI / n;
    for (const side of [-1, 1]) {
      const curve: V3[] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        curve.push(at(a + side * half * (1 - u) * (1 - u * 0.25), r0 + (r1 - r0) * Math.sin((u * Math.PI) / 2)));
      }
      out.push([polyline(curve)]);
    }
  }
  return out;
}

/** A figure made of fine lines, lying like a great disc in the sky and turning slowly. */
function figure(mesh: Mesh, opts: { speed?: number; tilt?: number; dots?: V3[]; color?: number } = {}): Scene {
  const turn = (o: Item, t: number) => void (o.rot[1] = t * (opts.speed ?? 0.02));
  const items: Item[] = [item({ mesh, color: opts.color ?? GOLD, line: opts.color ?? GOLD, size: 1, tick: turn })];
  if (opts.dots) items.push(item({ pts: opts.dots, color: opts.color ?? GOLD, size: 1.8, tick: turn }));
  return { items, spin: 0, tilt: opts.tilt ?? -1.0, ground: false };
}

const SKIES = {
  /** Home: a mandala — the ordered universe, the oldest diagram of a journey inward. */
  mandala: () =>
    figure(merge(...rings(1, 0.965, 0.62, 0.3, 0.12), ...petals(16, 0.62, 0.95), ...petals(8, 0.3, 0.6, Math.PI / 8), ...petals(8, 0.12, 0.29), ...rays(32, 0.965, 1)), {
      dots: Array.from({ length: 16 }, (_, k) => at((k / 16) * TAU, 0.95)),
    }),
  /** A lotus: twice-layered petals (regional history and culture). */
  lotus: () =>
    figure(merge(...rings(1, 0.2), ...petals(12, 0.2, 0.62), ...petals(12, 0.45, 0.98, Math.PI / 12), ...petals(24, 0.86, 1.0)), {
      dots: Array.from({ length: 12 }, (_, k) => at((k / 12) * TAU + Math.PI / 12, 0.98)),
    }),
  /** The Ashoka Chakra, vast: the wheel of law (polity, the commission). */
  chakra: () =>
    figure(merge(...rings(1, 0.93, 0.16), ...rays(24, 0.16, 0.93)), { dots: Array.from({ length: 24 }, (_, k) => at(((k + 0.5) / 24) * TAU, 0.965)), speed: 0.03 }),
  /** A spoked wheel (modern history: the charkha, the wheel of the railway age). */
  wheel: () => figure(merge(...rings(1, 0.94, 0.5, 0.1), ...rays(8, 0.1, 0.94), ...rays(8, 0.5, 0.94, Math.PI / 8)), { speed: 0.04 }),
  /** An astrolabe: the ancient world reading the heavens (ancient history). */
  astrolabe: () =>
    figure(
      merge(...rings(1, 0.9, 0.56), ...rays(72, 0.9, 0.94), ...rays(12, 0.86, 1), ...rays(12, 0.56, 0.9, Math.PI / 12), [ring(0.56, 60), [0.2, 0, 0]], [polyline([at(0.5, 0), at(0.5, 1)])]),
      { dots: Array.from({ length: 12 }, (_, k) => at((k / 12) * TAU, 0.73)) },
    ),
  /** Interlaced squares — the eight-pointed star of medieval geometry. */
  star: () => {
    const square = (r: number, off: number): [Mesh] => [polyline([0, 1, 2, 3].map((k) => at((k / 4) * TAU + off, r)), true)];
    const parts: [Mesh][] = [...rings(1, 0.92)];
    for (const r of [0.92, 0.65, 0.46, 0.325]) parts.push(square(r, 0), square(r, Math.PI / 4));
    return figure(merge(...parts, ...rays(16, 0.325, 0.46, Math.PI / 16), ...rays(8, 0.92, 1, Math.PI / 8)), { dots: Array.from({ length: 8 }, (_, k) => at((k / 8) * TAU, 0.92)) });
  },
  /** A compass rose over rings of latitude (geography). */
  compass: () => {
    const rose: V3[] = [];
    for (let k = 0; k < 32; k++) rose.push(at((k / 32) * TAU, k % 2 ? 0.2 : k % 8 === 0 ? 0.9 : k % 4 === 0 ? 0.66 : 0.44));
    return figure(merge(...rings(1, 0.95, 0.5, 0.2), [polyline(rose, true)], ...rays(72, 0.95, 1), ...rays(4, 0.2, 0.95)));
  },
  /** Orbits crossing (science and technology). */
  orbits: () => {
    const ellipse = (rz: number, rot: number): [Mesh] => [
      polyline(Array.from({ length: 60 }, (_, k): V3 => {
        const a = (k / 60) * TAU, x = Math.cos(a), z = Math.sin(a) * rz;
        return [x * Math.cos(rot) - z * Math.sin(rot), 0, x * Math.sin(rot) + z * Math.cos(rot)];
      }), true),
    ];
    return figure(merge(...rings(1, 0.1), ellipse(0.36, 0), ellipse(0.36, Math.PI / 3), ellipse(0.36, (2 * Math.PI) / 3), ...rays(60, 0.97, 1)), {
      dots: [at(0, 1), at(Math.PI / 3 + Math.PI, 1), at((2 * Math.PI) / 3, 1)],
      speed: 0.035,
    });
  },
  /** The golden spiral, and the rays of growth (economy). */
  spiral: () => {
    const curve: V3[] = [];
    for (let k = 0; k <= 120; k++) {
      const a = (k / 120) * TAU * 3;
      curve.push(at(a, 0.035 * Math.exp(0.178 * a)));
    }
    return figure(merge(...rings(1, 0.62, 0.382), [polyline(curve)], ...rays(12, 0.62, 1), ...rays(36, 0.97, 1)));
  },
  /** A sunburst: rays rising from a centre (progress). */
  sunburst: () => figure(merge(...rings(1, 0.28, 0.24), ...rays(36, 0.3, 0.62), ...rays(36, 0.34, 0.98, Math.PI / 36), ...rays(72, 0.97, 1)), { speed: 0.03 }),
  /** Rings and a crosshair: the mark to aim for (prelims). */
  target: () => figure(merge(...rings(1, 0.8, 0.6, 0.4, 0.2), ...rays(4, 0.05, 1), ...rays(72, 0.97, 1), ...rays(24, 0.8, 0.84)), { speed: 0.015 }),
  /** Lines of writing inside a circle: the page in the sky (mains). */
  script: () => {
    const lines: [Mesh][] = [];
    for (let k = -4; k <= 4; k++) {
      const z = k * 0.19, half = Math.sqrt(Math.max(0, 0.86 * 0.86 - z * z));
      lines.push([polyline(Array.from({ length: 30 }, (_, i): V3 => [-half + (i / 29) * half * 2, 0, z + Math.sin(i * 0.9 + k) * 0.018]))]);
    }
    return figure(merge(...rings(1, 0.96), ...lines), { speed: 0.008 });
  },
  /** The tree of life, branching (environment). */
  tree: () => {
    const branches: [Mesh][] = [];
    const grow = (x: number, z: number, angle: number, len: number, depth: number) => {
      const x2 = x + Math.cos(angle) * len, z2 = z + Math.sin(angle) * len;
      branches.push([polyline([[x, 0, z], [x2, 0, z2]])]);
      if (depth > 0) for (const turn of [-0.45, 0.42]) grow(x2, z2, angle + turn, len * 0.72, depth - 1);
    };
    grow(0, 0.78, -Math.PI / 2, 0.42, 5);
    for (const turn of [0.6, -0.6, 0]) grow(0, 0.78, Math.PI / 2 + turn, 0.12, 1);
    return figure(merge(...rings(1, 0.97), ...branches), { speed: 0.006 });
  },
  /** A honeycomb of structure (the admin workshop). */
  lattice: () => {
    const cells: [Mesh][] = [];
    for (let q = -3; q <= 3; q++)
      for (let r = -3; r <= 3; r++) {
        const x = 0.27 * (q + r / 2), z = 0.27 * r * 0.866;
        if (Math.hypot(x, z) > 0.86) continue;
        cells.push([polyline(Array.from({ length: 6 }, (_, k): V3 => [x + Math.cos((k / 6) * TAU) * 0.15, 0, z + Math.sin((k / 6) * TAU) * 0.15]), true)]);
      }
    return figure(merge(...rings(1), ...cells), { speed: 0.01, color: INK });
  },
  /** Constellations: knowledge as stars joined by lines (the library, search). */
  constellation: () => {
    const rnd = seeded(404);
    const stars: V3[] = Array.from({ length: 46 }, () => at(rnd() * TAU, 0.15 + Math.sqrt(rnd()) * 0.85));
    const links: [Mesh][] = [];
    stars.forEach((p, i) => {
      const near = stars.map((q, j) => ({ j, d: Math.hypot(p[0] - q[0], p[2] - q[2]) })).filter((n) => n.j > i).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 0.34) links.push([polyline([p, stars[near.j]])]);
    });
    return figure(merge(...rings(1), ...links), { dots: stars, speed: 0.012 });
  },
  /** Rings of light opening: the way through (log in). */
  portal: () => figure(merge(...rings(1, 0.9, 0.7, 0.66), ...rays(36, 0.7, 0.9), ...rays(72, 0.9, 0.94, Math.PI / 72), ...rays(12, 0.94, 1)), { speed: 0.05 }),
};
export type SkyName = keyof typeof SKIES;
export const buildSky = (name: SkyName): Scene => SKIES[name]();

/** Hex colours → the renderer's palette slots (0 red, 1 blue, 2 stone, 3 paper, 4 green, 5 gold, 6 ink, 7 shadow). */
type Materials = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, string>>;

export interface World {
  sky: SkyName;
  light: [string, string, string]; // nebula colours on paper
  dark: [string, string, string]; // …and on the night sky
  materials?: { light: Materials; dark: Materials };
}

const SANDSTONE = {
  light: { 0: "#c4684a", 1: "#b9a68d", 2: "#cfc0a6", 3: "#f6eedd", 5: "#c9973f", 6: "#8d7c66", 7: "#8f7a61" },
  dark: { 0: "#c96a4c", 1: "#7d6c57", 2: "#8d7d65", 3: "#dccfb2", 5: "#d4a34d", 6: "#6d5e4c" },
} satisfies World["materials"];

export const WORLDS: Record<SceneName, World> = {
  home: { sky: "mandala", light: ["#e9b58c", "#e8d3a0", "#d3aea3"], dark: ["#a8502a", "#9a7226", "#562838"], materials: SANDSTONE },
  institution: { sky: "chakra", light: ["#a9c0ea", "#f0d9a0", "#e9b6b2"], dark: ["#27489a", "#8a6a1e", "#6a2030"] },
  library: { sky: "constellation", light: ["#c6b9ea", "#a8d6d0", "#f0cad9"], dark: ["#4a3a9a", "#16606a", "#6a2a55"] },
  history: { sky: "astrolabe", light: ["#edc48c", "#e2d4aa", "#d9b49c"], dark: ["#96581e", "#786828", "#583020"], materials: SANDSTONE },
  medieval: {
    sky: "star",
    light: ["#8fcfc4", "#e9c18c", "#bab1e0"],
    dark: ["#0f5f5a", "#8a4f1a", "#2a2a6a"],
    materials: { light: { 0: "#b85c3e", 1: "#4f9a94", 2: "#cdbb9c", 3: "#f4ebd8", 5: "#c9923f", 6: "#7f8580" }, dark: { 0: "#c0603f", 1: "#2f7f7a", 2: "#8a7c66", 3: "#d9cdb4", 5: "#d09a44" } },
  },
  modern: {
    sky: "wheel",
    light: ["#dbc9aa", "#aab9dd", "#e7b2a2"],
    dark: ["#6a5330", "#2a3f7a", "#6a2a20"],
    materials: { light: { 2: "#cfc3ae", 3: "#f7f1e4", 5: "#b98a4a", 6: "#857c70" }, dark: { 3: "#d8ceb8", 5: "#c6934a" } },
  },
  gopuram: {
    sky: "lotus",
    light: ["#f0c08c", "#e9a4a4", "#eed89c"],
    dark: ["#a04e14", "#7a1f2f", "#8a6a1a"],
    materials: { light: { 0: "#b8473c", 1: "#8a5a4a", 2: "#d8c2a0", 3: "#f5ead4", 5: "#d19a3a", 6: "#8c7860" }, dark: { 0: "#c24e40", 1: "#6a4638", 2: "#8f7c60", 3: "#dccba8", 5: "#d8a23e" } },
  },
  polity: { sky: "chakra", light: ["#9db7ea", "#f2c694", "#a9d9b6"], dark: ["#1f3f9a", "#9a5a12", "#17603a"] },
  geography: { sky: "compass", light: ["#9fd1e8", "#a9dcc9", "#c9c1ee"], dark: ["#0f5a8a", "#0f6a55", "#3a2f8a"] },
  economy: { sky: "spiral", light: ["#a9dcc0", "#eed692", "#aac9ea"], dark: ["#0f6a45", "#8a6a12", "#1f4a8a"] },
  science: { sky: "orbits", light: ["#c4b4f0", "#a1dce8", "#f0b9dc"], dark: ["#4a2fa0", "#0f6a80", "#7a1f60"] },
  environment: { sky: "tree", light: ["#b1dca2", "#e8dc9a", "#a1d8cc"], dark: ["#2a6a1f", "#6a6a12", "#0f5f55"] },
  prelims: { sky: "target", light: ["#f0b2b2", "#f0d79c", "#c6b9ea"], dark: ["#8a1f2a", "#8a6212", "#3f2f8a"] },
  mains: { sky: "script", light: ["#b6c0ee", "#eedab2", "#d9b9e0"], dark: ["#2a3a8a", "#7a5a20", "#5a2a70"] },
  progress: { sky: "sunburst", light: ["#f0d18c", "#f0b2aa", "#b1d8c1"], dark: ["#8a6412", "#8a2f2a", "#1a6a4a"] },
  search: { sky: "constellation", light: ["#a9d8ee", "#c9c1f0", "#f0d1b2"], dark: ["#0f5a8a", "#3a2f8a", "#7a4a1a"] },
  gateway: { sky: "portal", light: ["#b9b1f0", "#f0c1a2", "#a1d8e8"], dark: ["#3a2aa0", "#8a3f1a", "#0f5f80"] },
  workshop: { sky: "lattice", light: ["#c9cdd8", "#d9d1c1", "#c1d1d8"], dark: ["#2a3040", "#3a3020", "#203040"] },
  network: { sky: "constellation", light: ["#b9c3ea", "#e8d5b0", "#d0bfe6"], dark: ["#2f3f8a", "#7a5a20", "#4a2f7a"] },
};

export function hexToRgb(hex: string): number[] {
  const h = hex.trim().replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
