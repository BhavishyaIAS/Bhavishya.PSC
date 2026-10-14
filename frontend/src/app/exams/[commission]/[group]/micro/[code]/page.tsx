import { ArrowLeft, ArrowRight, BookA, Clock, FileQuestion, Pencil, PlayCircle, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MaterialList } from "@/components/MaterialList";
import { QuestionCard } from "@/components/pyq/QuestionCard";
import { RichText } from "@/components/rich/RichText";
import { StudiedToggle } from "@/components/StudiedToggle";
import { EmptyState, PriorityBadge, StatusBadge } from "@/components/ui/bits";
import { stageLabel, trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { NOTE_KINDS, type MicroThemeDetail, type NoteKind } from "@/lib/types";

export async function generateMetadata(props: PageProps<"/exams/[commission]/[group]/micro/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  return { title: decodeURIComponent(code).toUpperCase() };
}

export default async function MicroThemePage(props: PageProps<"/exams/[commission]/[group]/micro/[code]">) {
  const [{ commission, group, code: rawCode }, sp] = await Promise.all([props.params, props.searchParams]);
  const code = decodeURIComponent(rawCode);
  const self = trackPath(commission, group, `micro/${encodeURIComponent(code)}`);
  const [user, d] = await Promise.all([
    requireUser(self),
    load<MicroThemeDetail>(`/tracks/${commission}/${group}/micro-themes/${encodeURIComponent(code)}/`, self),
  ]);
  const isAdmin = user.role === "admin";
  const available = NOTE_KINDS.filter((k) => d.notes[k.key]);
  const requested = NOTE_KINDS.find((k) => k.key === sp.note)?.key as NoteKind | undefined;
  const kind: NoteKind | undefined = requested && d.notes[requested] ? requested : available[0]?.key;
  const note = kind ? d.notes[kind] : undefined;
  const mt = d.micro_theme;
  const prelimsQs = d.questions.filter((q) => q.stage === "prelims");
  const mainsQs = d.questions.filter((q) => q.stage === "mains");
  const mtHref = (c: string) => trackPath(commission, group, `micro/${encodeURIComponent(c)}`);

  return (
    <div className="mt-layout">
      <div className="stack" style={{ gap: 20, minWidth: 0 }}>
        <div>
          <nav className="crumbs" aria-label="Syllabus position">
            <span className="badge badge-neutral">{stageLabel(d.breadcrumb.paper.stage)}</span>
            <span>{d.breadcrumb.paper.title}</span>›<span>{d.breadcrumb.subject.title}</span>›<span>{d.breadcrumb.topic.title}</span>
          </nav>
          <h1 style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>{mt.title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="code-chip">{mt.code}</span>
            <PriorityBadge priority={mt.priority} />
            {mt.is_dual_stage && <span className="badge badge-neutral">Prelims + Mains</span>}
            {mt.estimated_minutes && (
              <span className="muted small row" style={{ gap: 4 }}>
                <Clock size={14} aria-hidden /> ~{mt.estimated_minutes} min
              </span>
            )}
            {isAdmin && <StatusBadge status={mt.status} />}
            <span className="muted small">
              · {d.position.index} of {d.position.total} in this track
            </span>
          </div>
        </div>

        <section className="panel" aria-labelledby="notes-h">
          <div className="panel-head">
            <h2 id="notes-h" className="sr-only">
              Notes
            </h2>
            <div className="segmented" role="group" aria-label="Note type">
              {NOTE_KINDS.map((k) =>
                d.notes[k.key] ? (
                  <Link key={k.key} href={`?note=${k.key}`} aria-current={k.key === kind ? "page" : undefined} scroll={false}>
                    {k.label}
                  </Link>
                ) : (
                  <span key={k.key} className="seg-disabled" title="Not written yet">
                    {k.label}
                  </span>
                ),
              )}
            </div>
            {isAdmin && (
              <Link href={`/manage/content/${mt.id}${kind ? `?kind=${kind}` : ""}`} className="btn btn-secondary btn-sm">
                <Pencil size={15} aria-hidden /> Edit content
              </Link>
            )}
          </div>
          {note ? (
            <>
              {isAdmin && note.status === "draft" && (
                <div className="alert alert-info" style={{ marginBottom: 14 }}>
                  This note is a <b>draft</b> — students can&apos;t see it yet.
                </div>
              )}
              <RichText doc={note.body} />
            </>
          ) : (
            <EmptyState icon={NotebookPen} title="Notes coming soon">
              {isAdmin ? "No notes yet — use “Edit content” to write them." : "Notes for this micro-theme are being written."}
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="pyq-h">
          <div className="panel-head">
            <h2 id="pyq-h">
              <FileQuestion size={19} aria-hidden style={{ verticalAlign: "-3px" }} /> Previous-year questions on this micro-theme
            </h2>
            <span className="muted small">
              {prelimsQs.length} prelims · {mainsQs.length} mains
            </span>
          </div>
          {d.questions.length === 0 ? (
            <p className="muted">No PYQs mapped here yet.</p>
          ) : (
            <div className="q-list">
              {[...prelimsQs, ...mainsQs].map((q) => (
                <QuestionCard key={q.id} q={q} commission={commission} group={group} isAdmin={isAdmin} showMicro={false} />
              ))}
            </div>
          )}
        </section>

        <nav className="prevnext" aria-label="Previous and next micro-theme">
          {d.prev && (
            <Link href={mtHref(d.prev.code)}>
              <small>
                <ArrowLeft size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Previous
              </small>
              <b>{d.prev.title}</b>
              <span className="code-chip" style={{ alignSelf: "flex-start" }}>
                {d.prev.code}
              </span>
            </Link>
          )}
          {d.next && (
            <Link href={mtHref(d.next.code)} className="next">
              <small>
                Next <ArrowRight size={13} aria-hidden style={{ verticalAlign: "-2px" }} />
              </small>
              <b>{d.next.title}</b>
              <span className="code-chip" style={{ alignSelf: "flex-end" }}>
                {d.next.code}
              </span>
            </Link>
          )}
        </nav>
      </div>

      <aside className="mt-aside" aria-label="Micro-theme resources">
        <StudiedToggle commission={commission} group={group} code={mt.code} studied={d.studied} title={mt.title} variant="button" />

        <section className="card">
          <h3 className="aside-h">
            <PlayCircle size={17} aria-hidden /> Videos
          </h3>
          {d.videos.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>No videos yet.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {d.videos.map((v) => (
                <a key={v.id} className="video-item" href={v.url} target="_blank" rel="noopener noreferrer nofollow">
                  <span className="vi" aria-hidden>
                    <PlayCircle size={18} />
                  </span>
                  <span>{v.title}</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h3 className="aside-h">
            <BookA size={17} aria-hidden /> Glossary
          </h3>
          {d.glossary.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>No terms yet.</p>
          ) : (
            <dl className="gloss" style={{ margin: 0 }}>
              {d.glossary.map((g) => (
                <div key={g.id}>
                  <dt>{g.term}</dt>
                  <dd>{g.definition}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {d.materials.length > 0 && (
          <section className="card">
            <h3 className="aside-h">Study files</h3>
            <MaterialList items={d.materials} isAdmin={isAdmin} />
          </section>
        )}
      </aside>
    </div>
  );
}
