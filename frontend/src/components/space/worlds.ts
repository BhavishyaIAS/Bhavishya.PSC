import type { ShaderName } from "./shaders";

/**
 * Every part of the site is a place:
 *   cosmos   the landing page, search, signing in — deep space, with the great galaxy
 *   system   one examination's own planetary system (UPSC, APPSC…)
 *   mars     Notes            moon     Prelims PYQs      saturn   Mains PYQs
 *   jupiter  Syllabus         earth    Progress
 *   station  the admin area — a quiet view from orbit
 */
export type World = "cosmos" | "system" | "mars" | "moon" | "saturn" | "jupiter" | "earth" | "station";

export function worldForPath(path: string): World {
  if (path.startsWith("/manage")) return "station";
  if (path === "/progress" || path.endsWith("/progress")) return "earth";
  if (path.endsWith("/prelims")) return "moon";
  if (path.endsWith("/mains")) return "saturn";
  if (path.endsWith("/syllabus")) return "jupiter";
  if (path.includes("/materials") || path.includes("/micro/")) return "mars";
  if (/^\/exams\/[^/]+\/?$/.test(path)) return "system";
  if (/^\/exams\/[^/]+\/[^/]+\/?$/.test(path)) return "mars"; // an exam opens on its Notes
  return "cosmos";
}

export const SHADER: Record<World, ShaderName> = {
  cosmos: "cosmos", system: "cosmos", station: "cosmos",
  mars: "mars", moon: "moon", saturn: "saturn", jupiter: "jupiter", earth: "earth",
};
/** Which worlds need NASA's Earth map (the Moon's sky has Earth in it). */
export const NEEDS_EARTH: Partial<Record<World, boolean>> = { earth: true, moon: true };

/** The planet an examination is, on the landing page and in its own system. Colours are linear-ish RGB, 0..1. */
export interface Planet {
  a: [number, number, number];
  b: [number, number, number];
  kind: 0 | 1; // 0 gas giant, 1 rocky world
  ring: boolean;
}
const PLANETS: Record<string, Planet> = {
  // UPSC: a ringed giant in deep blue and pale gold — the national examination, the largest body in the system
  upsc: { a: [0.2, 0.34, 0.62], b: [0.74, 0.72, 0.62], kind: 0, ring: true },
  // APPSC: a warm rocky world in the reds and ochres of the Deccan
  appsc: { a: [0.72, 0.36, 0.2], b: [0.36, 0.17, 0.12], kind: 1, ring: false },
  tgpsc: { a: [0.26, 0.46, 0.5], b: [0.12, 0.2, 0.3], kind: 1, ring: false },
};
/** Admin-chosen card colours (Manage → Exams) become planets too. */
const BY_THEME: Record<string, Planet> = {
  red: { a: [0.7, 0.26, 0.2], b: [0.32, 0.12, 0.1], kind: 1, ring: false },
  blue: { a: [0.22, 0.38, 0.7], b: [0.7, 0.74, 0.8], kind: 0, ring: false },
  navy: { a: [0.2, 0.34, 0.62], b: [0.74, 0.72, 0.62], kind: 0, ring: true },
  green: { a: [0.24, 0.5, 0.36], b: [0.14, 0.26, 0.24], kind: 1, ring: false },
  teal: { a: [0.2, 0.5, 0.56], b: [0.78, 0.84, 0.82], kind: 0, ring: false },
  violet: { a: [0.42, 0.32, 0.66], b: [0.8, 0.74, 0.82], kind: 0, ring: true },
  orange: { a: [0.8, 0.46, 0.2], b: [0.9, 0.78, 0.56], kind: 0, ring: false },
  gold: { a: [0.76, 0.6, 0.3], b: [0.92, 0.86, 0.68], kind: 0, ring: true },
};
const FALLBACK = [BY_THEME.teal, BY_THEME.violet, BY_THEME.orange, BY_THEME.green];

export function planetFor(slug: string, theme = "", index = 0): Planet {
  return BY_THEME[theme] ?? PLANETS[slug] ?? FALLBACK[index % FALLBACK.length];
}
