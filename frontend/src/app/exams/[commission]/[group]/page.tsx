import { ArrowRight, History } from "lucide-react";
import Link from "next/link";

import { topicHref, type DashboardData } from "@/components/Dashboard";
import { ModuleMark } from "@/components/living/Mark";
import { trackPath } from "@/lib/format";
import { load } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { getSkin } from "@/lib/skin";

/** The four modules on an exam's home, in the order of the sketch: notes and prelims, then mains and progress. */
const BLOCKS = [
  { tab: "materials", name: "Notes/Material", sub: "Syllabus-wise" },
  { tab: "prelims", name: "Prelims PYQs", sub: "By year / By paper / By subject" },
  { tab: "mains", name: "Mains PYQs", sub: "With model answers" },
  { tab: "progress", name: "Track Your Progress", sub: "" },
] as const;

/**
 * An exam's home: a "Modules" heading and, beside it, the way back to where the student left off; below, the four
 * modules two by two, each a way in. Track Your Progress shows how far the syllabus is covered. (The rest of the
 * student's record — what is next, what is due, kept topics — is on the Progress page.)
 */
export default async function ExamHome(props: PageProps<"/exams/[commission]/[group]">) {
  const { commission, group } = await props.params;
  const [skin, site] = await Promise.all([getSkin(), getSite()]);
  // the preparation tools can be switched off in Site settings: then no record, just the modules
  const dash = site.study_tools ? await load<DashboardData>(`/tracks/${commission}/${group}/dashboard/`) : null;
  const last = dash?.continue[0];
  const read = Math.round((last?.position ?? 0) * 100);
  const done = dash ? dash.topics.completed : 0;
  const total = dash ? Math.max(dash.topics.general, 1) : 1;

  return (
    <div className="exam-home2">
      <div className="eh-heads">
        <div className="eh-head">
          <h2>Modules</h2>
        </div>
        {last ? (
          <Link href={topicHref(commission, group, last, read > 2)} className="eh-head eh-continue">
            <span className="eh-continue-label">
              <History size={17} aria-hidden /> Continue from where you left
            </span>
            <b>{last.title}</b>
            <span className="eh-continue-meta">
              {last.subject}
              {read > 2 && ` · ${read}% read`}
            </span>
            <ArrowRight className="eh-continue-go" size={20} aria-hidden />
          </Link>
        ) : (
          <Link href={trackPath(commission, group, "materials")} className="eh-head eh-continue">
            <span className="eh-continue-label">
              <History size={17} aria-hidden /> Continue from where you left
            </span>
            <span className="eh-continue-meta">Nothing opened yet: start with Notes/Material.</span>
            <ArrowRight className="eh-continue-go" size={20} aria-hidden />
          </Link>
        )}
      </div>

      <nav className="exam-blocks eh-blocks" aria-label="Exam modules">
        {BLOCKS.map((m) => (
          <Link key={m.tab} href={trackPath(commission, group, m.tab)} className="exam-block" data-warp>
            <ModuleMark skin={skin} tab={m.tab} size={96} />
            <span className="exam-block-text">
              <b>{m.name}</b>
              {m.tab === "progress" ? (
                dash ? (
                  <span className="eh-progress">
                    <span className="eh-bar" aria-hidden>
                      <span style={{ width: `${Math.min(100, Math.round((100 * done) / total))}%` }} />
                    </span>
                    <span>
                      {done} of {dash.topics.general} topics completed
                    </span>
                  </span>
                ) : (
                  <span>How much of the syllabus you have covered</span>
                )
              ) : (
                <span>{m.sub}</span>
              )}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
