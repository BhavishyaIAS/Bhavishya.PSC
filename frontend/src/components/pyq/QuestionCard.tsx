import { ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";

import { RichText, isEmptyDoc } from "@/components/rich/RichText";
import { StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import type { Question } from "@/lib/types";

import { PrelimsOptions } from "./PrelimsCard";

export function QuestionCard({
  q,
  commission,
  group,
  isAdmin,
  showMicro = true,
}: {
  q: Question;
  commission: string;
  group: string;
  isAdmin: boolean;
  showMicro?: boolean;
}) {
  return (
    <article className="q-card" id={`q-${q.id}`}>
      <div className="q-meta">
        <span className="badge badge-neutral">{q.year}</span>
        <span>{q.paper_label}</span>
        <span>· Q{q.question_no}</span>
        {q.stage === "mains" && q.directive && <span className="badge badge-primary">{q.directive}</span>}
        {q.stage === "mains" && q.marks && <span className="badge">{q.marks} marks</span>}
        {q.tags.map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
        <span className="spacer" />
        {isAdmin && <StatusBadge status={q.status} />}
        {isAdmin && (
          <Link href={`/manage/questions/${q.id}`} className="mini-btn" aria-label={`Edit question ${q.question_no} (${q.year})`}>
            <Pencil size={14} aria-hidden /> Edit
          </Link>
        )}
      </div>
      <p className="q-text">{q.text}</p>
      {q.stage === "prelims" ? (
        <PrelimsOptions q={q} />
      ) : isEmptyDoc(q.model_answer) ? (
        <p className="muted small">Model answer coming soon.</p>
      ) : (
        <details className="answer-box">
          <summary className="answer-summary">
            <ChevronRight className="chev-rot" size={16} aria-hidden /> Model answer
          </summary>
          <RichText doc={q.model_answer} />
        </details>
      )}
      {showMicro && q.micro_theme && (
        <div className="q-foot">
          <Link className="mt-link" href={trackPath(commission, group, `micro/${encodeURIComponent(q.micro_theme.code)}`)}>
            <span className="code-chip">{q.micro_theme.code}</span>
            {q.micro_theme.subject.title} › {q.micro_theme.topic.title} › {q.micro_theme.title}
          </Link>
        </div>
      )}
    </article>
  );
}
