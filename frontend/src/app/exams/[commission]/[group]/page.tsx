import Link from "next/link";

import { MODULES } from "@/components/sky/portals";
import { SkyPortal } from "@/components/sky/SkyPortal";
import { trackPath } from "@/lib/format";

/** An exam's home: its four modules as big blocks, each a portal. */
export default async function ExamHome(props: PageProps<"/exams/[commission]/[group]">) {
  const { commission, group } = await props.params;
  return (
    <nav className="exam-blocks" aria-label="Exam modules">
      {MODULES.map((m) => (
        <Link key={m.tab} href={trackPath(commission, group, m.tab)} className="exam-block" data-warp>
          <SkyPortal kind={m.kind} size={132} />
          <span className="exam-block-text">
            <span className="sky-kind">{m.portal}</span>
            <b>{m.name}</b>
            <span>{m.blurb}</span>
            <span className="sky-enter">Open</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
