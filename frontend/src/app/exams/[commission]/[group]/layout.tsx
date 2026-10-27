import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { groupTheme } from "@/brand.config";
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
  const theme = groupTheme(group, track.siblings.findIndex((s) => s.group === group));

  return (
    <div className="page">
      <div className="ws-head">
        <div className="ws-badge" style={{ background: theme.gradient }} aria-hidden>
          {track.group_name.replace(/\D/g, "") || track.group_name[0]}
        </div>
        <div>
          <div className="eyebrow">{track.commission_full_name} · Preparation workspace</div>
          <h1>
            {track.commission_name} · {track.group_name}
          </h1>
        </div>
        <div className="spacer" />
        <div className="segmented" role="group" aria-label="Switch group">
          {track.siblings.map((s) => (
            <Link key={s.group} href={`/exams/${s.commission}/${s.group}`} aria-current={s.group === group ? "page" : undefined}>
              {s.group_name}
            </Link>
          ))}
        </div>
        <Link href={`/exams/${commission}`} className="btn btn-ghost">
          <ArrowLeft size={17} aria-hidden /> All groups
        </Link>
      </div>
      <WorkspaceTabs commission={commission} group={group} isAdmin={isAdmin} />
      {props.children}
    </div>
  );
}
