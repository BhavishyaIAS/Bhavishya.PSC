import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { groupTheme } from "@/brand.config";
import { trackPath } from "@/lib/format";
import type { Commission } from "@/lib/types";

const MODULES = [
  { label: "Syllabus Detailer", tab: "syllabus", adminOnly: true },
  { label: "Study Material", tab: "materials" },
  { label: "Prelims PYQs", tab: "prelims" },
  { label: "Mains PYQs", tab: "mains" },
  { label: "Progress Tracker", tab: "progress" },
];

/** The big cards for a commission's exams (Group 1, Group 2, Civil Services…). */
export function GroupCards({ commission, isAdmin }: { commission: Commission; isAdmin: boolean }) {
  return (
    <div className={commission.tracks.length === 1 ? "grid-2 single" : "grid-2"}>
      {commission.tracks.map((t, i) => {
        const theme = groupTheme(t.group, i);
        const blurb = t.tagline || `Structured ${commission.short_name} ${t.group_name} preparation — notes, previous-year questions and progress, topic by topic.`;
        return (
          <article key={t.group} className="group-card" style={{ background: theme.gradient }}>
            <ArrowUpRight className="gc-arrow" size={30} aria-hidden />
            <h2>
              <Link href={trackPath(t.commission, t.group)} className="stretched">
                {commission.short_name} · {t.group_name.toUpperCase()}
              </Link>
            </h2>
            <p>{blurb}</p>
            <div className="gc-pills">
              {MODULES.filter((m) => !m.adminOnly || isAdmin).map((m) => (
                <Link key={m.tab} href={trackPath(t.commission, t.group, m.tab)} className="pill">
                  {m.label}
                </Link>
              ))}
            </div>
            {!t.has_content && <span className="gc-soon">Content for this exam is being prepared</span>}
            <span className="gc-enter" aria-hidden>
              ENTER {t.group_name.toUpperCase()} <ArrowRight size={20} />
            </span>
          </article>
        );
      })}
    </div>
  );
}
