import Link from "next/link";

import { ModuleMark } from "@/components/living/Mark";
import { MODULES } from "@/components/sky/portals";
import { trackPath } from "@/lib/format";
import { getSkin } from "@/lib/skin";

/** An exam's home: its four modules as big blocks, each a portal. */
export default async function ExamHome(props: PageProps<"/exams/[commission]/[group]">) {
  const [{ commission, group }, skin] = await Promise.all([props.params, getSkin()]);
  return (
    <nav className="exam-blocks" aria-label="Exam modules">
      {MODULES.map((m) => (
        <Link key={m.tab} href={trackPath(commission, group, m.tab)} className="exam-block" data-warp>
          <ModuleMark skin={skin} tab={m.tab} size={132} />
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
}
