import { FileUp, PenLine, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuestionTable } from "@/components/manage/QuestionTable";
import { TrackPicker } from "@/components/manage/TrackPicker";
import { Pager } from "@/components/pyq/Pager";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";
import { load } from "@/lib/server-api";
import type { Paginated, Question } from "@/lib/types";

export const metadata: Metadata = { title: "PYQ manager" };

export default async function ManageQuestions(props: PageProps<"/manage/questions">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const track = str("track");
  const qs = new URLSearchParams({ page_size: "25" });
  for (const k of ["track", "stage", "status", "q", "year", "page"]) if (str(k)) qs.set(k, str(k));
  const [commissions, data] = await Promise.all([
    getCommissions(),
    load<Paginated<Question & { track?: unknown }>>(`/manage/questions/?${qs}`, "/manage/questions"),
  ]);
  const trackLabel = new Map(commissions.flatMap((c) => c.tracks.map((t) => [t.id, t.label] as const)));
  const rows = data.results.map((q) => ({ ...q, track_label: trackLabel.get((q as unknown as { track: number }).track) }));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">PYQ manager</div>
          <h1>Previous-year questions</h1>
          <p>Every PYQ belongs to one exam track and maps to a micro-theme. Drafts stay invisible to students.</p>
        </div>
        <div className="row">
          <Link href={`/manage/import${track ? `?track=${track}` : ""}`} className="btn btn-secondary">
            <FileUp size={17} aria-hidden /> Bulk upload
          </Link>
          <Link href={`/manage/questions/new${track ? `?track=${track}` : ""}`} className="btn btn-primary">
            <PenLine size={17} aria-hidden /> New question
          </Link>
        </div>
      </div>

      <section className="panel">
        <form className="toolbar" action="/manage/questions" style={{ alignItems: "flex-end" }}>
          <TrackPicker commissions={commissions} value={track} allowAll />
          <label className="field">
            <span className="label">Stage</span>
            <select name="stage" className="select" defaultValue={str("stage")}>
              <option value="">Both</option>
              <option value="prelims">Prelims</option>
              <option value="mains">Mains</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Status</span>
            <select name="status" className="select" defaultValue={str("status")}>
              <option value="">Any</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <label className="field search">
            <span className="label">Search</span>
            <input name="q" type="search" className="input" defaultValue={str("q")} placeholder="Question text, keywords…" />
          </label>
          {track && <input type="hidden" name="track" value={track} />}
          <button className="btn btn-secondary">
            <Search size={16} aria-hidden /> Apply
          </button>
        </form>
        {data.results.length === 0 ? (
          <EmptyState icon={SearchX} title="No questions found">
            {track ? "This track has no questions matching these filters yet." : "Try different filters."}
          </EmptyState>
        ) : (
          <>
            <QuestionTable rows={rows} />
            <Pager page={data.page} numPages={data.num_pages} count={data.count} params={sp} noun="questions" />
          </>
        )}
      </section>
    </div>
  );
}
