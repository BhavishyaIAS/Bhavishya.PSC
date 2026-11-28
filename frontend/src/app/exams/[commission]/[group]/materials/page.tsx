import {
  BookMarked,
  BookUp,
  ChevronRight,
  ListTree,
  Newspaper,
  NotebookPen,
  ScrollText,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { syllabusTopics, topicIcon, topicTone } from "@/lib/topics";
import type { NoteKind, SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Material & Notes" };

/**
 * Material & Notes. First four blocks, two by two: Syllabus-Wise Material, Prelims Notes (quick revision), Mains
 * Notes (Q&A-style) and Current Affairs (coming soon). A type opens its subjects, with the types down the left to
 * switch between them; a subject opens its topics, syllabus-wise, and a topic its notes. One request for the
 * syllabus (the Notes module's own, where it has one).
 */
export default async function MaterialsTab(
  props: PageProps<"/exams/[commission]/[group]/materials">,
) {
  const [{ commission, group }, sp] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const here = trackPath(commission, group, "materials");

  // Old links (?subject=…&kind=…&topic=…) open the subject's own page.
  if (typeof sp.subject === "string" && /^\d+$/.test(sp.subject)) {
    const keep = new URLSearchParams();
    for (const key of ["kind", "topic"])
      if (typeof sp[key] === "string") keep.set(key, sp[key] as string);
    redirect(`${here}/${sp.subject}${keep.size ? `?${keep}` : ""}`);
  }

  const site = await getSite();
  const kinds = site.note_kinds.filter((k) => k.enabled);

  // the types of notes down the left; the chosen one's subjects beside them
  const kindNav = (current?: string) => (
    <nav className="topic-side split-side" aria-label="Type of notes">
      <div className="topic-side-title">
        <Link href={here} className="link-plain">
          Material &amp; Notes
        </Link>
      </div>
      <ul className="side-links">
        {kinds.map((k) => {
          const Icon = KIND_ICONS[k.key];
          return (
            <li key={k.key}>
              <Link
                href={`${here}?kind=${k.key}`}
                className={`side-link kind-${k.key}`}
                aria-current={k.key === current ? "page" : undefined}
              >
                <span className="kind-tab-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="side-link-text">
                  <b>{k.label}</b>
                  {KIND_TAGS[k.key] && <small>{KIND_TAGS[k.key]}</small>}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <span className="side-link side-link-soon" aria-disabled="true">
            <span className="kind-tab-icon" aria-hidden>
              <Newspaper size={20} />
            </span>
            <span className="side-link-text">
              <b>Current Affairs</b>
              <small>Coming soon</small>
            </span>
          </span>
        </li>
      </ul>
    </nav>
  );

  // First, the four blocks: the types of notes, and current affairs to come. A type opens its subjects.
  if (!kinds.some((k) => k.key === sp.kind)) {
    await requireUser(here);
    return (
      <div className="material-home">
        <div className="flow-head">
          <h2 className="flow-title">Material &amp; Notes</h2>
        </div>
        <nav className="material-blocks" aria-label="Material and notes">
          {kinds.map((k) => {
            const Icon = KIND_ICONS[k.key];
            return (
              <Link key={k.key} href={`${here}?kind=${k.key}`} className={`note-type material-block kind-${k.key}`}>
                <span className="nt-icon" aria-hidden>
                  <Icon size={26} />
                </span>
                <span className="mb-text">
                  <b>{k.label}</b>
                  {KIND_TAGS[k.key] && <span className="mb-tag">{KIND_TAGS[k.key]}</span>}
                </span>
                <ChevronRight className="mb-go" size={20} aria-hidden />
              </Link>
            );
          })}
          <div className="note-type material-block material-block-soon" aria-disabled="true">
            <span className="nt-icon" aria-hidden>
              <Newspaper size={26} />
            </span>
            <span className="mb-text">
              <b>Current Affairs</b>
              <span className="mb-tag">Coming soon</span>
            </span>
          </div>
        </nav>
      </div>
    );
  }
  const kind = (
    kinds.find((k) => k.key === sp.kind) ??
    kinds.find((k) => k.key === "comprehensive") ??
    kinds[0]
  )?.key as NoteKind | undefined;
  const [user, tree] = await Promise.all([
    requireUser(here),
    load<SyllabusTree>(
      `/tracks/${commission}/${group}/syllabus/${kind ? `?notes=${kind}` : ""}`,
    ),
  ]);
  const isAdmin = user.role === "admin";
  const track = `${commission}/${group}`;
  const papers = tree.papers.filter(
    (p) => p.subjects.length > 0 && !NOT_IN_NOTES.test(p.title),
  );
  const paperTopics = papers.map((paper) =>
    syllabusTopics({ ...tree, papers: [paper] }),
  );
  const firstNumber = paperTopics.map((_, i) =>
    paperTopics.slice(0, i).reduce((a, t) => a + t.length, 1),
  );

  const kindLabel =
    kinds.find((k) => k.key === kind)?.label ?? "Material & Notes";
  return (
    <div className="topic-layout split">
      {kindNav(kind)}
      <div className="split-main">
        <div className="flow-head">
          <h2 className="flow-title">{kindLabel}</h2>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {isAdmin && (
              <>
                <Link
                  href={`/manage/syllabus?track=${track}`}
                  className="btn btn-ghost btn-sm"
                >
                  <ListTree size={15} aria-hidden /> Edit syllabus
                </Link>
                <Link
                  href="/manage/notes-import"
                  className="btn btn-secondary btn-sm"
                >
                  <BookUp size={15} aria-hidden /> Import notes (Word)
                </Link>
              </>
            )}
          </div>
        </div>

        {papers.length === 0 ? (
          <EmptyState icon={Upload} title="No subjects here yet">
            {isAdmin
              ? "Add the syllabus (papers, subjects, topics) in Manage → Syllabus."
              : "Notes for this exam are being prepared. Check back soon."}
          </EmptyState>
        ) : (
          <div className="notes-papers">
            {papers.map((paper, pi) => {
              const topics = paperTopics[pi];
              const chapterCount = topics.reduce((a, t) => a + t.chapters, 0);
              const sectionCount = topics.reduce((a, t) => a + t.sections, 0);
              const [kicker, title] = paperParts(paper.title);
              return (
                <section
                  key={paper.id}
                  className="notes-paper"
                  aria-labelledby={`np-${paper.id}`}
                >
                  {papers.length > 1 && (
                    <header className="np-head">
                      <span className="np-index" aria-hidden>
                        {String(pi + 1).padStart(2, "0")}
                      </span>
                      <div className="np-titles">
                        {kicker && <span className="np-kicker">{kicker}</span>}
                        <h3 id={`np-${paper.id}`} className="np-title">
                          {title}{" "}
                          {isAdmin && paper.status !== "published" && (
                            <StatusBadge status={paper.status} />
                          )}
                        </h3>
                      </div>
                      <span className="np-meta">
                        {topics.length} subject{topics.length === 1 ? "" : "s"}{" "}
                        · {chapterCount} chapter{chapterCount === 1 ? "" : "s"}{" "}
                        · {sectionCount} topics
                      </span>
                    </header>
                  )}
                  <div className="topic-grid notes-topic-grid">
                    {topics.map(
                      ({ subject, chapters, sections, byKind }, ti) => {
                        const Icon = topicIcon(subject.title, subject.look);
                        const written = kind ? byKind[kind] : 0;
                        return (
                          <Link
                            key={subject.id}
                            href={`${here}/${subject.id}${kind ? `?kind=${kind}` : ""}`}
                            className={`topic-card ${topicTone(subject.title, subject.look)}`}
                          >
                            <span className="tc-icon" aria-hidden>
                              <Icon size={22} />
                            </span>
                            <span className="tc-body">
                              <span className="tc-num">
                                {String(firstNumber[pi] + ti).padStart(2, "0")}
                              </span>
                              <b className="tc-title">{subject.title}</b>
                              <span className="tc-meta">
                                {chapters} chapter{chapters === 1 ? "" : "s"} ·{" "}
                                {sections} topic{sections === 1 ? "" : "s"}
                              </span>
                              <span
                                className={`tc-status ${written ? "" : "tc-soon"}`}
                              >
                                {written
                                  ? written === sections
                                    ? "All notes written"
                                    : `${written} of ${sections} written`
                                  : "Notes coming soon"}
                              </span>
                              {written > 0 && (
                                <span className="tc-bar" aria-hidden>
                                  <span
                                    style={{
                                      width: `${Math.round((100 * written) / Math.max(sections, 1))}%`,
                                    }}
                                  />
                                </span>
                              )}
                              {isAdmin && subject.status !== "published" && (
                                <StatusBadge status={subject.status} />
                              )}
                            </span>
                            <ChevronRight
                              className="tc-go"
                              size={18}
                              aria-hidden
                            />
                          </Link>
                        );
                      },
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_ICONS = {
  comprehensive: BookMarked,
  prelims: ScrollText,
  mains: NotebookPen,
};

/** The line under each type's name on the blocks: what kind of reading it is. */
const KIND_TAGS: Partial<Record<NoteKind, string>> = {
  prelims: "Quick Revision",
  mains: "Q&A-style",
};

/** Papers Material / Notes leaves out: the qualifying languages, the essay, and the mental-ability paper. */
const NOT_IN_NOTES =
  /^(english|telugu)\b|general essay|mental\s*(&|and)\s*psychological/i;

/** "Paper II — History, Culture & Geography" → ["Paper II", "History, Culture & Geography"]. */
function paperParts(title: string): [string | undefined, string] {
  const m = /^(Paper\s+[IVXLC\d]+[A-Z]?)\s*[—–:-]\s*(.+)$/.exec(title);
  return m ? [m[1], m[2]] : [undefined, title];
}
