"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { drawPortal, visiblePortals } from "./portals";

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";

/**
 * Brings the round portals to life (every `canvas[data-sky]`): only those on screen are drawn, at about
 * 30 frames a second, and nothing runs while none is visible or the tab is hidden.
 *
 * It also makes following a portal feel like the prototype: a burst of light opens from where it was
 * pressed, the next page loads behind it, and the light clears once that page is there.
 */
export function PortalMotion() {
  const pathname = usePathname();
  const router = useRouter();
  const warp = useRef<HTMLDivElement>(null);
  const pending = useRef<{ path: string; since: number } | null>(null);

  // animate the portals on screen (they register themselves: SkyPortal)
  useEffect(() => {
    let raf = 0, last = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || visiblePortals.size === 0 || still() || ms - last < 33) return;
      last = ms;
      const t = ms / 1000;
      for (const c of visiblePortals) drawPortal(c, t);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the warp: a link marked data-warp opens with light from the pointer, held until the new page is in
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-warp]");
      const w = warp.current;
      if (document.documentElement.dataset.skin !== "sky") return; // the warp belongs to the Sky look
      if (!a || !w || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || still()) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      e.preventDefault();
      const path = href.split(/[?#]/)[0];
      w.style.setProperty("--x", `${e.clientX}px`);
      w.style.setProperty("--y", `${e.clientY}px`);
      w.className = "sky-warp in";
      if (path === location.pathname) {
        pending.current = null;
        router.push(href);
        window.setTimeout(() => clear(w), 450);
        return;
      }
      pending.current = { path, since: performance.now() };
      router.push(href);
      window.setTimeout(() => pending.current && clear(w), 5000); // never stay covered
    };
    // capture: before Next's own link handler takes the click
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // the new page is in: let the light clear (after the burst has had its moment)
  useEffect(() => {
    const p = pending.current, w = warp.current;
    if (!p || !w || p.path !== pathname) return;
    pending.current = null;
    window.setTimeout(() => clear(w), Math.max(0, 450 - (performance.now() - p.since)));
  }, [pathname]);

  return <div ref={warp} className="sky-warp" aria-hidden />;
}

function clear(w: HTMLDivElement) {
  w.className = "sky-warp out";
  window.setTimeout(() => (w.className = "sky-warp"), 420);
}
