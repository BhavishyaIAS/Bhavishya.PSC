"use client";

import { useEffect, useRef } from "react";

import { seeded } from "./engine";

const TAU = Math.PI * 2;
const LOGO_AT = 1.45; // seconds: the logo starts to appear in the light
const OPEN_AT = 3.0; // the portal opens onto the page
const OPEN_FOR = 1.0;

/**
 * The arrival. Once per visit, before the first page is shown: a tunnel of prismatic light
 * (a rainbow bridge) rushes past, the logo comes out of the glow at its centre, and the
 * whole thing opens like an iris onto the page while the logo flies to its place in the
 * top bar. Click, tap or press any key to skip.
 *
 * The cover is in the server's HTML and is shown by `<html data-portal="on">`, which a
 * script in <head> sets before first paint (never for reduced motion, or when animations
 * or 3D backgrounds are switched off). If this script never runs, CSS removes the cover
 * by itself after a few seconds.
 */
export function Portal({ logo, name, tagline }: { logo: string; name: string; tagline: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const el = host.current;
    const canvas = el?.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!el || !canvas || !ctx || root.dataset.portal !== "on") return;
    const mark = el.querySelector<HTMLElement>(".portal-logo");

    let w = 0, h = 0, big = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      big = Math.max(w, h);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#04050c";
      ctx.fillRect(0, 0, w, h);
    };
    resize();
    el.style.background = "transparent"; // from here on the canvas is the cover (so it can open like an iris)

    const rnd = seeded(77);
    const streaks = Array.from({ length: w < 700 ? 300 : 520 }, () => ({ a: rnd() * TAU, z: 0.05 + rnd() * 0.95, speed: 0.35 + rnd() * 0.9, hue: rnd() * 40 - 20, white: rnd() > 0.82 }));
    const hoops = Array.from({ length: 6 }, (_, i) => ({ z: (i + 1) / 6 }));

    let raf = 0, t0 = performance.now(), last = t0, leaving = false, over = false;
    const end = () => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      root.removeAttribute("data-portal");
      cleanup();
    };
    /** Jump to the opening. */
    const skip = () => {
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed < OPEN_AT) t0 = performance.now() - OPEN_AT * 1000;
      el.classList.add("show-logo");
    };

    const frame = (now: number) => {
      const T = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cx = w / 2, cy = h * 0.46;
      const rush = 0.3 + Math.min(1, T / 2.2) * 1.5; // gathering speed
      const appear = Math.min(1, T / 0.5);

      // each frame dims the last a little instead of wiping it: light leaves trails
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(4, 5, 12, 0.3)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      const k = big * 0.045;
      for (const hoop of hoops) {
        hoop.z -= dt * rush * 0.42;
        if (hoop.z < 0.04) hoop.z = 1;
        const r = k / hoop.z;
        ctx.globalAlpha = appear * Math.min(1, (1 - hoop.z) * 1.4) * 0.22;
        ctx.strokeStyle = `hsl(${(T * 50 + hoop.z * 300) % 360} 90% 66%)`;
        ctx.lineWidth = 1 + (1 - hoop.z) * 2.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.94, 0, 0, TAU);
        ctx.stroke();
      }
      for (const s of streaks) {
        s.z -= dt * s.speed * rush * 0.55;
        if (s.z < 0.035) s.z = 1;
        const a = s.a + (1 - s.z) * 0.55 + T * 0.12; // a slow twist: the tunnel turns as it comes
        const r1 = k / s.z, r2 = k / Math.min(1.2, s.z + 0.035 + rush * 0.05 * s.speed);
        const cos = Math.cos(a), sin = Math.sin(a);
        ctx.globalAlpha = appear * Math.min(1, (1 - s.z) * 1.8) * (s.white ? 0.75 : 0.85);
        // the colours of the spectrum run round the tunnel, as on the rainbow bridge
        ctx.strokeStyle = s.white ? "#fff4e0" : `hsl(${((s.a / TAU) * 360 + T * 36 + s.hue + 360) % 360} 96% 64%)`;
        ctx.lineWidth = 0.5 + (1 - s.z) * (s.white ? 1.8 : 2.8);
        ctx.beginPath();
        ctx.moveTo(cx + cos * r2, cy + sin * r2 * 0.94);
        ctx.lineTo(cx + cos * r1, cy + sin * r1 * 0.94);
        ctx.stroke();
      }
      // the light at the end of it, which grows until it fills the view
      const bloom = Math.min(1, Math.max(0, (T - 0.5) / 1.9));
      const radius = big * (0.07 + bloom * bloom * 0.24);
      const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      light.addColorStop(0, `rgba(255, 246, 228, ${0.34 + bloom * 0.2})`);
      light.addColorStop(0.3, `rgba(255, 206, 140, ${0.2 + bloom * 0.12})`);
      light.addColorStop(1, "rgba(255, 190, 120, 0)");
      ctx.globalAlpha = appear;
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();

      if (T > LOGO_AT) el.classList.add("show-logo");
      if (T > OPEN_AT) {
        if (!leaving) {
          leaving = true;
          // the logo flies to its place in the top bar
          const target = document.querySelector<HTMLElement>(".topbar .brand-logo")?.getBoundingClientRect();
          const from = mark?.getBoundingClientRect();
          if (mark && target && from && target.width > 0) {
            mark.style.setProperty("--dx", `${target.left + target.width / 2 - (from.left + from.width / 2)}px`);
            mark.style.setProperty("--dy", `${target.top + target.height / 2 - (from.top + from.height / 2)}px`);
            mark.style.setProperty("--ds", String(target.width / from.width));
          }
          el.classList.add("leaving");
          root.dataset.portal = "open"; // the page behind starts to unravel
        }
        const p = Math.min(1, (T - OPEN_AT) / OPEN_FOR), eased = 1 - Math.pow(1 - p, 3);
        const hole = eased * Math.hypot(w, h) * 0.7;
        const mask = `radial-gradient(circle at 50% 46%, transparent ${hole}px, #000 ${hole + 160}px)`;
        canvas.style.maskImage = mask;
        canvas.style.webkitMaskImage = mask;
        if (p >= 1) return end();
      }
      raf = requestAnimationFrame(frame);
    };

    const onKey = () => skip();
    function cleanup() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("pointerdown", skip);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", skip);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, []);

  return (
    <div ref={host} className="portal" aria-hidden>
      <canvas />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="portal-logo" src={logo} alt="" width={148} height={148} />
      <div className="portal-words">
        <b>{name}</b>
        <span>{tagline}</span>
      </div>
      <span className="portal-skip">Tap to skip</span>
    </div>
  );
}
