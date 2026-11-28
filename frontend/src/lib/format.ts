export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const stageLabel = (s: string) => (s === "mains" ? "Mains" : "Prelims");
/** Papers of a Notes module's own syllabus, named as such in the admin's tools ("Prelims Notes syllabus · Paper I …"). */
const NOTES_SYLLABUS: Record<string, string> = { comprehensive: "Comprehensive Note (Syllabus-Wise) syllabus", prelims: "Prelims Notes syllabus", mains: "Mains Notes syllabus" };
export const paperLabel = (p: { title: string; notes_kind?: string }) => (p.notes_kind ? `${NOTES_SYLLABUS[p.notes_kind]} · ${p.title}` : p.title);

export function trackPath(commission: string, group: string, rest = "") {
  return `/exams/${commission}/${group}${rest ? `/${rest}` : ""}`;
}
