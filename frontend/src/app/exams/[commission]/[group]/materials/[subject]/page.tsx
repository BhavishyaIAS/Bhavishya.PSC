import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  ExternalLink,
  FileStack,
  ListOrdered,
  NotebookPen,
  Pencil,
  ScrollText,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JumpSelect } from "@/components/JumpSelect";
import { MaterialList } from "@/components/MaterialList";
import { NotesSteps } from "@/components/NotesSteps";
import { RichText } from "@/components/rich/RichText";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { syllabusTopics } from "@/lib/topics";
import { NOTE_KINDS, type Material, type Note, type NoteKind, type SubjectNode, type SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Material / Notes" };

const ICONS = { comprehensive: BookMarked, prelims: ScrollText, mains: NotebookPen };

type NotesResponse = {
  kind: NoteKind;
  results: { micro_theme: { id: number; code: string; title: string }; topic: { id: number; title: string }; note: Note }[];
};

/** Step 2 of the notes flow: one syllabus topic → choose the type of notes → read it chapter by chapter. */
export default async function TopicNotes(props: PageProps<"/exams/[commission]/[group]/materials/[subject]">) {
  const [{ commission, group, subject: subjectId }, sp] = await Promise.all([props.params, props.searchParams]);
  const base = `/tracks/${commission}/${group}`;
  const home = trackPath(commission, group, "materials");
  const here = `${home}/${subjectId}`;
  const [user, tree] = await Promise.all([requireUser(here), load<SyllabusTree>(`${base}/syllabus/`)]);
  const isAdmin = user.role === "admin";

  const topics = syllabusTopics(tree);
  const current = topics.find((t) => String(t.subject.id) === subjectId);
  if (!current) notFound();
  const { subject, byKind } = current;
  const kind = NOTE_KINDS.some((k) => k.key === sp.kind) ? (sp.kind as NoteKind) : undefined;
  const kindInfo = NOTE_KINDS.find((k) => k.key === kind);

  // Chapters (= the subject's topics); one chapter is shown at a time.
  const chapters = subject.topics.map((t) => ({
    id: t.id,
    label: t.title,
    count: kind ? t.micro_themes.filter((m) => m.note_kinds.includes(kind)).length : 0,
  }));
  const chapter = kind
    ? (chapters.find((c) => String(c.id) === sp.topic) ?? chapters.find((c) => c.count > 0) ?? chapters[0])
    : undefined;
  const chapterIndex = chapter ? chapters.indexOf(chapter) : -1;
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : undefined;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : undefined;
  const chapterHref = (id: number) => `${here}?kind=${kind}&topic=${id}`;

  const [notes, materials] = await Promise.all([
    kind && chapter
      ? load<NotesResponse>(`${base}/notes/?kind=${kind}&topic=${chapter.id}`)
      : Promise.resolve<NotesResponse>({ kind: "comprehensive", results: [] }),
    kind
      ? load<{ results: Material[] }>(`${base}/materials/?category=${kind}&subject=${subject.id}`)
      : Promise.resolve({ results: [] as Material[] }),
  ]);

  return (
    <div>
      <div className="flow-head">
        <div style={{ minWidth: 0 }}>
          <NotesSteps current={2} />
          <nav className="crumbs" aria-label="You are here" style={{ marginTop: 10 }}>
            <Link href={home}>Material / Notes</Link>›
            {kind ? <Link href={here}>{subject.title}</Link> : <span>{subject.title}</span>}
            {kindInfo && (
              <>
                ›<span>{kindInfo.label}</span>
              </>
            )}
          </nav>
          <h2 className="flow-title">
            {subject.title} {isAdmin && subject.status !== "published" && <StatusBadge status={subject.status} />}
          </h2>
          {!kind && (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Choose the type of notes to read.
            </p>
          )}
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <Link href={home} className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} aria-hidden /> All topics
          </Link>
          <JumpSelect
            label="Topic"
            className="jump-topic"
            value={`${home}/${subject.id}${kind ? `?kind=${kind}` : ""}`}
            options={topics.map((t) => ({
              href: `${home}/${t.subject.id}${kind ? `?kind=${kind}` : ""}`,
              label: t.subject.title,
            }))}
          />
        </div>
      </div>

      <div className={`note-types ${kind ? "" : "note-types-big"}`} role="list" aria-label="Type of notes">
        {NOTE_KINDS.map((k) => {
          const Icon = ICONS[k.key];
          const n = byKind[k.key];
          return (
            <Link
              key={k.key}
              role="listitem"
              href={`${here}?kind=${k.key}`}
              className="note-type"
              aria-current={k.key === kind ? "page" : undefined}
            >
              <span className="nt-icon" aria-hidden>
                <Icon size={21} />
              </span>
              <span>
                <b>{k.label}</b>
                <span>{k.blurb}</span>
                <span className={`nt-count ${n ? "" : "nt-none"}`}>{n ? `${n} section${n === 1 ? "" : "s"}` : "Not written yet"}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {!kind ? (
        <ChapterOverview subject={subject} />
      ) : (
        <div className={chapters.length > 1 ? "subject-tree" : undefined}>
          {chapters.length > 1 && (
            <nav className="side-list" aria-label="Chapters">
              <div className="group-label">Chapters</div>
              {chapters.map((c, i) => (
                <Link key={c.id} href={chapterHref(c.id)} aria-current={c.id === chapter?.id ? "true" : undefined}>
                  <span>
                    {i + 1}. {c.label}
                  </span>
                  <span className="count">{c.count}</span>
                </Link>
              ))}
            </nav>
          )}

          <div className="stack" style={{ gap: 18, minWidth: 0 }}>
            <section className="panel">
              {chapters.length === 0 ? (
                <EmptyState icon={NotebookPen} title="No chapters in this topic yet">
                  {isAdmin ? (
                    <>
                      Import a Word book into it from{" "}
                      <Link className="link" href="/manage/notes-import">
                        Manage → Import notes (Word)
                      </Link>
                      .
                    </>
                  ) : (
                    "Notes are being written — check back soon."
                  )}
                </EmptyState>
              ) : (
                <>
                  <div className="panel-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="eyebrow">{kindInfo!.label}</div>
                      <h3 className="chapter-title">
                        {chapters.length > 1 ? `Chapter ${chapterIndex + 1}: ` : ""}
                        {chapter!.label}
                      </h3>
                    </div>
                    {chapters.length > 1 && (
                      <JumpSelect
                        label="Chapter"
                        className="jump-chapter"
                        value={chapterHref(chapter!.id)}
                        options={chapters.map((c, i) => ({
                          href: chapterHref(c.id),
                          label: `${i + 1}. ${c.label} ${c.count ? `(${c.count})` : "(no notes yet)"}`,
                        }))}
                      />
                    )}
                  </div>
                  {notes.results.length > 2 && (
                    <details className="chapter-contents" open>
                      <summary>
                        <ListOrdered size={16} aria-hidden /> Contents · {notes.results.length} sections
                      </summary>
                      <ol>
                        {notes.results.map(({ micro_theme: mt }) => (
                          <li key={mt.id}>
                            <a href={`#n-${mt.id}`}>{mt.title}</a>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {notes.results.length === 0 ? (
                    <EmptyState icon={NotebookPen} title={`No ${kindInfo!.label.toLowerCase()} for this chapter yet`}>
                      {isAdmin ? "Write them in the content editor (links below)." : "They're being written — check back soon."}
                    </EmptyState>
                  ) : (
                    <div className="note-topic">
                      {notes.results.map(({ micro_theme: mt, note }) => (
                        <article key={mt.id} className="note-block" aria-labelledby={`n-${mt.id}`}>
                          <header className="row" style={{ gap: 8, marginBottom: 6 }}>
                            <span className="code-chip">{mt.code}</span>
                            <h4 id={`n-${mt.id}`} style={{ flex: 1, fontSize: 17 }}>
                              {mt.title}
                            </h4>
                            {isAdmin && <StatusBadge status={note.status} />}
                            {isAdmin && (
                              <Link href={`/manage/content/${mt.id}?kind=${kind}`} className="mini-btn" aria-label={`Edit ${kindInfo!.label} for ${mt.code}`}>
                                <Pencil size={14} aria-hidden /> Edit
                              </Link>
                            )}
                            <Link href={trackPath(commission, group, `micro/${encodeURIComponent(mt.code)}?note=${kind}`)} className="mini-btn">
                              <ExternalLink size={14} aria-hidden /> Open
                            </Link>
                          </header>
                          <RichText doc={note.body} />
                        </article>
                      ))}
                    </div>
                  )}
                  {chapters.length > 1 && (
                    <nav className="prevnext chapter-nav" aria-label="Previous and next chapter">
                      {prevChapter && (
                        <Link href={chapterHref(prevChapter.id)}>
                          <small>
                            <ArrowLeft size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Previous chapter
                          </small>
                          <b>{prevChapter.label}</b>
                        </Link>
                      )}
                      {nextChapter && (
                        <Link href={chapterHref(nextChapter.id)} className="next">
                          <small>
                            Next chapter <ArrowRight size={13} aria-hidden style={{ verticalAlign: "-2px" }} />
                          </small>
                          <b>{nextChapter.label}</b>
                        </Link>
                      )}
                    </nav>
                  )}
                  {isAdmin && chapter && <MissingNotes subject={subject} topicId={chapter.id} kind={kind} />}
                </>
              )}
            </section>

            <section className="panel" aria-labelledby="files">
              <div className="panel-head">
                <h2 id="files" style={{ fontSize: 18 }}>
                  <FileStack size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {kindInfo!.label} — files
                </h2>
                {isAdmin && (
                  <Link href={`/manage/materials?track=${commission}/${group}&category=${kind}`} className="btn btn-primary btn-sm">
                    <Upload size={15} aria-hidden /> Upload file
                  </Link>
                )}
              </div>
              {materials.results.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  No downloadable {kindInfo!.label.toLowerCase()} for {subject.title} yet
                  {isAdmin ? " — upload PDFs or slides and map them to this topic." : "."}
                </p>
              ) : (
                <MaterialList items={materials.results} isAdmin={isAdmin} />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

/** Before a note type is chosen: what the topic contains. */
function ChapterOverview({ subject }: { subject: SubjectNode }) {
  if (subject.topics.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="inside-h">
      <h3 id="inside-h" style={{ fontSize: 17, marginBottom: 10 }}>
        Inside {subject.title} · {subject.topics.length} chapter{subject.topics.length === 1 ? "" : "s"}
      </h3>
      <ol className="chapter-overview">
        {subject.topics.map((t) => (
          <li key={t.id}>
            {t.title} <span className="muted small">· {t.micro_themes.length} sections</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MissingNotes({ subject, topicId, kind }: { subject: SubjectNode; topicId: number; kind: NoteKind }) {
  const missing = subject.topics
    .filter((t) => t.id === topicId)
    .flatMap((t) => t.micro_themes.filter((m) => !m.note_kinds.includes(kind)));
  if (!missing.length) return null;
  return (
    <div className="alert alert-info" style={{ marginTop: 18 }}>
      <b>Admin:</b> {missing.length} section{missing.length > 1 ? "s" : ""} in this chapter {missing.length > 1 ? "have" : "has"} no note of
      this type yet —{" "}
      {missing.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ", "}
          <Link className="link" href={`/manage/content/${m.id}?kind=${kind}`}>
            {m.code}
          </Link>
        </span>
      ))}
      .
    </div>
  );
}
