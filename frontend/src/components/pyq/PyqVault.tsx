import { FileUp, PlusCircle, SearchX, Upload } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/bits";
import { load, requireUser } from "@/lib/server-api";
import type { Facets, Paginated, Question, StageKey, SyllabusTree } from "@/lib/types";

import { Pager } from "./Pager";
import { PyqFilters } from "./PyqFilters";
import { QuestionCard } from "./QuestionCard";

const PASS = ["id", "year", "paper_label", "paper", "subject", "topic", "micro", "tag", "status", "q", "page"];

export async function PyqVault({
  commission,
  group,
  stage,
  searchParams,
}: {
  commission: string;
  group: string;
  stage: StageKey;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const base = `/tracks/${commission}/${group}`;
  const qs = new URLSearchParams({ stage });
  for (const k of PASS) {
    const v = searchParams[k];
    if (typeof v === "string" && v) qs.set(k, v);
  }
  const [user, facets, data, tree] = await Promise.all([
    requireUser(`/exams/${commission}/${group}/${stage}`),
    load<Facets>(`${base}/question-facets/?stage=${stage}`),
    load<Paginated<Question>>(`${base}/questions/?${qs}`),
    load<SyllabusTree>(`${base}/syllabus/`),
  ]);
  const isAdmin = user.role === "admin";
  const label = stage === "prelims" ? "Prelims" : "Mains";
  const track = `${commission}/${group}`;

  if (facets.total === 0) {
    return (
      <EmptyState
        icon={Upload}
        title={`No ${label} PYQs in ${tree.track.label} yet`}
        action={
          isAdmin && (
            <div className="row" style={{ justifyContent: "center" }}>
              <Link href={`/manage/import?track=${track}&stage=${stage}`} className="btn btn-primary">
                <FileUp size={17} aria-hidden /> Bulk upload {label} PYQs
              </Link>
              <Link href={`/manage/questions/new?track=${track}&stage=${stage}`} className="btn btn-secondary">
                <PlusCircle size={17} aria-hidden /> Add one question
              </Link>
            </div>
          )
        }
      >
        {isAdmin
          ? "Upload a spreadsheet of previous-year questions for this track, or add them one by one."
          : "Previous-year questions for this exam are being added. Check back soon."}
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>{label} previous-year questions</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {facets.total} questions · {facets.years.length ? `${facets.years[facets.years.length - 1]}–${facets.years[0]}` : ""} ·
            filter by year, paper or syllabus, or search the text.
          </p>
        </div>
        {isAdmin && (
          <div className="row">
            <Link href={`/manage/import?track=${track}&stage=${stage}`} className="btn btn-secondary btn-sm">
              <FileUp size={15} aria-hidden /> Bulk upload
            </Link>
            <Link href={`/manage/questions/new?track=${track}&stage=${stage}`} className="btn btn-primary btn-sm">
              <PlusCircle size={15} aria-hidden /> New question
            </Link>
          </div>
        )}
      </div>
      <PyqFilters facets={facets} papers={tree.papers} isAdmin={isAdmin} />
      {data.results.length === 0 ? (
        <EmptyState icon={SearchX} title="No questions match">
          Try removing a filter or searching for a different word.
        </EmptyState>
      ) : (
        <>
          <div className="q-list">
            {data.results.map((q) => (
              <QuestionCard key={q.id} q={q} commission={commission} group={group} isAdmin={isAdmin} />
            ))}
          </div>
          <Pager page={data.page} numPages={data.num_pages} count={data.count} params={searchParams} noun="questions" />
        </>
      )}
    </div>
  );
}
