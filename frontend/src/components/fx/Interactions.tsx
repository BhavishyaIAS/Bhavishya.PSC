"use client";

import { useEffect } from "react";

/** Cards that lean towards the pointer (the CSS reads --rx / --ry / --gx / --gy). */
const TILT = "[data-tilt], .commission-card, .group-card, .topic-card, .journey-card, .note-types-big .note-type, .stat";

/**
 * Site-wide motion that needs a little script: 3D card tilt, the reading-progress
 * bar and the top bar's "scrolled" state. All delegated, so no component has to opt in.
 */
export function Interactions() {
  useEffect(() => {
    const root = document.documentElement;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let active: HTMLElement | null = null;
    let frame = 0;

    const release = () => {
      if (!active) return;
      for (const p of ["--rx", "--ry", "--gx", "--gy"]) active.style.removeProperty(p);
      active.classList.remove("is-tilting");
      active = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!fine.matches || root.dataset.motion === "off") return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(TILT) ?? null;
      if (el !== active) release();
      if (!el) return;
      active = el;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        const max = Math.min(9, 2600 / Math.max(r.width, 1));
        el.classList.add("is-tilting");
        el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
      });
    };
    const onScroll = () => {
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty("--read", max > 200 ? Math.min(1, window.scrollY / max).toFixed(4) : "0");
      root.toggleAttribute("data-scrolled", window.scrollY > 12);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", release);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", release);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return <div className="read-progress" aria-hidden />;
}
