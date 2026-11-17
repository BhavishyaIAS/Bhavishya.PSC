import Link from "next/link";

import type { PaperNode } from "@/lib/types";

/** What has been done in one subject of the syllabus, counted from the syllabus itself. */
export interface SubjectStat {
  id: number;
  title: string;
  paper: string;
  total: number; // sections (micro-themes)
  studied: number; // ticked by this learner
  withNotes: number; // have at least one note
}

export function subjectStats(papers: PaperNode[]): SubjectStat[] {
  return papers.flatMap((p) =>
    p.subjects.map((s) => {
      const mts = s.topics.flatMap((t) => t.micro_themes);
      return {
        id: s.id,
        title: s.title,
        paper: p.title,
        total: mts.length,
        studied: mts.filter((m) => m.studied).length,
        withNotes: mts.filter((m) => m.note_kinds.length > 0).length,
      };
    }),
  );
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/**
 * Jupiter's map of the syllabus: every subject as a body with its orbit, the arc of the
 * orbit closed as far as the subject is done. Each one jumps to its place in the outline.
 */
export function SubjectOrbits({ stats, mode }: { stats: SubjectStat[]; mode: "student" | "admin" }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <ul className="orbits">
      {stats.map((s) => {
        const done = mode === "admin" ? s.withNotes : s.studied;
        const p = pct(done, s.total);
        return (
          <li key={s.id}>
            <Link href={`#subject-${s.id}`} className="orbit">
              <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={`${p}%`}>
                <circle cx="32" cy="32" r={R} className="orbit-track" />
                <circle cx="32" cy="32" r={R} className="orbit-arc" strokeDasharray={`${(C * p) / 100} ${C}`} transform="rotate(-90 32 32)" />
                <circle cx="32" cy="32" r="9" className="orbit-body" />
                <text x="32" y="35.5" textAnchor="middle" className="orbit-pct">
                  {p}
                </text>
              </svg>
              <span className="orbit-text">
                <b>{s.title}</b>
                <span>
                  {done}/{s.total} {mode === "admin" ? "with notes" : "studied"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Earth's reading of the same numbers: one bar per subject, the furthest along first. */
export function SubjectBars({ stats, href }: { stats: SubjectStat[]; href: string }) {
  const rows = stats.filter((s) => s.total > 0).sort((a, b) => pct(b.studied, b.total) - pct(a.studied, a.total) || b.total - a.total);
  return (
    <ol className="bars">
      {rows.map((s) => {
        const p = pct(s.studied, s.total);
        return (
          <li key={s.id}>
            <Link href={`${href}#subject-${s.id}`} className="bar-row">
              <span className="bar-name">{s.title}</span>
              <span className="bar-track" role="img" aria-label={`${s.title}: ${p}% studied`}>
                <span className="bar-fill" style={{ width: `${p}%` }} />
              </span>
              <span className="bar-num">
                <b>{p}%</b> {s.studied}/{s.total}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
