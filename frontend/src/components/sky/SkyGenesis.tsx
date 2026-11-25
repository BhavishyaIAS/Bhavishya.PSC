"use client";

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

/** One grain of the young universe: where it is round the bell (a, rho) and how far down time it has come (u). */
type Grain = { a: number; rho: number; u: number; v: number; seed: number; kind: number };
type Galaxy = { t: number; a: number; rho: number; size: number; tilt: number; spin: number; col: string };

/** The epochs, top to bottom: quark soup, protons and neutrons, nuclei, atoms, then stars (and galaxies). */
const QUARKS = 0.17;
const NUCLEONS = 0.38;
const NUCLEI = 0.54;
const ATOMS = 0.71;

/**
 * The Sky home's moving backdrop: the Big Bang as a bell of space-time. A singularity glows at the top; out of it
 * time flows down a slowly turning wire bell, and what it carries grows up on the way: a quark soup, then protons and
 * neutrons, nuclei, atoms with their electrons, and at the wide mouth stars and spiral galaxies. It never stops:
 * new grains keep leaving the singularity, rings of time keep sliding down the bell.
 *
 * It stays behind the page: faint, small, hushed behind the title, about 30 frames a second, paused when the tab
 * is hidden, and a single still frame with reduced motion (or when the living backdrops are off in Site settings).
 */
