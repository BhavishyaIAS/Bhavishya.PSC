"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { trackPath } from "@/lib/format";

import { ModuleMark } from "@/components/living/Mark";
import type { Skin } from "@/lib/types";

import { MODULES } from "./portals";

/**
 * The four modules of an exam as pills, each with its own small portal, on every page inside the exam
 * (not on the exam's own home, where they are the big blocks).
 */
export function SkyTabs({ commission, group, skin }: { commission: string; group: string; skin: Skin }) {
  const pathname = usePathname();
  if (pathname === trackPath(commission, group)) return null;
  return (
    <nav className="sky-tabs" aria-label="Exam modules">
      {MODULES.map((m) => {
        const href = trackPath(commission, group, m.tab);
        const active = pathname === href || pathname.startsWith(href + "/") || (m.tab === "materials" && pathname.includes("/micro/"));
        return (
          <Link key={m.tab} href={href} aria-current={active ? "page" : undefined} data-warp>
            <ModuleMark skin={skin} tab={m.tab} size={34} />
            {m.name}
          </Link>
        );
      })}
    </nav>
  );
}
