"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { arrive, depart } from "./Backdrop";

/** Cards that lean towards the pointer (the CSS reads --rx / --ry / --gx / --gy). */
const TILT = "[data-tilt], .commission-card, .group-card, .topic-card, .journey-card, .note-types-big .note-type, .stat";

/**
 * Site-wide motion that needs a little script: 3D card tilt, the reading-progress
 * bar, the top bar's "scrolled" state, and the journey between pages. All delegated,
 * so no component has to opt in.
 */
export function Interactions() {
  const pathname = usePathname();
  const first = useRef(true);
  const landing = useRef(0);

  // Travel between pages. A click on a link to another page is the departure: the page
  // recedes and the stars stretch (see [data-travel] in design.css, and Backdrop). When the
  // new page is in, we arrive: it comes forward out of the depth and the stars settle.
  useEffect(() => {
    const root = document.documentElement;
    let fallback = 0;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || root.dataset.motion === "off") return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || url.pathname.startsWith("/api/")) return;
      root.dataset.travel = "depart";
      depart();
      // if the navigation never happens (cancelled, failed), come back instead of staying faded
      window.clearTimeout(fallback);
      fallback = window.setTimeout(() => {
        root.removeAttribute("data-travel");
        arrive();
      }, 3000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const root = document.documentElement;
    if (root.dataset.travel !== "depart") depart(); // arrived without a click (a dropdown, the back button): a brief streak
    root.dataset.travel = "arrive";
    window.clearTimeout(landing.current);
    const settle = window.setTimeout(arrive, 160);
    landing.current = window.setTimeout(() => root.removeAttribute("data-travel"), 900);
    return () => window.clearTimeout(settle);
  }, [pathname]);

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
        const max = Math.min(5, 1500 / Math.max(r.width, 1)); // a few degrees: felt, not seen
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
      root.toggleAttribute("data-deep", window.scrollY > 520);
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
