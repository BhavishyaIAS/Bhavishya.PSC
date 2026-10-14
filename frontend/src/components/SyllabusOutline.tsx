import { ChevronRight, Clock, FileQuestion, NotebookText } from "lucide-react";
import Link from "next/link";

import { PriorityBadge, StatusBadge } from "@/components/ui/bits";
import { stageLabel, trackPath } from "@/lib/format";
import type { MicroThemeNode, PaperNode } from "@/lib/types";

import { StudiedToggle } from "./StudiedToggle";

const KIND_SHORT: Record<string, string> = { comprehensive: "Full", prelims: "Pre", mains: "Mains" };

/** Paper → Subject → Topic → Micro-theme, as collapsible sections. */
export function SyllabusOutline({
  papers,
  commission,
  group,
  mode,
}: {
  papers: PaperNode[];
  commission: string;
  group: string;
  mode: "student" | "admin";
}) {
  const admin = mode === "admin";
  return (
    <div>
      {papers.map((paper, pi) => {
        const mts = paper.subjects.flatMap((s) => s.topics.flatMap((t) => t.micro_themes));
        const studied = mts.filter((m) => m.studied).length;
        return (
          <details key={paper.id} className="outline-paper" open={pi === 0}>
            <summary>
              <ChevronRight className="chev-rot" size={18} aria-hidden />
              <span className={`badge ${paper.stage === "mains" ? "badge-primary" : ""}`}>{stageLabel(paper.stage)}</span>
              <span style={{ flex: 1 }}>{paper.title}</span>
              {admin && <StatusBadge status={paper.status} />}
              <span className="muted small">
                {admin ? `${mts.length} micro-themes` : `${studied}/${mts.length} studied`}
              </span>
            </summary>
            {paper.subjects.length === 0 && <p className="muted small" style={{ marginLeft: 18 }}>No subjects yet.</p>}
            {paper.subjects.map((subject) => (
              <details key={subject.id} className="outline-subject" open>
                <summary>
                  <ChevronRight className="chev-rot" size={16} aria-hidden />
                  {subject.title}
                  {admin && subject.status === "draft" && <StatusBadge status="draft" />}
                </summary>
                {subject.topics.map((topic) => (
                  <div key={topic.id} className="outline-topic">
                    <h4>
                      {topic.title} {admin && topic.status === "draft" && <StatusBadge status="draft" />}
                    </h4>
                    {topic.micro_themes.length === 0 && <p className="muted small">No micro-themes yet.</p>}
                    {topic.micro_themes.map((mt) => (
                      <MicroRow key={mt.id} mt={mt} commission={commission} group={group} admin={admin} />
                    ))}
                  </div>
                ))}
              </details>
            ))}
          </details>
        );
      })}
    </div>
  );
}

function MicroRow({ mt, commission, group, admin }: { mt: MicroThemeNode; commission: string; group: string; admin: boolean }) {
  return (
    <div className="mt-row">
      {!admin && (
        <StudiedToggle commission={commission} group={group} code={mt.code} studied={mt.studied} title={mt.title} />
      )}
      <span className="code-chip">{mt.code}</span>
      <Link className="mt-title" href={trackPath(commission, group, `micro/${encodeURIComponent(mt.code)}`)}>
        {mt.title}
      </Link>
      <span className="mt-meta">
        {admin && <StatusBadge status={mt.status} />}
        <PriorityBadge priority={mt.priority} />
        {mt.is_dual_stage && <span className="badge badge-neutral">Prelims + Mains</span>}
        {mt.estimated_minutes ? (
          <span className="muted small row" style={{ gap: 3 }} title="Estimated study time">
            <Clock size={13} aria-hidden /> {mt.estimated_minutes}m
          </span>
        ) : null}
        <span className="muted small row" style={{ gap: 3 }} title="Notes available">
          <NotebookText size={13} aria-hidden />
          {mt.note_kinds.length ? mt.note_kinds.map((k) => KIND_SHORT[k]).join(" · ") : "—"}
        </span>
        <span className="muted small row" style={{ gap: 3 }} title="Mapped PYQs">
          <FileQuestion size={13} aria-hidden /> {mt.question_count}
        </span>
      </span>
    </div>
  );
}
