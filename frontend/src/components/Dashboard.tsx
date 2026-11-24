import { ArrowRight, Bookmark, CalendarClock, Flame, PenLine, Target } from "lucide-react";
import Link from "next/link";

import { trackPath } from "@/lib/format";

type Ref = {
  code: string;
  id: number;
  title: string;
  subject: string;
  subject_id: number;
  notes_kind: string;
  note_kind?: string;
  next_due?: string;
  position?: number;
};
export type DashboardData = {
  streak: number;
  topics: { general: number; with_notes: number; completed: number; studying: number; attention: number; due: number };
  prelims: { available: number; answered: number; attempts: number; correct: number; accuracy: number | null; this_week: number };
  mains: { drafts: number };
  bookmarks: number;
  kept_topics?: Ref[];
  continue: Ref[];
  due: Ref[];
  attention: Ref[];
  by_subject: { subject_id: number; subject: string; attempted: number; correct: number; accuracy: number }[];
  weak: { subject_id: number; subject: string; attempted: number; accuracy: number }[];
  next: { kind: string; text: string; target?: Ref | null; subject_id?: number }[];
};

/** Where a topic opens: its notes (a Notes module's section) or its topic page (the general syllabus). */
function topicHref(c: string, g: string, r: Ref, resume = false) {
  const kind = r.note_kind || r.notes_kind;
  return kind
    ? trackPath(c, g, `materials/${r.subject_id}?kind=${kind}&section=${r.id}${resume ? "&resume=1" : ""}`)
    : trackPath(c, g, `micro/${encodeURIComponent(r.code)}`);
}

/**
 * The exam's dashboard: what to do next, where the student left off, what is due for revision, how their
 * Prelims answers are going. Only the student's own record; where there is none yet, it says how to begin.
 */
export function Dashboard({ d, commission, group }: { d: DashboardData; commission: string; group: string }) {
  const nextHref = (n: DashboardData["next"][number]) =>
    n.target ? topicHref(commission, group, n.target, n.kind === "continue" && (n.target.position ?? 0) > 0.02) : n.subject_id ? trackPath(commission, group, `prelims?subject=${n.subject_id}&mine=unattempted`) : trackPath(commission, group, "prelims?mine=unattempted");
  const fresh = !d.continue.length && !d.prelims.attempts && !d.topics.completed && !d.topics.studying;
  return (
    <section className="dash" aria-labelledby="dash-h">
      <div className="dash-card dash-head">
        <h2 id="dash-h">Your preparation</h2>
        {d.streak > 0 ? (
          <span className="dash-streak">
            <Flame size={16} aria-hidden /> {d.streak} day{d.streak === 1 ? "" : "s"} in a row
          </span>
        ) : (
          <span className="muted small">Your study days will be counted here.</span>
        )}
      </div>

      {fresh ? (
        <div className="dash-card dash-start">
          <b>Begin here.</b> Open <Link href={trackPath(commission, group, "materials")}>Material / Notes</Link> and read a topic, or answer a few{" "}
          <Link href={trackPath(commission, group, "prelims?mine=unattempted")}>Prelims questions</Link>. Your progress, what is due for revision and where you
          are strong or weak will appear here as you go.
        </div>
      ) : (
        <div className="dash-grid">
          <div className="dash-card dash-next">
            <h3>
              <Target size={17} aria-hidden /> Next
            </h3>
            {d.next.length ? (
              <ol>
                {d.next.map((n, i) => (
                  <li key={i}>
                    <Link href={nextHref(n)}>
                      {n.text} <ArrowRight size={14} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">You are up to date. Pick a new topic in Material / Notes.</p>
            )}
          </div>

          <div className="dash-card">
            <h3>Continue where you left off</h3>
            {d.continue.length ? (
              <ul className="dash-list">
                {d.continue.map((r) => {
                  const read = Math.round((r.position ?? 0) * 100);
                  return (
                    <li key={r.code}>
                      <Link href={topicHref(commission, group, r, read > 2)}>{r.title}</Link>
                      <span className="muted small">
                        {r.subject}
                        {read > 2 && ` · ${read}% read`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">Topics you open will be listed here.</p>
            )}
          </div>

          {!!d.kept_topics?.length && (
            <div className="dash-card">
              <h3>
                <Bookmark size={17} aria-hidden /> Kept topics
              </h3>
              <ul className="dash-list">
                {d.kept_topics.map((r) => (
                  <li key={r.code}>
                    <Link href={topicHref(commission, group, r)}>{r.title}</Link>
                    <span className="muted small">{r.subject}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="dash-card">
            <h3>
              <CalendarClock size={17} aria-hidden /> Revision
            </h3>
            <p className="dash-figure">
              <b>{d.topics.due}</b> due · <b>{d.topics.completed}</b> completed · <b>{d.topics.studying}</b> studying
            </p>
            {d.due.length > 0 && (
              <ul className="dash-list">
                {d.due.map((r) => (
                  <li key={r.code}>
                    <Link href={topicHref(commission, group, r)}>{r.title}</Link>
                    <span className="muted small">{r.subject}</span>
                  </li>
                ))}
              </ul>
            )}
            {d.attention.length > 0 && (
              <p className="small">
                Needs attention:{" "}
                {d.attention.map((r, i) => (
                  <span key={r.code}>
                    {i > 0 && ", "}
                    <Link href={topicHref(commission, group, r)}>{r.title}</Link>
                  </span>
                ))}
              </p>
            )}
          </div>

          <div className="dash-card">
            <h3>Prelims practice</h3>
            {d.prelims.attempts ? (
              <>
                <p className="dash-figure">
                  <b>{d.prelims.accuracy}%</b> right · {d.prelims.answered} of {d.prelims.available} questions answered · {d.prelims.this_week} this week
                </p>
                {d.by_subject.length > 0 && (
                  <ul className="dash-bars">
                    {d.by_subject.slice(0, 5).map((s) => (
                      <li key={s.subject_id}>
                        <span>{s.subject}</span>
                        <span className="dash-bar" aria-hidden>
                          <span style={{ width: `${s.accuracy}%` }} />
                        </span>
                        <span className="small">
                          {s.accuracy}% of {s.attempted}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.prelims.attempts > d.prelims.correct && (
                  <p className="small">
                    <Link href={trackPath(commission, group, "prelims?mine=incorrect")}>Review the questions you answered wrong</Link>
                  </p>
                )}
                {d.weak.length > 0 && (
                  <p className="small">
                    Weakest:{" "}
                    {d.weak.map((w, i) => (
                      <span key={w.subject_id}>
                        {i > 0 && ", "}
                        <Link href={trackPath(commission, group, `prelims?subject=${w.subject_id}`)}>
                          {w.subject} ({w.accuracy}%)
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                No answers yet. <Link href={trackPath(commission, group, "prelims?mine=unattempted")}>Answer some Prelims questions</Link> to see your accuracy by subject.
              </p>
            )}
          </div>

          <div className="dash-card dash-small">
            <h3>
              <PenLine size={17} aria-hidden /> Mains practice
            </h3>
            <Link href={trackPath(commission, group, "mains?mine=drafted")}>
              <PenLine size={16} aria-hidden /> {d.mains.drafts} Mains answer{d.mains.drafts === 1 ? "" : "s"} written
            </Link>
            <Link href={trackPath(commission, group, "prelims?mine=bookmarked")}>
              <Bookmark size={16} aria-hidden /> {d.bookmarks} question{d.bookmarks === 1 ? "" : "s"} kept
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
