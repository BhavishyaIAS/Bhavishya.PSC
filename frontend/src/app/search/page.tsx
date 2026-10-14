import { BookA, FileQuestion, ListTree, NotebookText, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { getCommissions } from "@/lib/catalog";
import { load, requireUser } from "@/lib/server-api";
import type { SearchGroup } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

const ICONS: Record<string, typeof Search> = {
  micro_theme: ListTree,
  note: NotebookText,
  glossary: BookA,
  prelims_question: FileQuestion,
  mains_question: FileQuestion,
};

/** «highlight» markers from Postgres ts_headline → <mark>, without injecting HTML. */
function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(«[^»]*»)/g).map((part, i) =>
        part.startsWith("«") ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function hrefFor(type: string, item: SearchGroup["items"][number]) {
  if (type.endsWith("_question")) return trackPath(item.commission, item.group, `${item.stage}?id=${item.id}`);
  const q = type === "note" && item.kind ? `?note=${item.kind}` : "";
  return trackPath(item.commission, item.group, `micro/${encodeURIComponent(item.code ?? "")}${q}`);
}

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const scope = typeof sp.track === "string" ? sp.track : "";
  await requireUser(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const [commissions, data] = await Promise.all([
    getCommissions(),
    q.length >= 2
      ? load<{ query: string; total: number; groups: SearchGroup[] }>(
          `/search/?q=${encodeURIComponent(q)}${scope ? `&track=${encodeURIComponent(scope)}` : ""}`,
        )
      : Promise.resolve(null),
  ]);
  const tracks = commissions.flatMap((c) => c.tracks);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Global search</div>
          <h1>Search notes, glossary &amp; PYQs</h1>
        </div>
      </div>
      <form role="search" action="/search" className="search-hero">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input id="q" name="q" className="input" type="search" defaultValue={q} placeholder="e.g. Satavahanas, Article 32, Finance Commission…" autoFocus />
        <label htmlFor="track" className="sr-only">
          Exam
        </label>
        <select id="track" name="track" className="select" defaultValue={scope} style={{ maxWidth: 200, minHeight: 52 }}>
          <option value="">All exams</option>
          {tracks.map((t) => (
            <option key={t.id} value={`${t.commission}/${t.group}`}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-lg">
          <Search size={18} aria-hidden /> Search
        </button>
      </form>

      {!data ? (
        <EmptyState icon={Search} title="What do you want to revise?">
          One search box for every exam: micro-themes, notes, glossary terms and previous-year questions. Type at least two
          letters.
        </EmptyState>
      ) : data.total === 0 ? (
        <EmptyState icon={SearchX} title={`No results for “${q}”`}>
          Check the spelling, try a broader word, or search all exams.
        </EmptyState>
      ) : (
        <div>
          <p className="muted small" aria-live="polite">
            {data.total} result{data.total === 1 ? "" : "s"} for “{q}”
          </p>
          {data.groups.map((g) => {
            const Icon = ICONS[g.type] ?? Search;
            return (
              <section key={g.type} className="result-group" aria-labelledby={`rg-${g.type}`}>
                <h2 id={`rg-${g.type}`} style={{ fontSize: 17 }} className="row">
                  <Icon size={18} aria-hidden /> {g.label} <span className="badge badge-neutral">{g.items.length}</span>
                </h2>
                {g.items.map((item, i) => (
                  <Link key={`${g.type}-${i}`} href={hrefFor(g.type, item)} className="result">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="r-title">{item.title}</span>
                      <span className="spacer" />
                      <span className="badge badge-neutral">{item.track_label}</span>
                    </div>
                    <div className="r-snippet">
                      <Highlighted text={item.snippet} />
                    </div>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
