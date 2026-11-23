import { ArrowLeft, BookMarked, BookUp, ChevronRight, ListTree, NotebookPen, ScrollText, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotesSteps as Steps } from "@/components/NotesSteps";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { syllabusTopics, topicIcon, topicTone } from "@/lib/topics";
import { getSite } from "@/lib/site";
import type { NoteKind, SyllabusTree } from "@/lib/types";

const KIND_ICONS = { comprehensive: BookMarked, prelims: ScrollText, mains: NotebookPen };

export const metadata: Metadata = { title: "Material / Notes" };

/**
 * The start of the notes flow. Usually: choose a syllabus topic (then the type of notes). Where the Notes
 * modules have syllabi of their own (APPSC Group I: Prelims, Mains and Comprehensive), the type of notes
 * comes first, and its topics are that module's own syllabus.
 */
export default async function MaterialsTab(props: PageProps<"/exams/[commission]/[group]/materials">) {
  const [{ commission, group }, sp] = await Promise.all([props.params, props.searchParams]);
  const here = trackPath(commission, group, "materials");

  // Old links (?subject=…&kind=…&topic=…) open the topic's own page.
  if (typeof sp.subject === "string" && /^\d+$/.test(sp.subject)) {
    const keep = new URLSearchParams();
    for (const key of ["kind", "topic"]) if (typeof sp[key] === "string") keep.set(key, sp[key] as string);
    redirect(`${here}/${sp.subject}${keep.size ? `?${keep}` : ""}`);
  }

  const [user, tree, site] = await Promise.all([
    requireUser(here),
    load<SyllabusTree>(`/tracks/${commission}/${group}/syllabus/`),
    getSite(),
  ]);
  const NOTE_KINDS = site.note_kinds.filter((k) => k.enabled);
  const isAdmin = user.role === "admin";
  const track = `${commission}/${group}`;

  // The Notes modules have syllabi of their own: choose the type of notes first.
  if (tree.notes_syllabi.some((k) => NOTE_KINDS.some((n) => n.key === k))) {
    return <KindFirst commission={commission} group={group} here={here} kind={sp.kind} kinds={NOTE_KINDS} own={tree.notes_syllabi} isAdmin={isAdmin} />;
  }
  const topics = syllabusTopics(tree);

  if (topics.length === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="No study material in this exam yet"
        action={
          isAdmin && (
            <Link href={`/manage/topics?track=${track}`} className="btn btn-primary">
              <ListTree size={17} aria-hidden /> Add the syllabus topics
            </Link>
          )
        }
      >
        {isAdmin ? "Notes are filed under syllabus topics, so start by adding them." : "Notes for this exam are being prepared. Check back soon."}
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="flow-head">
        <div>
          <Steps current={1} />
          <h2 className="flow-title">Choose a syllabus topic</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {NOTE_KINDS.length > 1
              ? `Then pick ${NOTE_KINDS.map((k) => k.label).join(", ").replace(/, ([^,]*)$/, " or $1")}, and read it chapter by chapter.`
              : "Then read it chapter by chapter."}
          </p>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/manage/topics?track=${track}`} className="btn btn-ghost btn-sm">
              <ListTree size={15} aria-hidden /> Edit topics
            </Link>
            <Link href="/manage/notes-import" className="btn btn-secondary btn-sm">
              <BookUp size={15} aria-hidden /> Import notes (Word)
            </Link>
          </div>
        )}
      </div>

      <div className="topic-grid">
        {topics.map(({ subject, chapters, byKind }, i) => {
          const Icon = topicIcon(subject.title, subject.look);
          const kinds = NOTE_KINDS.filter((k) => byKind[k.key] > 0);
          return (
            <Link key={subject.id} href={`${here}/${subject.id}`} className={`topic-card ${topicTone(subject.title, subject.look)}`}>
              <span className="tc-icon" aria-hidden>
                <Icon size={22} />
              </span>
              <span className="tc-body">
                <span className="tc-num">{String(i + 1).padStart(2, "0")}</span>
                <b className="tc-title">{subject.title}</b>
                <span className="tc-meta">
                  {kinds.length
                    ? `${chapters} chapter${chapters === 1 ? "" : "s"} · ${kinds.map((k) => k.label.replace(" Notes", "")).join(", ")}`
                    : "Notes coming soon"}
                </span>
                {isAdmin && subject.status !== "published" && <StatusBadge status={subject.status} />}
              </span>
              <ChevronRight className="tc-go" size={18} aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}


type KindInfo = { key: NoteKind; label: string; blurb: string };

/** The notes flow where each type of notes has its own syllabus: 1 type of notes → 2 one of its topics. */
async function KindFirst({ commission, group, here, kind: asked, kinds, own, isAdmin }: {
  commission: string; group: string; here: string; kind: unknown; kinds: KindInfo[]; own: NoteKind[]; isAdmin: boolean;
}) {
  const base = `/tracks/${commission}/${group}/syllabus/`;
  const track = `${commission}/${group}`;
  const kind = kinds.find((k) => k.key === asked);
  const adminLinks = isAdmin && (
    <div className="row" style={{ gap: 8 }}>
      <Link href={`/manage/syllabus?track=${track}`} className="btn btn-ghost btn-sm">
        <ListTree size={15} aria-hidden /> Edit syllabi
      </Link>
      <Link href="/manage/notes-import" className="btn btn-secondary btn-sm">
        <BookUp size={15} aria-hidden /> Import notes (Word)
      </Link>
    </div>
  );

  if (!kind) {
    // step 1: the type of notes, each with what its syllabus holds
    const trees = await Promise.all(kinds.map((k) => load<SyllabusTree>(`${base}?notes=${k.key}`)));
    return (
      <div>
        <div className="flow-head">
          <div>
            <Steps current={1} kindFirst />
            <h2 className="flow-title">Choose the type of notes</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Each has its own syllabus: pick one, then a topic from it.
            </p>
          </div>
          {adminLinks}
        </div>
        <div className="note-types note-types-big" role="list" aria-label="Type of notes">
          {kinds.map((k, i) => {
            const Icon = KIND_ICONS[k.key];
            const t = syllabusTopics(trees[i]);
            const sections = t.reduce((n, x) => n + x.sections, 0);
            const written = t.reduce((n, x) => n + x.byKind[k.key], 0);
            return (
              <Link key={k.key} role="listitem" href={`${here}?kind=${k.key}`} className="note-type">
                <span className="nt-icon" aria-hidden>
                  <Icon size={21} />
                </span>
                <span>
                  <b>{k.label}</b>
                  <span>
                    {own.includes(k.key) ? `Its own syllabus: ${trees[i].papers.length} paper${trees[i].papers.length === 1 ? "" : "s"}, ${t.length} topics, ${sections} sections.` : k.blurb}
                  </span>
                  <span className={`nt-count ${written ? "" : "nt-none"}`}>{written ? `${written} section${written === 1 ? "" : "s"} written` : "Not written yet"}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // step 2: that module's syllabus, paper by paper
  const tree = await load<SyllabusTree>(`${base}?notes=${kind.key}`);
  const papers = tree.papers.filter((p) => p.subjects.length > 0);
  let n = 0;
  return (
    <div>
      <div className="flow-head">
        <div>
          <Steps current={2} kindFirst />
          <nav className="crumbs" aria-label="You are here" style={{ marginTop: 10 }}>
            <Link href={here}>Material / Notes</Link>›<span>{kind.label}</span>
          </nav>
          <h2 className="flow-title">Choose a syllabus topic</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {kind.label}, following {tree.notes_kind ? "its own syllabus" : "the syllabus"}. Read it chapter by chapter.
          </p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <Link href={here} className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} aria-hidden /> Types of notes
          </Link>
          {adminLinks}
        </div>
      </div>
      {papers.length === 0 ? (
        <EmptyState icon={Upload} title="No topics in this syllabus yet">
          {isAdmin ? "Add its papers and topics in Manage → Syllabus." : "Notes for this exam are being prepared. Check back soon."}
        </EmptyState>
      ) : (
        papers.map((paper) => (
          <section key={paper.id} className="notes-paper" aria-labelledby={`np-${paper.id}`}>
            {papers.length > 1 && (
              <h3 id={`np-${paper.id}`} className="notes-paper-title">
                {paper.title} {isAdmin && paper.status !== "published" && <StatusBadge status={paper.status} />}
              </h3>
            )}
            <div className="topic-grid">
              {syllabusTopics({ ...tree, papers: [paper] }).map(({ subject, chapters, sections, byKind }) => {
                const Icon = topicIcon(subject.title, subject.look);
                const written = byKind[kind.key];
                n += 1;
                return (
                  <Link key={subject.id} href={`${here}/${subject.id}?kind=${kind.key}`} className={`topic-card ${topicTone(subject.title, subject.look)}`}>
                    <span className="tc-icon" aria-hidden>
                      <Icon size={22} />
                    </span>
                    <span className="tc-body">
                      <span className="tc-num">{String(n).padStart(2, "0")}</span>
                      <b className="tc-title">{subject.title}</b>
                      <span className="tc-meta">
                        {chapters} chapter{chapters === 1 ? "" : "s"} · {written ? `${written} of ${sections} sections written` : "Notes coming soon"}
                      </span>
                      {isAdmin && subject.status !== "published" && <StatusBadge status={subject.status} />}
                    </span>
                    <ChevronRight className="tc-go" size={18} aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
