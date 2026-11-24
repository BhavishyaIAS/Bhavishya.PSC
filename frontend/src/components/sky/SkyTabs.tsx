"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DESTINATIONS } from "@/components/space/destinations";
import { trackPath } from "@/lib/format";

import { MODULE_PORTALS } from "./portals";
import { SkyPortal } from "./SkyPortal";

/** The five modules of an exam as pills, each with its own small portal (the Sky style's tabs). */
export function SkyTabs({ commission, group }: { commission: string; group: string }) {
  const pathname = usePathname();
  return (
    <nav className="sky-tabs" aria-label="Workspace sections">
      {DESTINATIONS.map((d) => {
        const href = trackPath(commission, group, d.tab);
        const active = pathname === href || pathname.startsWith(href + "/") || (d.tab === "materials" && pathname.includes("/micro/"));
        return (
          <Link key={d.tab} href={href} aria-current={active ? "page" : undefined}>
            <SkyPortal kind={MODULE_PORTALS[d.tab]?.kind ?? "galaxy"} size={34} />
            {d.long}
          </Link>
        );
      })}
    </nav>
  );
}
