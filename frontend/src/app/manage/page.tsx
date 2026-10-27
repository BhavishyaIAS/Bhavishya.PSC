import { FileQuestion, FileUp, FolderOpen, GraduationCap, ListTree, NotebookText, PenLine } from "lucide-react";
import Link from "next/link";

import { CommissionVisibility } from "@/components/manage/CommissionVisibility";
import { QuestionCard } from "@/components/pyq/QuestionCard";
import { StatTile } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";
import { load } from "@/lib/server-api";
import type { Question, TrackRef } from "@/lib/types";

type Stats = {
  totals: Record<"micro_themes" | "published_micro_themes" | "notes" | "questions" | "draft_questions" | "materials" | "students" | "admins", number>;
  tracks: (TrackRef & Record<"papers" | "micro_themes" | "notes" | "prelims" | "mains" | "materials", number>)[];
  recent_questions: Question[];
};

export default async function Dashboard() {
  const [s, commissions] = await Promise.all([load<Stats>("/manage/stats/", "/manage"), getCommissions()]);
  const t = s.totals;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Content management</div>
          <h1>Dashboard</h1>
          <p>Everything across all commissions and groups. Pick a track in each manager to work on it.</p>
        </div>
        <div className="row">
          <Link href="/manage/import" className="btn btn-secondary">
            <FileUp size={17} aria-hidden /> Bulk upload PYQs
          </Link>
          <Link href="/manage/questions/new" className="btn btn-primary">
            <PenLine size={17} aria-hidden /> New question
          </Link>
        </div>
      </div>

      <div className="grid-4">
        <StatTile icon={ListTree} value={t.micro_themes} label={`Micro-themes (${t.published_micro_themes} published)`} progress={t.micro_themes ? (100 * t.published_micro_themes) / t.micro_themes : 0} />
        <StatTile icon={NotebookText} value={t.notes} label="Notes written" />
        <StatTile icon={FileQuestion} value={t.questions} label={`PYQs (${t.draft_questions} draft)`} />
        <StatTile icon={FolderOpen} value={t.materials} label="Study files" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Exams shown to students</h2>
          <span className="muted small">A hidden commission — every group, note and PYQ in it — is visible to admins only.</span>
        </div>
        <CommissionVisibility commissions={commissions} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Tracks at a glance</h2>
          <span className="muted small">
            <GraduationCap size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> {t.students} students · {t.admins} admins
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Track</th>
                <th scope="col" className="num">Papers</th>
                <th scope="col" className="num">Micro-themes</th>
                <th scope="col" className="num">Notes</th>
                <th scope="col" className="num">Prelims PYQs</th>
                <th scope="col" className="num">Mains PYQs</th>
                <th scope="col" className="num">Files</th>
                <th scope="col">Quick links</th>
              </tr>
            </thead>
            <tbody>
              {s.tracks.map((tr) => {
                const key = `${tr.commission}/${tr.group}`;
                const empty = tr.papers + tr.prelims + tr.mains + tr.materials === 0;
                return (
                  <tr key={tr.id}>
                    <td>
                      <b>{tr.label}</b> {empty && <span className="badge badge-warning">Empty</span>}
                    </td>
                    <td className="num">{tr.papers}</td>
                    <td className="num">{tr.micro_themes}</td>
                    <td className="num">{tr.notes}</td>
                    <td className="num">{tr.prelims}</td>
                    <td className="num">{tr.mains}</td>
                    <td className="num">{tr.materials}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <Link className="mini-btn" href={`/manage/syllabus?track=${key}`}>Syllabus</Link>
                        <Link className="mini-btn" href={`/manage/questions?track=${key}`}>PYQs</Link>
                        <Link className="mini-btn" href={`/manage/materials?track=${key}`}>Files</Link>
                        <Link className="mini-btn" href={`/exams/${key}/progress`}>View</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="panel-head">
          <h2>Recently edited questions</h2>
          <Link href="/manage/questions" className="link small">All questions →</Link>
        </div>
        <div className="q-list">
          {s.recent_questions.map((q) => (
            <QuestionCard key={q.id} q={q} commission="" group="" isAdmin showMicro={false} />
          ))}
        </div>
      </section>
    </div>
  );
}
