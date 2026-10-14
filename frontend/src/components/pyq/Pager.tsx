import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/** Page links that keep the current filters. */
export function Pager({
  page,
  numPages,
  count,
  params,
  noun = "results",
}: {
  page: number;
  numPages: number;
  count: number;
  params: Record<string, string | string[] | undefined>;
  noun?: string;
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">
        {count} {noun} · page {page} of {Math.max(numPages, 1)}
      </span>
      <div className="row">
        {page > 1 ? (
          <Link className="btn btn-ghost btn-sm" href={href(page - 1)} rel="prev">
            <ChevronLeft size={16} aria-hidden /> Previous
          </Link>
        ) : (
          <span className="btn btn-ghost btn-sm" aria-disabled="true">
            <ChevronLeft size={16} aria-hidden /> Previous
          </span>
        )}
        {page < numPages ? (
          <Link className="btn btn-ghost btn-sm" href={href(page + 1)} rel="next">
            Next <ChevronRight size={16} aria-hidden />
          </Link>
        ) : (
          <span className="btn btn-ghost btn-sm" aria-disabled="true">
            Next <ChevronRight size={16} aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