export function SkyGenesis() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current!;
    const g = cvs.getContext("2d")!;
    const root = document.documentElement;
    const still =
      matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.backdrops === "off";

    let W = 0, H = 0, D = 1, dark = true;
    let grains: Grain[] = [];
    let galaxies: Galaxy[] = [];
    let spiral: { x: number; y: number; r: number }[] = [];
    let hush: { x: number; y: number; rx: number; ry: number } | null = null;

    const seeded = (k: number) => {
      let s = k;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    };
    const rnd = seeded(29);

    // the bell: its neck at the singularity, its mouth at the bottom of the screen
    let cx = 0, top = 0, bottom = 0, R = 0;
    const K = 0.13; // how much the rings are tilted towards us
    const radius = (t: number) => R * (0.015 + 0.42 * Math.pow(t, 0.45) + 0.565 * Math.pow(t, 4));
    const yAt = (t: number) => top + t * (bottom - top);

    const layout = () => {
      D = Math.min(window.devicePixelRatio || 1, 1.5);
      W = cvs.width = Math.round(innerWidth * D);
      H = cvs.height = Math.round(innerHeight * D);
      const phone = innerWidth < 700;
      cx = W / 2;
      top = H * (phone ? 0.1 : 0.13);
      bottom = H * 1.02;
      R = Math.min(W * (phone ? 0.5 : 0.47), (bottom - top) * 0.95);
      const r = seeded(5);
      const n = phone ? 110 : innerWidth < 1100 ? 180 : 240;
      grains = Array.from({ length: n }, () => ({
        a: r() * TAU,
        rho: Math.sqrt(r()) * 0.94,
        u: r(),
        v: 0.8 + r() * 0.4,
        seed: r(),
        kind: r(),
      }));
      const cols = ["90,150,255", "255,196,90", "255,110,70", "190,120,255"];
      galaxies = cols.map((col, i) => ({
        t: 0.83 + r() * 0.12,
        a: (i / cols.length) * TAU + r() * 0.8,
        rho: 0.35 + r() * 0.5,
        size: R * (phone ? 0.11 : 0.075) * (0.8 + r() * 0.4),
        tilt: (r() - 0.5) * 1.4,
        spin: r() < 0.5 ? -1 : 1,
        col,
      }));
      spiral = Array.from({ length: 80 }, (_, i) => {
        const k = (i >> 1) / 40;
        const th = k * 3.4 * Math.PI + (i % 2) * Math.PI + (rnd() - 0.5) * 0.5;
        const rr = 0.12 + k * 0.88;
        return { x: Math.cos(th) * rr, y: Math.sin(th) * rr, r: 0.6 + rnd() * 1.1 };
      });
      // the title is read on top of the bell: quieten whatever passes behind it
      const h1 = document.querySelector(".sky-hero");
      if (h1) {
        const b = h1.getBoundingClientRect();
        hush = { x: (b.left + b.width / 2) * D, y: (b.top + b.height / 2) * D, rx: (b.width / 2 + 40) * D, ry: (b.height / 2 + 30) * D };
      }
    };

    // colours for Night and for Day
    const palette = () =>
      dark
        ? {
            grid: "196,186,255", red: "255,84,70", orange: "255,170,70", green: "110,230,140",
            proton: "255,78,78", neutron: "88,150,255", orbit: "200,210,255",
            stars: ["255,255,255", "255,214,140", "170,200,255", "255,170,220"],
            core: ["255,255,255", "255,214,150", "255,120,40"], gridA: 0.22, grainA: 0.9,
          }
        : {
            grid: "70,50,160", red: "214,40,40", orange: "214,120,20", green: "30,150,80",
            proton: "214,44,52", neutron: "40,90,214", orbit: "80,70,170",
            stars: ["110,80,210", "200,120,10", "50,110,220", "200,60,150"],
            core: ["255,236,200", "255,170,70", "240,110,40"], gridA: 0.2, grainA: 0.75,
          };

    const draw = (time: number) => {
      const p = palette();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = dark ? "lighter" : "source-over";
      const phi = time * 0.018; // the bell turns, slowly
      const at = (t: number, a: number, rho: number) => {
        const r = radius(t) * rho;
        return { x: cx + r * Math.sin(a), y: yAt(t) + r * K * Math.cos(a), z: Math.cos(a) * rho };
      };
      const quiet = (x: number, y: number) => {
        if (!hush) return 1;
        const dx = (x - hush.x) / hush.rx, dy = (y - hush.y) / hush.ry;
        const d = dx * dx + dy * dy;
        return d >= 1 ? 1 : 0.25 + 0.75 * d;
      };

      // nebulae in the wide mouth
      for (let i = 0; i < 3; i++) {
        const q = at(0.8 + i * 0.07, i * 2.1 + phi * 0.6, 0.55);
        const rr = R * 0.45;
        const ng = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr);
        const c = i === 1 ? "80,110,255" : "160,80,255";
        ng.addColorStop(0, `rgba(${c},${dark ? 0.1 : 0.07})`);
        ng.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = ng;
        g.fillRect(q.x - rr, q.y - rr, rr * 2, rr * 2);
      }

      // the wire bell: meridians turning with it, and rings of time sliding down
      g.lineWidth = D * 0.9;
      const M = 10;
      for (let i = 0; i < M; i++) {
        const a = (i / M) * TAU + phi;
        const front = (Math.cos(a) + 1) / 2;
        g.strokeStyle = `rgba(${p.grid},${p.gridA * (0.3 + 0.7 * front)})`;
        g.beginPath();
        for (let s = 0; s <= 48; s++) {
          const q = at(s / 48, a, 1);
          if (s) g.lineTo(q.x, q.y);
          else g.moveTo(q.x, q.y);
        }
        g.stroke();
      }
      const RINGS = 7;
      for (let i = 0; i < RINGS; i++) {
        const u = (i / RINGS + time / 70) % 1;
        const t = Math.pow(u, 0.62);
        const fade = Math.sin(Math.PI * u);
        const r = radius(t), y = yAt(t);
        g.strokeStyle = `rgba(${p.grid},${p.gridA * fade * 0.5})`;
        g.beginPath();
        g.ellipse(cx, y, r, r * K, 0, Math.PI, TAU);
        g.stroke();
        g.strokeStyle = `rgba(${p.grid},${p.gridA * fade * 1.1})`;
        g.beginPath();
        g.ellipse(cx, y, r, r * K, 0, 0, Math.PI);
        g.stroke();
      }

      // the grains, each growing up as it comes down
      for (const q of grains) {
        const t = Math.min(1, Math.pow(q.u, 0.62) + (q.seed - 0.5) * 0.04);
        const pos = at(Math.max(0, t), q.a + phi, q.rho);
        const env = Math.min(1, q.u * 25) * Math.min(1, (1 - q.u) * 10);
        const alpha = p.grainA * env * (0.45 + 0.55 * (pos.z + 1) / 2) * quiet(pos.x, pos.y);
        if (alpha < 0.02) continue;
        const sc = (0.7 + t * 1.1) * D;
        let { x, y } = pos;
        if (t < QUARKS) {
          // the quark soup: hot, jittering
          x += Math.sin(time * 9 + q.seed * 50) * 1.4 * D;
          y += Math.cos(time * 11 + q.seed * 70) * 1.4 * D;
          const c = q.kind < 0.4 ? p.red : q.kind < 0.72 ? p.orange : p.green;
          if (q.kind > 0.88) {
            // a gluon: a short wavy thread
            g.strokeStyle = `rgba(${p.green},${alpha * 0.7})`;
            g.beginPath();
            for (let k = 0; k <= 8; k++) {
              const xx = x + (k - 4) * 1.3 * D, yy = y + Math.sin(k * 1.6 + time * 8) * 1.2 * D;
              if (k) g.lineTo(xx, yy);
              else g.moveTo(xx, yy);
            }
            g.stroke();
          } else dot(x, y, 0.9 * sc, c, alpha);
        } else if (t < NUCLEONS) {
          dot(x, y, 1.6 * sc, q.kind < 0.5 ? p.proton : p.neutron, alpha);
        } else if (t < NUCLEI) {
          cluster(x, y, 2 + Math.floor(q.kind * 3), sc, q.seed, alpha);
        } else if (t < ATOMS) {
          cluster(x, y, 1 + Math.floor(q.kind * 3), sc * 0.8, q.seed, alpha);
          const rot = q.seed * Math.PI;
          g.strokeStyle = `rgba(${p.orbit},${alpha * 0.45})`;
          g.beginPath();
          g.ellipse(x, y, 6.5 * sc, 2.4 * sc, rot, 0, TAU);
          g.stroke();
          const e = time * 1.8 + q.seed * 20;
          const ex = 6.5 * sc * Math.cos(e), ey = 2.4 * sc * Math.sin(e);
          dot(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot), 0.8 * sc, p.neutron, alpha);
        } else {
          // stars: twinkling, the brightest with a cross of light
          const c = p.stars[Math.floor(q.kind * 4) % 4];
          const tw = alpha * (0.55 + 0.45 * Math.sin(time * 2.2 + q.seed * 40));
          dot(x, y, (0.8 + q.kind * 1.1) * sc, c, tw);
          if (q.kind > 0.72) {
            const L = (3 + q.kind * 4) * sc;
            g.strokeStyle = `rgba(${c},${tw * 0.6})`;
            g.beginPath();
            g.moveTo(x - L, y);
            g.lineTo(x + L, y);
            g.moveTo(x, y - L);
            g.lineTo(x, y + L);
            g.stroke();
          }
        }
      }

      // spiral galaxies at the mouth, turning
      for (const gx of galaxies) {
        const q = at(gx.t, gx.a + phi, gx.rho);
        const a = (dark ? 0.75 : 0.6) * (0.35 + 0.65 * (q.z + 1) / 2) * quiet(q.x, q.y);
        const sz = gx.size * (0.85 + 0.15 * q.z);
        const cg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz * 0.5);
        cg.addColorStop(0, `rgba(${dark ? "255,250,230" : gx.col},${a * 0.8})`);
        cg.addColorStop(1, `rgba(${gx.col},0)`);
        g.fillStyle = cg;
        g.fillRect(q.x - sz, q.y - sz, sz * 2, sz * 2);
        g.save();
        g.translate(q.x, q.y);
        g.rotate(gx.tilt);
        g.scale(1, 0.42);
        g.rotate(time * 0.06 * gx.spin);
        g.fillStyle = `rgba(${gx.col},${a * 0.7})`;
        for (const s of spiral) {
          g.beginPath();
          g.arc(s.x * sz, s.y * sz, s.r * D, 0, TAU);
          g.fill();
        }
        g.restore();
      }

      // the singularity, breathing, with its rays
      const pulse = 0.85 + 0.15 * Math.sin(time * 1.3);
      const G = R * (innerWidth < 700 ? 0.3 : 0.2) * pulse;
      const rays = 36;
      const reach = G * 2.6;
      const rg = g.createRadialGradient(cx, top, 0, cx, top, reach);
      rg.addColorStop(0, `rgba(${p.core[0]},${dark ? 0.5 : 0.45})`);
      rg.addColorStop(0.35, `rgba(${p.core[1]},${dark ? 0.2 : 0.2})`);
      rg.addColorStop(1, `rgba(${p.core[2]},0)`);
      g.fillStyle = rg;
      g.beginPath();
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + time * 0.025 + Math.sin(i * 7.3) * 0.05;
        const len = reach * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.6 + i * 2.39)) * (0.5 + 0.5 * Math.abs(Math.sin(i * 12.9))));
        const w = 0.018 + 0.012 * Math.abs(Math.sin(i * 3.7));
        g.moveTo(cx + Math.cos(a - w) * G * 0.15, top + Math.sin(a - w) * G * 0.15);
        g.lineTo(cx + Math.cos(a) * len, top + Math.sin(a) * len);
        g.lineTo(cx + Math.cos(a + w) * G * 0.15, top + Math.sin(a + w) * G * 0.15);
        g.closePath();
      }
      g.fill();
      const cg = g.createRadialGradient(cx, top, 0, cx, top, G);
      cg.addColorStop(0, `rgba(${p.core[0]},${dark ? 0.95 : 0.9})`);
      cg.addColorStop(0.18, `rgba(${p.core[1]},${dark ? 0.6 : 0.5})`);
      cg.addColorStop(0.55, `rgba(${p.core[2]},${dark ? 0.16 : 0.12})`);
      cg.addColorStop(1, `rgba(${p.core[2]},0)`);
      g.fillStyle = cg;
      g.fillRect(cx - G, top - G, G * 2, G * 2);

      // now and then, a soft wave of light leaves it
      const wave = (time % 14) / 4;
      if (wave < 1) {
        g.strokeStyle = `rgba(${p.core[1]},${0.28 * (1 - wave)})`;
        g.lineWidth = D * (1 + 2 * (1 - wave));
        g.beginPath();
        g.arc(cx, top, R * 0.55 * Math.sqrt(wave), 0, TAU);
        g.stroke();
      }
      g.globalCompositeOperation = "source-over";
    };

    function dot(x: number, y: number, r: number, c: string, a: number) {
      g.fillStyle = `rgba(${c},${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    function cluster(x: number, y: number, n: number, sc: number, seed: number, a: number) {
      const p = palette();
      for (let k = 0; k < n; k++) {
        const ang = seed * 40 + k * 2.2;
        const off = n === 1 ? 0 : 1.6 * sc;
        dot(x + Math.cos(ang) * off, y + Math.sin(ang) * off, 1.3 * sc, k % 2 ? p.neutron : p.proton, a);
      }
    }

    // time goes on only while the page is in view
    let raf = 0, last = 0, clock = 20;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 32) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      for (const q of grains) {
        q.u += (dt * q.v) / 40;
        if (q.u > 1) {
          q.u -= 1;
          q.a = rnd() * TAU;
          q.rho = Math.sqrt(rnd()) * 0.94;
        }
      }
      draw(clock);
    };
    const start = () => {
      if (still || raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const readTheme = () => {
      dark = root.dataset.theme === "dark";
    };
    readTheme();
    layout();
    draw(clock);
    start();

    // it steps back as you scroll down into the page
    const onScroll = () => {
      cvs.style.setProperty("--genesis-fade", String(1 - 0.55 * Math.min(1, scrollY / innerHeight)));
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        layout();
        draw(clock);
      }, 150);
    };
    addEventListener("resize", onResize);
    const onVisible = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisible);
    const theme = new MutationObserver(() => {
      readTheme();
      draw(clock);
    });
    theme.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      theme.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return <canvas ref={ref} className="sky-genesis" aria-hidden />;
}
