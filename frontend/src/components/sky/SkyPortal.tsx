"use client";

import { useEffect, useRef } from "react";

import { type PortalKind, registerPortal } from "./portals";

/** A round portal of night space: drawn as soon as it appears, animated by PortalMotion while on screen. */
export function SkyPortal({ kind, size, className }: { kind: PortalKind; size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => registerPortal(ref.current!), [kind]);
  return <canvas ref={ref} data-sky={kind} width={size} height={size} className={`sky-portal ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden />;
}
