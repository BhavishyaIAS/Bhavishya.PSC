import { examPortal, MODULES, type PortalKind } from "@/components/sky/portals";
import { SkyPortal } from "@/components/sky/SkyPortal";
import { DESTINATIONS } from "@/components/space/destinations";
import { Globe } from "@/components/space/Globe";
import type { Skin } from "@/lib/types";

import { Emblem, examEmblem, MODULE_EMBLEMS } from "./Emblem";

/**
 * The mark of a module or an exam in the current look: a cosmic portal (Sky), a quiet emblem (Living), or the
 * module's own planet (Classic, the solar-system look: the same spheres as its landing page).
 */
export function ModuleMark({ skin, tab, size }: { skin: Skin; tab: string; size: number }) {
  if (skin === "living") return <Emblem kind={MODULE_EMBLEMS[tab] ?? "ripple"} size={size} />;
  const world = DESTINATIONS.find((d) => d.tab === tab)?.world;
  if (skin === "classic" && world) return <Globe world={world} size={size} />;
  const kind: PortalKind = MODULES.find((m) => m.tab === tab)?.kind ?? "galaxy";
  return <SkyPortal kind={kind} size={size} />;
}

export function ExamMark({ skin, slug, index, size, className }: { skin: Skin; slug: string; index: number; size: number; className?: string }) {
  if (skin === "living") return <Emblem kind={examEmblem(slug)} size={size} className={className} />;
  return <SkyPortal kind={examPortal(slug, index)} size={size} className={className} />;
}
