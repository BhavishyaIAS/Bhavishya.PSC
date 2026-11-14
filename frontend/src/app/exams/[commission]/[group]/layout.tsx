import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { load, requireUser } from "@/lib/server-api";
import type { TrackDetail } from "@/lib/types";

/** Exam workspace shell: one commission × group. Every tab below is scoped to this track. */
export default async function WorkspaceLayout(props: LayoutProps<"/exams/[commission]/[group]">) {
  const { commission, group } = await props.params;
  const base = `/exams/${commission}/${group}`;
  const [user, track] = await Promise.all([
    requireUser(base),
    load<TrackDetail>(`/tracks/${commission}/${group}/`, base),
  ]);
  const isAdmin = user.role === "admin";

  return (
    <div className="page">
      <div className="ws-head">
        <div className="ws-title">
          <h1>
            {track.commission_name} · {track.group_name}
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
              <ArrowLeft size={15} aria-hidden /> All exams
            </Link>
          </div>
        </div>
        {/* Where this tab's 3D scene is drawn (see components/fx). */}
        <div className="ws-stage" data-stage aria-hidden />
      </div>
      <WorkspaceTabs commission={commission} group={group} isAdmin={isAdmin} />
      {props.children}
    </div>
  );
}
