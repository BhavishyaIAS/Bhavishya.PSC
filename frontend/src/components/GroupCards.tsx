import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { DESTINATIONS } from "@/components/space/destinations";
import { Globe } from "@/components/space/Globe";
import { trackPath } from "@/lib/format";
import type { Commission } from "@/lib/types";

/**
 * A commission's exams (Group 1, Group 2, Civil Services…), each as a station in orbit:
 * the exam itself, and under it the five worlds you can go straight to.
 */
export function GroupCards({ commission }: { commission: Commission }) {
  return (
    <div className={commission.tracks.length === 1 ? "stations single" : "stations"}>
      {commission.tracks.map((t, i) => {
        const blurb = t.tagline || `Structured ${commission.short_name} ${t.group_name} preparation: notes, previous-year questions and progress, topic by topic.`;
        return (
          <article key={t.group} className="station-card">
            <div className="station-idx" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </div>
            <h2>
              <Link href={trackPath(t.commission, t.group)} className="stretched">
                <span className="station-of">{commission.short_name}</span> {t.group_name}
              </Link>
            </h2>
            <p>{blurb}</p>
            {!t.has_content && <span className="station-soon">Content for this exam is being prepared</span>}
            <ul className="station-worlds">
              {DESTINATIONS.map((d) => (
                <li key={d.tab}>
                  <Link href={trackPath(t.commission, t.group, d.tab)}>
                    <Globe world={d.world} size={16} />
                    <span>{d.long}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <span className="station-enter" aria-hidden>
              Enter {t.group_name} <ArrowRight size={17} />
            </span>
          </article>
        );
      })}
    </div>
  );
}
