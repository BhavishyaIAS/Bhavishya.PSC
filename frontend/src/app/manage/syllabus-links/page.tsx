import type { Metadata } from "next";
import Link from "next/link";

import { JumpSelect } from "@/components/JumpSelect";
import { type LinkRow, LinksReview } from "@/components/manage/LinksReview";
import { getCommissions } from "@/lib/catalog";
import { load } from "@/lib/server-api";

export const metadata: Metadata = { title: "Syllabus links" };

type Data = {
  kind: string;
  subjects: { id: number; title: string; n: number; paper__title: string }[];
  subject: { id: number; title: string } | null;
  rows: LinkRow[];
  totals: Record<string, number>;
  strong: number;
};

const KINDS = [
  ["comprehensive", "Syllabus-Wise Notes"],
  ["prelims", "Prelims Notes"],
  ["mains", "Mains Notes"],
];

/**
 * Where an editor reviews the links between each Notes module's own syllabus and the general syllabus. A link
 * lets a notes topic show the PYQs of the sections it covers, and makes reading it count towards progress.
 */
export default async function SyllabusLinksPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const tracks = commissions.flatMap((c) => c.tracks.map((t) => ({ ref: `${t.commission}/${t.group}`, label: t.label })));
  const track = typeof sp.track === "string" ? sp.track : "appsc/group-1";
  const kind = typeof sp.kind === "string" ? sp.kind : "comprehensive";
  const show = sp.show === "unreviewed" ? "unreviewed" : "all";
  const q = new URLSearchParams({ track, kind, show });
  if (typeof sp.subject === "string") q.set("subject", sp.subject);
  const d = await load<Data>(`/manage/syllabus-links/?${q}`, "/manage/syllabus-links");
  const href = (over: Record<string, string>) => `?${new URLSearchParams({ track, kind, show, ...(d.subject ? { subject: String(d.subject.id) } : {}), ...over })}`;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel-head">
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Syllabus links</h1>
          <p className="muted" style={{ margin: "6px 0 0", maxWidth: "72ch" }}>
            Each topic of a Notes module&apos;s own syllabus is linked to the general-syllabus sections it covers. A notes topic then shows those
            sections&apos; PYQs, and reading it counts towards the student&apos;s progress. Links were suggested from the titles: confirm the right
            ones, reject the wrong ones, add any that are missing. Until you look at them, suggestions scoring {Math.round(d.strong * 100)} or more are
            already used.
          </p>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {d.totals.confirmed ?? 0} confirmed · {d.totals.suggested ?? 0} suggested · {d.totals.rejected ?? 0} rejected
        </p>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <JumpSelect label="Exam" value={`?${new URLSearchParams({ track, kind, show })}`} options={tracks.map((t) => ({ href: `?${new URLSearchParams({ track: t.ref, kind, show })}`, label: t.label }))} />
        <JumpSelect label="Notes" value={`?${new URLSearchParams({ track, kind, show })}`} options={KINDS.map(([k, l]) => ({ href: `?${new URLSearchParams({ track, kind: k, show })}`, label: l }))} />
        {d.subjects.length > 0 && (
          <JumpSelect
            label="Subject"
            value={href({})}
            options={d.subjects.map((s) => ({ href: href({ subject: String(s.id) }), label: `${s.title} (${s.n})` }))}
          />
        )}
        <div className="segmented" role="group" aria-label="Show">
          <Link href={href({ show: "all" })} aria-current={show === "all" ? "page" : undefined}>
            All topics
          </Link>
          <Link href={href({ show: "unreviewed" })} aria-current={show === "unreviewed" ? "page" : undefined}>
            Still to review
          </Link>
        </div>
      </div>

      {d.subjects.length === 0 ? (
        <p className="muted">This exam has no {KINDS.find(([k]) => k === kind)?.[1]} syllabus of its own, so there is nothing to link.</p>
      ) : (
        <LinksReview track={track} rows={d.rows} />
      )}
    </div>
  );
}
