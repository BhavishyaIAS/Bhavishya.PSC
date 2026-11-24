import Link from "next/link";

import { Dashboard, type DashboardData } from "@/components/Dashboard";
import { ModuleMark } from "@/components/living/Mark";
import { MODULES } from "@/components/sky/portals";
import { trackPath } from "@/lib/format";
import { load } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { getSkin } from "@/lib/skin";

/** An exam's home: the student's dashboard, then the four modules as big blocks. */
export default async function ExamHome(
  props: PageProps<"/exams/[commission]/[group]">,
) {
  const { commission, group } = await props.params;
  const [skin, site] = await Promise.all([getSkin(), getSite()]);
  // the preparation tools can be switched off in Site settings: the page is then as it was before them
  const dash = site.study_tools
    ? await load<DashboardData>(`/tracks/${commission}/${group}/dashboard/`)
    : null;
  return (
    <>
      {dash && <Dashboard d={dash} commission={commission} group={group} />}
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
