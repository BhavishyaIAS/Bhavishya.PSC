"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DESTINATIONS } from "@/components/space/destinations";
import { Globe } from "@/components/space/Globe";
import { trackPath } from "@/lib/format";

/** The five worlds of an exam, as its navigation: each tab is a place, named for what you do there. */
export function WorkspaceTabs({ commission, group }: { commission: string; group: string }) {
  const pathname = usePathname();
  if (pathname === trackPath(commission, group)) return null; // the exam's own home shows them as blocks
  return (
    <nav className="worlds-nav" aria-label="Workspace sections">
      {DESTINATIONS.filter((d) => d.tab !== "syllabus").map((d) => {
        const href = trackPath(commission, group, d.tab);
        const active = pathname === href || pathname.startsWith(href + "/") || (d.tab === "materials" && pathname.includes("/micro/"));
        return (
          <Link key={d.tab} href={href} className={`world-tab world-tab-${d.world}`} aria-current={active ? "page" : undefined}>
            <Globe world={d.world} size={22} />
            <span className="world-tab-text">
              <span className="world-tab-label">{d.long}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
