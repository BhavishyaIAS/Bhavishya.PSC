"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { drawPortal } from "./portals";

const TAU = Math.PI * 2;

/**
 * The Sky style's backdrop: a field of twinkling stars with a few constellations, the animation of every
 * portal on the page, and the warp — a burst of light from the pointer — when a portal link is followed.
 */
export function SkyBackdrop() {
  const sky = useRef<HTMLCanvasElement>(null);
  const warp = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const cvs = sky.current!;
    const sx = cvs.getContext("2d")!;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
    let stars: { x: number; y: number; r: number; p: number; v: number }[] = [];
    let links: { x: number; y: number }[][] = [];
    const seed = () => {
      let s = 7;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const n = Math.min(260, Math.round((innerWidth * innerHeight) / 6500));
      stars = Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.3, p: rnd() * TAU, v: 0.4 + rnd() }));
      links = [];
      for (let g = 0; g < 5; g++) {
        const cx = 0.1 + rnd() * 0.8, cy = 0.1 + rnd() * 0.8, pts = [];
        for (let i = 0; i < 5; i++) pts.push({ x: cx + (rnd() - 0.5) * 0.16, y: cy + (rnd() - 0.5) * 0.2 });
        links.push(pts);
      }
      const d = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = innerWidth * d;
      cvs.height = innerHeight * d;
    };
    const drawSky = (t: number) => {
      const w = cvs.width, h = cvs.height, d = w / innerWidth;
      const col = getComputedStyle(document.documentElement).getPropertyValue("--star").trim() || "255,255,255";
      sx.clearRect(0, 0, w, h);
      for (const s of stars) {
        sx.fillStyle = `rgba(${col},${0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.v + s.p))})`;
        sx.beginPath();
        sx.arc(s.x * w, s.y * h, s.r * d, 0, TAU);
        sx.fill();
      }
      sx.strokeStyle = `rgba(${col},.16)`;
      sx.lineWidth = d;
      for (const pts of links) {
        sx.beginPath();
        pts.forEach((p, i) => (i ? sx.lineTo(p.x * w, p.y * h) : sx.moveTo(p.x * w, p.y * h)));
        sx.stroke();
        for (const p of pts) {
          sx.fillStyle = `rgba(${col},.6)`;
          sx.beginPath();
          sx.arc(p.x * w, p.y * h, 1.8 * d, 0, TAU);
          sx.fill();
        }
      }
    };
    const portals = () => [...document.querySelectorAll<HTMLCanvasElement>("canvas[data-sky]")];
    const visible = (c: HTMLCanvasElement) => {
      const r = c.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0;
    };
    seed();
    let raf = 0, last = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const t = still() ? 1.3 : ms / 1000;
      // ~30 frames a second is plenty for drifting stars; still: redraw now and then (new portals, theme changes)
      if (ms - last < (still() ? 500 : 33)) return;
      last = ms;
      drawSky(t);
      for (const c of portals()) if (visible(c)) drawPortal(c, t);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => seed();
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
    };
  }, []);

  // The warp: a link marked data-warp opens with a burst of light from where it was pressed.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-warp]");
      const w = warp.current;
      if (!a || !w || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off") return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      e.preventDefault();
      w.style.setProperty("--x", `${e.clientX}px`);
      w.style.setProperty("--y", `${e.clientY}px`);
      w.className = "sky-warp in";
      router.prefetch(href);
      setTimeout(() => {
        router.push(href);
        w.className = "sky-warp out";
        setTimeout(() => (w.className = "sky-warp"), 420);
      }, 440);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  return (
    <>
      <canvas ref={sky} className="sky-stars" aria-hidden />
      <div ref={warp} className="sky-warp" aria-hidden />
    </>
  );
}
