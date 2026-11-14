import { BookUp, ChevronRight, ListTree, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotesSteps as Steps } from "@/components/NotesSteps";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import { syllabusTopics, topicIcon, topicTone } from "@/lib/topics";
import { NOTE_KINDS, type SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Material / Notes" };

/** Step 1 of the notes flow: choose a syllabus topic. */
export default async function MaterialsTab(props: PageProps<"/exams/[commission]/[group]/materials">) {
  const [{ commission, group }, sp] = await Promise.all([props.params, props.searchParams]);
  const here = trackPath(commission, group, "materials");

  // Old links (?subject=…&kind=…&topic=…) open the topic's own page.
  if (typeof sp.subject === "string" && /^\d+$/.test(sp.subject)) {
    const keep = new URLSearchParams();
    for (const key of ["kind", "topic"]) if (typeof sp[key] === "string") keep.set(key, sp[key] as string);
    redirect(`${here}/${sp.subject}${keep.size ? `?${keep}` : ""}`);
  }

  const [user, tree] = await Promise.all([
    requireUser(here),
    load<SyllabusTree>(`/tracks/${commission}/${group}/syllabus/`),
  ]);
  const isAdmin = user.role === "admin";
  const topics = syllabusTopics(tree);
  const track = `${commission}/${group}`;

  if (topics.length === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="No study material in this exam yet"
        action={
          isAdmin && (
            <Link href={`/manage/syllabus?track=${track}`} className="btn btn-primary">
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
            Then pick Comprehensive, Prelims or Mains notes, and read it chapter by chapter.
          </p>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/manage/syllabus?track=${track}`} className="btn btn-ghost btn-sm">
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
          const Icon = topicIcon(subject.title);
          const kinds = NOTE_KINDS.filter((k) => byKind[k.key] > 0);
          return (
            <Link key={subject.id} href={`${here}/${subject.id}`} className={`topic-card tone-${topicTone(subject.title)}`}>
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

