import { Settings2, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SubjectOrbits, subjectStats } from "@/components/SyllabusCharts";
import { SyllabusOutline } from "@/components/SyllabusOutline";
import { EmptyState } from "@/components/ui/bits";
import { load, requireUser } from "@/lib/server-api";
import type { StageKey, SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Syllabus Detailer" };

export default async function SyllabusTab(props: PageProps<"/exams/[commission]/[group]/syllabus">) {
  const { commission, group } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/exams/${commission}/${group}/syllabus`);
  const isAdmin = user.role === "admin";
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

  const stats = subjectStats(tree.papers);
  const studied = stats.reduce((n, s) => n + s.studied, 0);

  return (
    <div className="stack" style={{ gap: 22 }}>
      {stats.length > 0 && (
        <section className="panel" aria-labelledby="map-h">
          <div className="panel-head">
            <h2 id="map-h">The syllabus at a glance</h2>
            <span className="muted small">
              {isAdmin
                ? `${stats.length} subjects · ${counts.total} sections · the arc shows how much of each has notes`
                : `${stats.length} subjects · ${studied} of ${counts.total} sections studied · choose one to jump to it`}
            </span>
          </div>
          <SubjectOrbits stats={stats} mode={isAdmin ? "admin" : "student"} />
        </section>
      )}
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
            {isAdmin
              ? `${counts.total} micro-themes · ${counts.draft} draft · ${counts.noNotes} without notes · ${counts.noPyq} without PYQs`
              : "Tick a section once you have studied it; open it for notes, videos and PYQs."}
          </span>
          <div className="spacer" />
          {isAdmin && (
            <Link href={manageHref} className="btn btn-primary">
              <Settings2 size={17} aria-hidden /> Open Syllabus Manager
            </Link>
          )}
        </div>
        {tree.papers.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No syllabus yet"
            action={
              isAdmin && (
                <Link href={manageHref} className="btn btn-primary">
                  <Upload size={17} aria-hidden /> Add the first paper
                </Link>
              )
            }
          >
            {isAdmin
              ? "Build this track's syllabus tree (Paper → Subject → Topic → Micro-theme), then map notes, PYQs and files to it."
              : "The syllabus for this exam is being prepared. Check back soon."}
          </EmptyState>
        ) : (
          <SyllabusOutline papers={tree.papers} commission={commission} group={group} mode={isAdmin ? "admin" : "student"} />
        )}
      </section>
    </div>
  );
}
