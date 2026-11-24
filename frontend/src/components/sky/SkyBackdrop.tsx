"use client";

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

/**
 * The Sky style's backdrop: a field of stars with a few constellations. It is drawn once (and again only on a
 * resize or a change of Day / Night), never per frame, so the glass above it costs nothing while you scroll.
 */
export function SkyBackdrop() {
  const sky = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = sky.current!;
    const sx = cvs.getContext("2d")!;
    const draw = () => {
      let s = 7;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const w = (cvs.width = Math.round(innerWidth * d));
      const h = (cvs.height = Math.round(innerHeight * d));
      const col = getComputedStyle(document.documentElement).getPropertyValue("--star").trim() || "255,255,255";
      const n = Math.min(260, Math.round((innerWidth * innerHeight) / 6500));
      sx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const x = rnd(), y = rnd(), r = 0.4 + rnd() * 1.3, p = rnd() * TAU;
        sx.fillStyle = `rgba(${col},${0.25 + 0.45 * (0.5 + 0.5 * Math.sin(p))})`;
        sx.beginPath();
        sx.arc(x * w, y * h, r * d, 0, TAU);
        sx.fill();
      }
      sx.strokeStyle = `rgba(${col},.16)`;
      sx.lineWidth = d;
      for (let g = 0; g < 5; g++) {
        const cx = 0.1 + rnd() * 0.8, cy = 0.1 + rnd() * 0.8;
        const pts = Array.from({ length: 5 }, () => ({ x: cx + (rnd() - 0.5) * 0.16, y: cy + (rnd() - 0.5) * 0.2 }));
        sx.beginPath();
        pts.forEach((p, i) => (i ? sx.lineTo(p.x * w, p.y * h) : sx.moveTo(p.x * w, p.y * h)));
        sx.stroke();
        sx.fillStyle = `rgba(${col},.6)`;
        for (const p of pts) {
          sx.beginPath();
          sx.arc(p.x * w, p.y * h, 1.8 * d, 0, TAU);
          sx.fill();
        }
      }
    };
    draw();
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 150);
    };
    addEventListener("resize", onResize);
    const theme = new MutationObserver(() => requestAnimationFrame(draw));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      removeEventListener("resize", onResize);
      theme.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return <canvas ref={sky} className="sky-stars" aria-hidden />;
}
