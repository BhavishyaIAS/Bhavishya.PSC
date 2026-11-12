import { ArrowLeft, ArrowRight, BookMarked, ExternalLink, FileStack, ListOrdered, NotebookPen, Pencil, ScrollText, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ChapterPicker } from "@/components/ChapterPicker";
import { MaterialList } from "@/components/MaterialList";
import { RichText } from "@/components/rich/RichText";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { NOTE_KINDS, type Material, type Note, type NoteKind, type SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Material / Notes" };

const ICONS = { comprehensive: BookMarked, prelims: ScrollText, mains: NotebookPen };

type NotesResponse = {
  kind: NoteKind;
  results: { micro_theme: { id: number; code: string; title: string }; topic: { id: number; title: string }; note: Note }[];
};

export default async function MaterialsTab(props: PageProps<"/exams/[commission]/[group]/materials">) {
  const [{ commission, group }, sp] = await Promise.all([props.params, props.searchParams]);
  const kind = (NOTE_KINDS.some((k) => k.key === sp.kind) ? sp.kind : "comprehensive") as NoteKind;
  const base = `/tracks/${commission}/${group}`;
  const track = `${commission}/${group}`;
  const [user, tree, materials] = await Promise.all([
    requireUser(trackPath(commission, group, "materials")),
    load<SyllabusTree>(`${base}/syllabus/`),
    load<{ results: Material[] }>(`${base}/materials/?category=${kind}`),
  ]);
  const isAdmin = user.role === "admin";
  const kindInfo = NOTE_KINDS.find((k) => k.key === kind)!;

  // Subjects (grouped by paper) with how many micro-themes carry this kind of note.
  const subjects = tree.papers.flatMap((p) =>
    p.subjects.map((s) => ({
      paper: p,
      subject: s,
      total: s.topics.reduce((n, t) => n + t.micro_themes.length, 0),
      withNotes: s.topics.reduce((n, t) => n + t.micro_themes.filter((m) => m.note_kinds.includes(kind)).length, 0),
    })),
  );
  const requested = subjects.find((s) => String(s.subject.id) === sp.subject);
  const current = requested ?? subjects.find((s) => s.withNotes > 0) ?? subjects[0];

  // Chapters (= topics) of the subject being read; one chapter is shown at a time.
  const chapters = (current?.subject.topics ?? []).map((t) => ({
    id: t.id,
    label: t.title,
    count: t.micro_themes.filter((m) => m.note_kinds.includes(kind)).length,
    total: t.micro_themes.length,
  }));
  const chapter =
    chapters.find((c) => String(c.id) === sp.topic) ?? chapters.find((c) => c.count > 0) ?? chapters[0];
  const chapterIndex = chapter ? chapters.indexOf(chapter) : -1;
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : undefined;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : undefined;
  const notes = chapter
    ? await load<NotesResponse>(`${base}/notes/?kind=${kind}&topic=${chapter.id}`)
    : { kind, results: [] };
  const chapterHref = (id: number) => `?kind=${kind}&subject=${current?.subject.id}&topic=${id}`;

  return (
    <div>
      <div className="note-types" role="list">
        {NOTE_KINDS.map((k) => {
          const Icon = ICONS[k.key];
          return (
            <Link key={k.key} role="listitem" href={`?kind=${k.key}`} className="note-type" aria-current={k.key === kind ? "page" : undefined}>
              <span className="nt-icon" aria-hidden>
                <Icon size={21} />
              </span>
              <span>
                <b>{k.label}</b>
                <span>{k.blurb}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No study material in this track yet"
          action={
            isAdmin && (
              <Link href={`/manage/syllabus?track=${track}`} className="btn btn-primary">
                <Upload size={17} aria-hidden /> Build the syllabus first
              </Link>
            )
          }
        >
          {isAdmin
            ? "Notes are written per micro-theme, so start by adding this track's syllabus."
            : "Notes for this exam are being prepared. Check back soon."}
        </EmptyState>
      ) : (
        <div className="subject-tree">
          <nav className="side-list" aria-label="Subjects">
            {tree.papers.map((p) => (
              <div key={p.id}>
                <div className="group-label">{p.title}</div>
                {subjects
                  .filter((s) => s.paper.id === p.id)
                  .map((s) => (
                    <div key={s.subject.id}>
                      <Link
                        href={`?kind=${kind}&subject=${s.subject.id}`}
                        aria-current={s.subject.id === current?.subject.id && chapters.length <= 1 ? "true" : undefined}
                        className={s.subject.id === current?.subject.id ? "subject-open" : undefined}
                      >
                        <span>{s.subject.title}</span>
                        <span className="count" title={`${s.withNotes} of ${s.total} micro-themes have ${kindInfo.label}`}>
                          {s.withNotes}/{s.total}
                        </span>
                      </Link>
                      {s.subject.id === current?.subject.id && chapters.length > 1 && (
                        <div className="chapter-links">
                          {chapters.map((c, i) => (
                            <Link key={c.id} href={chapterHref(c.id)} aria-current={c.id === chapter?.id ? "true" : undefined}>
                              <span>
                                {i + 1}. {c.label}
                              </span>
                              <span className="count">{c.count}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </nav>

          <div className="stack" style={{ gap: 18 }}>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">{kindInfo.label}</div>
                  <h2 style={{ fontSize: 24, marginTop: 4 }}>{current?.subject.title}</h2>
                  <p className="muted small" style={{ margin: "4px 0 0" }}>
                    {current?.paper.title}
                    {chapters.length > 1 ? ` · ${chapters.length} chapters — choose one to read` : ""}
                  </p>
                </div>
                {chapter && chapters.length > 1 && (
                  <ChapterPicker chapters={chapters} value={chapter.id} />
                )}
              </div>
              {chapter && <h3 className="chapter-title">{chapters.length > 1 ? `Chapter ${chapterIndex + 1}: ` : ""}{chapter.label}</h3>}
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
                <EmptyState icon={NotebookPen} title={`No ${kindInfo.label.toLowerCase()} for this chapter yet`}>
                  {isAdmin ? "Open a micro-theme below in the content editor to write them." : "They're being written — check back soon."}
                </EmptyState>
              ) : (
                [{ title: chapter?.label ?? "", items: notes.results }].map((topic) => (
                  <div key={topic.title} className="note-topic">
                    {topic.items.map(({ micro_theme: mt, note }) => (
                      <article key={mt.id} className="note-block" aria-labelledby={`n-${mt.id}`}>
                        <header className="row" style={{ gap: 8, marginBottom: 6 }}>
                          <span className="code-chip">{mt.code}</span>
                          <h4 id={`n-${mt.id}`} style={{ flex: 1, fontSize: 17 }}>
                            {mt.title}
                          </h4>
                          {isAdmin && <StatusBadge status={note.status} />}
                          {isAdmin && (
                            <Link href={`/manage/content/${mt.id}?kind=${kind}`} className="mini-btn" aria-label={`Edit ${kindInfo.label} for ${mt.code}`}>
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
                ))
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
              {isAdmin && current && chapter && (
                <MissingNotes current={current.subject} topicId={chapter.id} kind={kind} />
              )}
            </section>

            <section className="panel" aria-labelledby="files">
              <div className="panel-head">
                <h2 id="files">
                  <FileStack size={19} aria-hidden style={{ verticalAlign: "-3px" }} /> {kindInfo.label} — files
                </h2>
                {isAdmin && (
                  <Link href={`/manage/materials?track=${track}&category=${kind}`} className="btn btn-primary btn-sm">
                    <Upload size={15} aria-hidden /> Upload file
                  </Link>
                )}
              </div>
              {materials.results.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  No downloadable {kindInfo.label.toLowerCase()} yet{isAdmin ? " — upload PDFs, slides or documents and map them to the syllabus." : "."}
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

function MissingNotes({
  current,
  topicId,
  kind,
}: {
  current: SyllabusTree["papers"][number]["subjects"][number];
  topicId: number;
  kind: NoteKind;
}) {
  const missing = current.topics
    .filter((t) => t.id === topicId)
    .flatMap((t) => t.micro_themes.filter((m) => !m.note_kinds.includes(kind)));
  if (!missing.length) return null;
  return (
    <div className="alert alert-info" style={{ marginTop: 18 }}>
      <b>Admin:</b> {missing.length} micro-theme{missing.length > 1 ? "s" : ""} here {missing.length > 1 ? "have" : "has"} no note of this kind yet —{" "}
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
