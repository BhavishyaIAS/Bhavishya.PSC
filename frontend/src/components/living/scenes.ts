/**
 * The Living Universe: every page is a stage of the journey.
 *   ocean   the home and the doors in (birth of awareness, stillness, the infinite source)
 *   forest  an exam and its question vaults (growth, relationships, interconnected life)
 *   autumn  notes and progress, the quietest pages (purpose, patience, a home built one act at a time)
 */
export type Scene = "ocean" | "forest" | "autumn";

export function sceneForPath(path: string): Scene {
  if (/\/(materials|progress|micro)(\/|$|\?)/.test(path)) return "autumn";
  if (path.startsWith("/exams/")) return "forest";
  return "ocean";
}
