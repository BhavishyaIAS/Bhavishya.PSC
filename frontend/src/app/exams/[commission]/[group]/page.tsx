import Link from "next/link";

import { Dashboard, type DashboardData } from "@/components/Dashboard";
import { ModuleMark } from "@/components/living/Mark";
import { MODULES } from "@/components/sky/portals";
import { trackPath } from "@/lib/format";
import { load } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { getSkin } from "@/lib/skin";

/** An exam's home: the four modules beside the student's dashboard (or, with the preparation tools off, as big blocks). */
export default async function ExamHome(
  props: PageProps<"/exams/[commission]/[group]">,
) {
  const { commission, group } = await props.params;
  const [skin, site] = await Promise.all([getSkin(), getSite()]);
  // the preparation tools can be switched off in Site settings: the page is then as it was before them
  const dash = site.study_tools
    ? await load<DashboardData>(`/tracks/${commission}/${group}/dashboard/`)
    : null;
  // side by side: the four modules down the left, the student's own dashboard beside them
  if (dash)
    return (
      <div className="topic-layout split">
        <nav className="topic-side split-side" aria-label="Exam modules">
          <div className="topic-side-title">Modules</div>
          <ul className="side-links">
            {MODULES.map((m) => (
              <li key={m.tab}>
                <Link href={trackPath(commission, group, m.tab)} className="side-link" data-warp>
                  <ModuleMark skin={skin} tab={m.tab} size={52} />
                  <span className="side-link-text">
                    <b>{m.name}</b>
                    <small>{m.blurb}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="split-main">
          <Dashboard d={dash} commission={commission} group={group} />
        </div>
      </div>
    );
  return (
    <>
      <nav className="exam-blocks" aria-label="Exam modules">
        {MODULES.map((m) => (
          <Link
            key={m.tab}
            href={trackPath(commission, group, m.tab)}
            className="exam-block"
            data-warp
          >
            <ModuleMark skin={skin} tab={m.tab} size={132} />
            <span className="exam-block-text">
              {skin !== "living" && (
                <span className="sky-kind">{m.portal}</span>
              )}
              <b>{m.name}</b>
              <span>{m.blurb}</span>
              <span className="sky-enter">Open</span>
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
