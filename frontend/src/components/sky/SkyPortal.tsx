import type { PortalKind } from "./portals";

/** A round portal of night space; SkyBackdrop draws and animates it. */
export function SkyPortal({ kind, size, className }: { kind: PortalKind; size: number; className?: string }) {
  return <canvas data-sky={kind} width={size} height={size} className={`sky-portal ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden />;
}
