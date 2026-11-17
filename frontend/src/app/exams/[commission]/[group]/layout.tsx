import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { load, requireUser } from "@/lib/server-api";
import type { TrackDetail } from "@/lib/types";

/** Exam workspace shell: one commission × group. Every tab below is scoped to this track. */
export default async function WorkspaceLayout(props: LayoutProps<"/exams/[commission]/[group]">) {
  const { commission, group } = await props.params;
  const base = `/exams/${commission}/${group}`;
  const [, track] = await Promise.all([
    requireUser(base),
    load<TrackDetail>(`/tracks/${commission}/${group}/`, base),
  ]);

  return (
    <div className="page workspace">
      <div className="ws-head">
        <div className="ws-title">
          <div className="eyebrow">{track.commission_full_name}</div>
          <h1>
            {track.commission_name}{" "}
            <span className="sep" aria-hidden>
              ·
            </span>{" "}
            {track.group_name}
          </h1>
          <div className="row">
            {track.siblings.length > 1 && (
              <div className="segmented" role="group" aria-label="Switch exam">
                {track.siblings.map((s) => (
                  <Link key={s.group} href={`/exams/${s.commission}/${s.group}`} aria-current={s.group === group ? "page" : undefined}>
                    {s.group_name}
                  </Link>
                ))}
              </div>
            )}
            <Link href={`/exams/${commission}`} className="btn btn-ghost btn-sm">
              <ArrowLeft size={15} aria-hidden /> {track.commission_name} exams
            </Link>
          </div>
        </div>
        {/* Where this world is drawn: the planet sits here, or the horizon runs under it (components/space). */}
        <div className="ws-stage" data-stage aria-hidden />
      </div>
      <WorkspaceTabs commission={commission} group={group} />
      {props.children}
    </div>
  );
}
