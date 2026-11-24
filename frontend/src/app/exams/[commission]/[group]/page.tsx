import Link from "next/link";

import { Dashboard, type DashboardData } from "@/components/Dashboard";
import { ModuleMark } from "@/components/living/Mark";
import { MODULES } from "@/components/sky/portals";
import { trackPath } from "@/lib/format";
import { load } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { getSkin } from "@/lib/skin";

/**
 * An exam's home: the student's preparation down the left (a column of cards), the four modules on the right
 * under a "Modules" heading, two by two. With the preparation tools off, only the modules.
 */
export default async function ExamHome(
  props: PageProps<"/exams/[commission]/[group]">,
) {
  const { commission, group } = await props.params;
  const [skin, site] = await Promise.all([getSkin(), getSite()]);
  // the preparation tools can be switched off in Site settings: the page is then as it was before them
  const dash = site.study_tools
    ? await load<DashboardData>(`/tracks/${commission}/${group}/dashboard/`)
    : null;
  const blocks = (
    <nav className="exam-blocks" aria-label="Exam modules">
      {MODULES.map((m) => (
        <Link
          key={m.tab}
          href={trackPath(commission, group, m.tab)}
          className="exam-block"
          data-warp
        >
          <ModuleMark skin={skin} tab={m.tab} size={dash ? 96 : 132} />
          <span className="exam-block-text">
            {skin !== "living" && <span className="sky-kind">{m.portal}</span>}
            <b>{m.name}</b>
            <span>{m.blurb}</span>
            <span className="sky-enter">Open</span>
          </span>
        </Link>
      ))}
    </nav>
  );
  if (!dash) return blocks;
  return (
    <div className="exam-home">
      <div className="exam-home-prep">
        <Dashboard d={dash} commission={commission} group={group} />
      </div>
      <section className="exam-home-modules" aria-labelledby="modules-h">
        <div className="exam-home-modules-head">
          <h2 id="modules-h">Modules</h2>
        </div>
        {blocks}
      </section>
    </div>
  );
}
