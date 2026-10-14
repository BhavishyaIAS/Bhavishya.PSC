import { BookOpenCheck, CheckCircle2, FileText, Layers, ListChecks, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SyllabusOutline } from "@/components/SyllabusOutline";
import { EmptyState, ProgressBar, StatTile, StatusBadge } from "@/components/ui/bits";
import { stageLabel } from "@/lib/format";
import { currentUser, load } from "@/lib/server-api";
import type { Coverage, SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Progress Tracker" };

export default async function ProgressTab(props: PageProps<"/exams/[commission]/[group]/progress">) {
  const { commission, group } = await props.params;
  const base = `/tracks/${commission}/${group}`;
  const [cov, tree, user] = await Promise.all([
    load<Coverage>(`${base}/coverage/`),
    load<SyllabusTree>(`${base}/syllabus/`),
    currentUser(),
  ]);
  const isAdmin = user?.role === "admin";

  if (!cov.has_content) {
    return (
      <EmptyState
        icon={Upload}
        title={`Nothing in ${cov.track.label} yet`}
        action={
          isAdmin && (
            <Link href={`/manage/syllabus?track=${commission}/${group}`} className="btn btn-primary">
              <Upload size={17} aria-hidden /> Build the syllabus
            </Link>
          )
        }
      >
        {isAdmin
          ? "This exam track is empty. Add the syllabus (papers → subjects → topics → micro-themes), then notes and PYQs."
          : "Content for this exam is being prepared. Check back soon — or explore another track from Home."}
      </EmptyState>
    );
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="grid-4">
        <StatTile icon={BookOpenCheck} value={`${cov.coverage_pct}%`} label="Syllabus coverage" progress={cov.coverage_pct} />
        <StatTile icon={CheckCircle2} value={`${cov.studied_pct}%`} label={`You've studied (${cov.studied_micro_themes}/${cov.micro_themes})`} progress={cov.studied_pct} />
        <StatTile icon={FileText} value={cov.prelims_questions} label="Prelims PYQs available" />
        <StatTile icon={Layers} value={cov.mains_questions} label="Mains PYQs available" />
      </div>

      <section className="panel" aria-labelledby="per-paper">
        <div className="panel-head">
          <h2 id="per-paper">Paper-wise coverage</h2>
          <span className="muted small">
            {cov.published_micro_themes} published micro-themes · {cov.covered_micro_themes} with notes · {cov.materials} study files
            {isAdmin && cov.draft_micro_themes ? ` · ${cov.draft_micro_themes} draft micro-themes` : ""}
            {isAdmin && cov.draft_questions ? ` · ${cov.draft_questions} draft PYQs` : ""}
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Paper</th>
                <th scope="col" className="num">Micro-themes</th>
                <th scope="col">Content coverage</th>
                <th scope="col">Your progress</th>
                <th scope="col" className="num">Prelims PYQs</th>
                <th scope="col" className="num">Mains PYQs</th>
              </tr>
            </thead>
            <tbody>
              {(cov.papers ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={`badge ${p.stage === "mains" ? "badge-primary" : ""}`}>{stageLabel(p.stage)}</span>
                  </td>
                  <td>
                    <b>{p.title}</b> {isAdmin && p.status === "draft" && <StatusBadge status="draft" />}
                  </td>
                  <td className="num">{p.micro_themes}</td>
                  <td className="table-progress">
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <span style={{ flex: 1 }}>
                        <ProgressBar value={p.coverage_pct} thin label={`${p.title} coverage`} />
                      </span>
                      <b className="small">{p.coverage_pct}%</b>
                    </div>
                  </td>
                  <td className="table-progress">
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <span style={{ flex: 1 }}>
                        <ProgressBar value={p.studied_pct} thin label={`${p.title} studied`} />
                      </span>
                      <b className="small">{p.studied_pct}%</b>
                    </div>
                  </td>
                  <td className="num">{p.prelims_questions}</td>
                  <td className="num">{p.mains_questions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          <b>Content coverage</b> = micro-themes that have at least one published note. <b>Your progress</b> = micro-themes you&apos;ve
          marked as studied.
        </p>
      </section>

      <section className="panel" aria-labelledby="checklist">
        <div className="panel-head">
          <h2 id="checklist">
            <ListChecks size={19} aria-hidden style={{ verticalAlign: "-3px" }} /> Syllabus checklist
          </h2>
          <span className="muted small">Tick a micro-theme once you&apos;ve studied it; open it for notes, videos and PYQs.</span>
        </div>
        <SyllabusOutline papers={tree.papers} commission={commission} group={group} mode="student" />
      </section>
    </div>
  );
}
