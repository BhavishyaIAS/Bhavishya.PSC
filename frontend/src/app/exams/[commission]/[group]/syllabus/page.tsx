import { Lock, Settings2, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SyllabusOutline } from "@/components/SyllabusOutline";
import { EmptyState } from "@/components/ui/bits";
import { load, requireUser } from "@/lib/server-api";
import type { StageKey, SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Syllabus Detailer" };

export default async function SyllabusTab(props: PageProps<"/exams/[commission]/[group]/syllabus">) {
  const { commission, group } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/exams/${commission}/${group}/syllabus`);
  if (user.role !== "admin") {
    return (
      <EmptyState icon={Lock} title="Admins only">
        The Syllabus Detailer is the content team&apos;s workbench. Use the Progress Tracker and Material / Notes tabs to study the
        syllabus.
      </EmptyState>
    );
  }
  const stage = sp.stage === "prelims" || sp.stage === "mains" ? (sp.stage as StageKey) : undefined;
  const tree = await load<SyllabusTree>(`/tracks/${commission}/${group}/syllabus/${stage ? `?stage=${stage}` : ""}`);
  const manageHref = `/manage/syllabus?track=${commission}/${group}`;
  const counts = tree.papers.reduce(
    (acc, p) => {
      for (const s of p.subjects)
        for (const t of s.topics)
          for (const m of t.micro_themes) {
            acc.total++;
            if (m.status === "draft") acc.draft++;
            if (m.note_kinds.length === 0) acc.noNotes++;
            if (m.question_count === 0) acc.noPyq++;
          }
      return acc;
    },
    { total: 0, draft: 0, noNotes: 0, noPyq: 0 },
  );

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Stage">
          {[undefined, "prelims", "mains"].map((s) => (
            <Link key={s ?? "all"} href={`?${s ? `stage=${s}` : ""}`} aria-current={stage === s ? "page" : undefined}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All papers"}
            </Link>
          ))}
        </div>
        <span className="muted small">
          {counts.total} micro-themes · {counts.draft} draft · {counts.noNotes} without notes · {counts.noPyq} without PYQs
        </span>
        <div className="spacer" />
        <Link href={manageHref} className="btn btn-primary">
          <Settings2 size={17} aria-hidden /> Open Syllabus Manager
        </Link>
      </div>
      {tree.papers.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No syllabus yet"
          action={
            <Link href={manageHref} className="btn btn-primary">
              <Upload size={17} aria-hidden /> Add the first paper
            </Link>
          }
        >
          Build this track&apos;s syllabus tree — Paper → Subject → Topic → Micro-theme — then map notes, PYQs and files to it.
        </EmptyState>
      ) : (
        <SyllabusOutline papers={tree.papers} commission={commission} group={group} mode="admin" />
      )}
    </section>
  );
}
