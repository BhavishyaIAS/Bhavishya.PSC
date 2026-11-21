import type { Commission } from "@/lib/types";

/**
 * The examinations' official emblems, as the spheres on the home page and each examination's page
 * show them (Universe.tsx maps them into the glass; worlds.css shows them flat without WebGL).
 * Textures are built from the commissions' artwork, undistorted, on a white enamel disc:
 * public/brand/emblems/<slug>.webp (1024 px) and <slug>-s.webp (512 px, phones).
 * `tint` is the glass around the emblem, in the emblem's own colours (sRGB 0..1).
 */
export const EMBLEMS: Record<string, { src: string; tint: [number, number, number] }> = {
  upsc: { src: "/brand/emblems/upsc.webp", tint: [0.13, 0.19, 0.42] }, // deep navy, with gold
  appsc: { src: "/brand/emblems/appsc.webp", tint: [0.03, 0.42, 0.21] }, // the Andhra Pradesh green
  tgpsc: { src: "/brand/emblems/tgpsc.webp", tint: [0.62, 0.5, 0.29] }, // the Telangana gold
};

export const emblemFor = (slug: string) => EMBLEMS[slug];

/** "Group 1 and Group 2 Services", "Civil Services Examination" — what a commission's exams are, in a line. */
export function describeExams(c: Commission): string {
  const names = c.tracks.map((t) => t.group_name);
  if (names.length === 0) return "Being charted";
  if (names.every((n) => /^group\b/i.test(n))) return `${names.join(" and ").replace(/ and (?=[^ ]+ [^ ]+ and )/g, ", ")} Services`;
  if (names.length === 1) return `${names[0]} Examination`;
  return names.join(" · ");
}
