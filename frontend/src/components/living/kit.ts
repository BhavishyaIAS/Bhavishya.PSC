/** Small tools shared by the living worlds: colour, noise, easing. */
export const TAU = Math.PI * 2;
export const PHI = 1.6180339887;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export type RGB = [number, number, number];

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** smooth 1-D value noise in [0, 1] */
export function noise(x: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
export function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
