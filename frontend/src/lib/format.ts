export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const stageLabel = (s: string) => (s === "mains" ? "Mains" : "Prelims");

export function trackPath(commission: string, group: string, rest = "") {
  return `/exams/${commission}/${group}${rest ? `/${rest}` : ""}`;
}
