import { examPortal, MODULES, type PortalKind } from "@/components/sky/portals";
import { SkyPortal } from "@/components/sky/SkyPortal";
import type { Skin } from "@/lib/types";

import { Emblem, examEmblem, MODULE_EMBLEMS } from "./Emblem";

/** The mark of a module or an exam in the current look: a cosmic portal (Sky) or a quiet emblem (Living). */
export function ModuleMark({ skin, tab, size }: { skin: Skin; tab: string; size: number }) {
  if (skin === "living") return <Emblem kind={MODULE_EMBLEMS[tab] ?? "ripple"} size={size} />;
  const kind: PortalKind = MODULES.find((m) => m.tab === tab)?.kind ?? "galaxy";
  return <SkyPortal kind={kind} size={size} />;
}

export function ExamMark({ skin, slug, index, size, className }: { skin: Skin; slug: string; index: number; size: number; className?: string }) {
  if (skin === "living") return <Emblem kind={examEmblem(slug)} size={size} className={className} />;
  return <SkyPortal kind={examPortal(slug, index)} size={size} className={className} />;
}
