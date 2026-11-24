/**
 * The Living Universe: every page is a stage of the journey, and each has its world.
 *   ocean    the home and the doors in: the birth of awareness, stillness, the infinite source
 *   forest   an exam's own page: growth, relationships, interconnected life
 *   wetland  choosing notes: where water and land meet, the threshold of study
 *   autumn   reading notes: purpose, patience, a home built one act at a time (the sparrow's nest)
 *   lake     the Prelims vault: beneath the surface, many quick lives moving together
 *   polar    the Mains vault: clarity, endurance, the long view across the ice
 *   amazon   the Progress Tracker: abundance, growth that has taken root
 *   desert   search and the admin's rooms: seeking, spaciousness
 * A visitor may also pin one world everywhere (the World choice at the foot of the page).
 */
export type Scene = "ocean" | "forest" | "autumn" | "lake" | "wetland" | "desert" | "polar" | "amazon";

export const SCENES: { key: Scene; name: string }[] = [
  { key: "ocean", name: "Ocean of Consciousness" },
  { key: "forest", name: "Rainforest of Life" },
  { key: "amazon", name: "Amazon" },
  { key: "wetland", name: "Wetland" },
  { key: "lake", name: "Under the lake" },
  { key: "autumn", name: "Sparrow and the Autumn Tree" },
  { key: "desert", name: "Desert" },
  { key: "polar", name: "Polar ice" },
];

export const WORLD_COOKIE = "bp_world";

export function isScene(s: unknown): s is Scene {
  return SCENES.some((x) => x.key === s);
}

export function sceneForPath(path: string): Scene {
  const p = path.split(/[?#]/)[0];
  if (/\/materials\/[^/]+/.test(p) || /\/micro\//.test(p)) return "autumn";
  if (/\/materials$/.test(p)) return "wetland";
  if (/\/prelims$/.test(p)) return "lake";
  if (/\/mains$/.test(p)) return "polar";
  if (/\/progress$/.test(p) || p === "/progress") return "amazon";
  if (p.startsWith("/search") || p.startsWith("/manage")) return "desert";
  if (p.startsWith("/exams/")) return "forest";
  return "ocean";
}
