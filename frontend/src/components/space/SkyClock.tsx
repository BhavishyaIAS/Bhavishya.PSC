"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cosmicEngine } from "./environment";

/**
 * Keeps the sky's state on <html> current (data-sky, data-sky-phase and the --sky-* / --sun-*
 * colours that the CSS reads): set before the first paint by the boot script, then once a minute
 * and on every page. Independent of WebGL, so the still fallback follows the time of day too.
 */
export function SkyClock() {
  const pathname = usePathname();
  useEffect(() => {
    const engine = cosmicEngine();
    const tick = () => engine.apply(document.documentElement, engine.sky(engine.moment(location.search), { phone: innerWidth < 900 }));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [pathname]);
  return null;
}
