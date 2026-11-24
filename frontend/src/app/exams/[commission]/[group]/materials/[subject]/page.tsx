import { ArrowLeft, ArrowRight, FileStack, Pencil, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialList } from "@/components/MaterialList";
import { ReaderTools } from "@/components/ReaderTools";
import { RichText } from "@/components/rich/RichText";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { topicTone } from "@/lib/topics";
import type { Material, MicroThemeNode, Note, NoteKind, SyllabusTree, TopicNode } from "@/lib/types";

export const metadata: Metadata = { title: "Material / Notes" };

type NotesResponse = {
  kind: NoteKind;
  results: { micro_theme: { id: number; code: string; title: string }; note: Note }[];
};
type OutlineResponse = { results: { micro_theme: { id: number }; note: { size: number } }[] };
type Entry = { mt: MicroThemeNode; chapter: TopicNode; ci: number; mi: number };

/**
 * One subject of Material / Notes.
 *   no ?section  its topics, syllabus-wise: chapter by chapter, each topic a line that opens its notes
 *   ?section=id  that topic's notes, with the previous and next topic
 */
export default async function SubjectNotes(props: PageProps<"/exams/[commission]/[group]/materials/[subject]">) {
  const [{ commission, group, subject: subjectId }, sp] = await Promise.all([props.params, props.searchParams]);
  const base = `/tracks/${commission}/${group}`;
  const home = trackPath(commission, group, "materials");
  const here = `${home}/${subjectId}`;
  const site = await getSite();
  const kinds = site.note_kinds.filter((k) => k.enabled);
  const kindInfo = kinds.find((k) => k.key === sp.kind) ?? kinds.find((k) => k.key === "comprehensive") ?? kinds[0];
  if (!kindInfo || !/^\d+$/.test(subjectId)) notFound();
  const kind = kindInfo.key;
  const q = `?kind=${kind}`;
  const notesQ = `${base}/notes/?kind=${kind}&subject=${subjectId}`;
  const sectionId = typeof sp.section === "string" && /^\d+$/.test(sp.section) ? sp.section : undefined;

  const [user, tree, outline, one] = await Promise.all([
    requireUser(here),
    load<SyllabusTree>(`${base}/syllabus/?notes=${kind}`),
    sectionId ? undefined : load<OutlineResponse>(`${notesQ}&fields=outline`),
    sectionId ? load<NotesResponse>(`${notesQ}&micro_theme=${sectionId}`) : undefined,
  ]);
  const isAdmin = user.role === "admin";
  const subject = tree.papers.flatMap((p) => p.subjects).find((s) => String(s.id) === subjectId);
  if (!subject) notFound();

  const entries: Entry[] = subject.topics.flatMap((chapter, ci) => chapter.micro_themes.map((mt, mi) => ({ mt, chapter, ci, mi })));
  const written = (e: Entry) => e.mt.note_kinds.includes(kind);
  const label = (e: Entry) => `${e.ci + 1}.${e.mi + 1}`;
  const sectionHref = (id: number) => `${here}${q}&section=${id}`;
  const crumbs = (
    <nav className="crumbs" aria-label="You are here">
      <Link href={`${home}${q}`}>Material / Notes</Link>›{sectionId ? <Link href={`${here}${q}`}>{subject.title}</Link> : <span>{subject.title}</span>}
    </nav>
  );

  // ─── one topic's notes ───
  if (sectionId) {
    const at = entries.findIndex((e) => String(e.mt.id) === sectionId);
    if (at < 0) notFound();
    const cur = entries[at];
    const note = one?.results[0]?.note;
    const readable = entries.filter((e) => written(e) || e === cur);
    const ri = readable.indexOf(cur);
    const prev = readable[ri - 1], next = readable[ri + 1];
    return (
      <div className={topicTone(subject.title, subject.look)}>
        {crumbs}
        <section className="panel topic-read">
          <header className="topic-read-head">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">
                Chapter {cur.ci + 1} · {cur.chapter.title.replace(/^\d+[.)]\s+/, "")}
              </div>
              <h2 className="topic-read-title">
                <span className="h-num">{label(cur)}</span> {cur.mt.title}
              </h2>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {isAdmin && note && <StatusBadge status={note.status} />}
              {isAdmin && (
                <Link href={`/manage/content/${cur.mt.id}?kind=${kind}`} className="mini-btn">
                  <Pencil size={14} aria-hidden /> Edit
                </Link>
              )}
              <ReaderTools />
            </div>
          </header>
          {note ? (
            <div className="reading">
              <RichText doc={note.body} />
            </div>
          ) : (
            <EmptyState title={`No ${kindInfo.label.toLowerCase()} for this topic yet`}>
              {isAdmin ? "Write them with Edit above." : "They're being written — check back soon."}
            </EmptyState>
          )}
          <nav className="prevnext section-nav" aria-label="Previous and next topic">
            {prev ? (
              <Link href={sectionHref(prev.mt.id)}>
                <small>
                  <ArrowLeft size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Previous · {label(prev)}
                </small>
                <b>{prev.mt.title}</b>
              </Link>
            ) : (
              <Link href={`${here}${q}`}>
                <small>
                  <ArrowLeft size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Back
                </small>
                <b>All topics of {subject.title}</b>
              </Link>
            )}
            {next ? (
              <Link href={sectionHref(next.mt.id)} className="next">
                <small>
                  Next · {label(next)} <ArrowRight size={13} aria-hidden style={{ verticalAlign: "-2px" }} />
                </small>
                <b>{next.mt.title}</b>
              </Link>
            ) : (
              <Link href={`${home}${q}`} className="next">
                <small>
                  Done <ArrowRight size={13} aria-hidden style={{ verticalAlign: "-2px" }} />
                </small>
                <b>All subjects</b>
              </Link>
            )}
          </nav>
        </section>
      </div>
    );
  }

  // ─── the subject's topics, syllabus-wise ───
  const sizes = new Map((outline?.results ?? []).map((r) => [r.micro_theme.id, r.note.size]));
  const total = entries.length, done = entries.filter(written).length;
  const materials = await load<{ results: Material[] }>(`${base}/materials/?category=${kind}&subject=${subject.id}`);
  return (
    <div className={topicTone(subject.title, subject.look)}>
      <div className="flow-head">
        <div style={{ minWidth: 0 }}>
          {crumbs}
          <h2 className="flow-title">
            {subject.title} {isAdmin && subject.status !== "published" && <StatusBadge status={subject.status} />}
          </h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {kindInfo.label} · {subject.topics.length} chapter{subject.topics.length === 1 ? "" : "s"} · {done} of {total} topics written
          </p>
        </div>
        <Link href={`${home}${q}`} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} aria-hidden /> All subjects
        </Link>
      </div>

      {subject.topics.length === 0 ? (
        <EmptyState title="No topics in this subject yet">{isAdmin ? "Add them in Manage → Syllabus." : "Check back soon."}</EmptyState>
      ) : (
        <div className="topic-index">
          {subject.topics.map((chapter, ci) => {
            const rows = entries.filter((e) => e.ci === ci);
            const w = rows.filter(written).length;
            return (
              <section key={chapter.id} id={`chapter-${chapter.id}`} className="panel topic-chapter" aria-labelledby={`ch-${chapter.id}`}>
                <header className="topic-chapter-head">
                  <span className="np-index" aria-hidden>
                    {String(ci + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`ch-${chapter.id}`}>{chapter.title.replace(/^\d+[.)]\s+/, "")}</h3>
                  <span className="np-meta">
                    {w} / {rows.length} written
                  </span>
                </header>
                {rows.length === 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    No topics yet.
                  </p>
                ) : (
                  <ol className="topic-lines">
                    {rows.map((e) => {
                      const size = sizes.get(e.mt.id);
                      const open = written(e) || isAdmin;
                      const inner = (
                        <>
                          <span className="tl-num">{label(e)}</span>
                          <span className="tl-title">{e.mt.title}</span>
                          <span className={`tl-meta ${written(e) ? "" : "tl-soon"}`}>
                            {written(e) ? (size ? readTime(size) : "Read") : isAdmin ? "Write" : "Coming soon"}
                          </span>
                        </>
                      );
                      return (
                        <li key={e.mt.id}>
                          {open ? (
                            <Link href={written(e) ? sectionHref(e.mt.id) : `/manage/content/${e.mt.id}?kind=${kind}`} className="topic-line">
                              {inner}
                            </Link>
                          ) : (
                            <span className="topic-line is-soon">{inner}</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      {(materials.results.length > 0 || isAdmin) && (
        <section className="panel" aria-labelledby="files" style={{ marginTop: 22 }}>
          <div className="panel-head">
            <h2 id="files" style={{ fontSize: 18 }}>
              <FileStack size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {kindInfo.label} — files
            </h2>
            {isAdmin && (
              <Link href={`/manage/materials?track=${commission}/${group}&category=${kind}`} className="btn btn-primary btn-sm">
                <Upload size={15} aria-hidden /> Upload file
              </Link>
            )}
          </div>
          {materials.results.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              No downloadable files for {subject.title} yet — upload PDFs or slides and map them to this subject.
            </p>
          ) : (
            <MaterialList items={materials.results} isAdmin={isAdmin} />
          )}
        </section>
      )}
    </div>
  );
}

/** About how long a note takes to read: ~6 characters a word, ~200 words a minute. */
function readTime(chars: number) {
  const min = Math.max(1, Math.round(chars / 6 / 200));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
