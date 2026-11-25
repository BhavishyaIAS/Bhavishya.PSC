"use client";

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

/** One grain of the young universe: where it is round the funnel (a, rho) and how far along time it has come (u). */
type Grain = { a: number; rho: number; u: number; v: number; seed: number; kind: number };
type Galaxy = { t: number; a: number; rho: number; size: number; tilt: number; spin: number; col: string };
type Node = { t: number; a: number; rho: number; links: number[] };
type Flame = { u: number; a: number; rho: number; size: number; v: number };

/** The epochs, left to right: inflation and the hot plasma, particles, nuclei, atoms, then stars and galaxies. */
const QUARKS = 0.16;
const NUCLEONS = 0.34;
const NUCLEI = 0.5;
const ATOMS = 0.66;

// Night colours: the space behind the home page is night in Day and Night alike, as in the Classic look
const C = {
  grid: "200,190,255",
  red: "255,84,70",
  orange: "255,170,70",
  green: "110,230,140",
  proton: "255,78,78",
  neutron: "88,150,255",
  orbit: "200,210,255",
  web: "170,120,255",
  stars: ["255,255,255", "255,214,140", "170,200,255", "255,170,220"],
};

/**
 * The Sky home's backdrop: night space (in Day too, as in the Classic look) and, across it, the Big Bang as a funnel
 * of space-time lying on its side. A singularity blazes at the left; out of it time flows right along a slowly turning
 * wire funnel, and what it carries grows up on the way: the hot plasma of inflation, a quark soup, protons and
 * neutrons, nuclei, atoms with their electrons, the first stars, and at the wide mouth spiral galaxies strung on the
 * cosmic web. It never stops: new grains keep leaving the singularity, rings of time keep sliding along.
 *
 * It stays behind the page: faint, hushed behind the title, under the glass of the exam cards, stepping back as you
 * scroll; about 30 frames a second, paused while the tab is hidden, and a single still frame with reduced motion
 * (or when the living backdrops are off in Site settings).
 */
export function SkyGenesis() {
  const spaceRef = useRef<HTMLCanvasElement>(null);
  const bangRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const space = spaceRef.current!;
    const cvs = bangRef.current!;
    const s = space.getContext("2d")!;
    const g = cvs.getContext("2d")!;
    const still =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.backdrops === "off";

    const seeded = (k: number) => {
      let v = k;
      return () => (v = (v * 16807) % 2147483647) / 2147483647;
    };
    const rnd = seeded(29);

    let W = 0, H = 0, D = 1;
    let grains: Grain[] = [];
    let galaxies: Galaxy[] = [];
    let nodes: Node[] = [];
    let flames: Flame[] = [];
    let spiral: { x: number; y: number; r: number }[] = [];
    let hush: { x: number; y: number; rx: number; ry: number } | null = null;

    // the funnel: its neck at the singularity on the left, its mouth past the right edge
    let left = 0, right = 0, cy = 0, R = 0;
    const K = 0.16; // how much the rings are turned towards us
    const radius = (t: number) => R * (0.018 + 0.4 * Math.pow(t, 0.4) + 0.58 * Math.pow(t, 5));
    const xAt = (t: number) => left + t * (right - left);
    const at = (t: number, a: number, rho: number) => {
      const r = radius(t) * rho;
      return { x: xAt(t) + r * K * Math.sin(a), y: cy + r * Math.cos(a), z: Math.sin(a) * rho };
    };

    /** The still night behind it all: a deep gradient, two bands of nebula, and a field of stars. Drawn on resize only. */
    const paintSpace = () => {
      const w = space.width, h = space.height;
      const bg = s.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0e0828");
      bg.addColorStop(1, "#060414");
      s.fillStyle = bg;
      s.fillRect(0, 0, w, h);
      const glow = (x: number, y: number, r: number, c: string) => {
        const rg = s.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, c);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        s.fillStyle = rg;
        s.fillRect(x - r, y - r, r * 2, r * 2);
      };
      glow(w * 0.12, h * 0.08, Math.max(w, h) * 0.5, "rgba(190,70,160,0.2)");
      glow(w * 0.92, h * 0.22, Math.max(w, h) * 0.5, "rgba(50,90,220,0.22)");
      glow(w * 0.5, h * 1.05, Math.max(w, h) * 0.6, "rgba(110,50,200,0.22)");
      const r = seeded(7);
      // two milky bands of cloud, top left to right and lower right, as in a long exposure
      for (const [x0, y0, x1, y1, col] of [
        [0.0, 0.18, 0.62, 0.0, "70,110,255"],
        [0.55, 1.0, 1.0, 0.62, "140,80,255"],
      ] as const) {
        for (let i = 0; i < 26; i++) {
          const k = r();
          const x = (x0 + (x1 - x0) * k) * w + (r() - 0.5) * w * 0.08;
          const y = (y0 + (y1 - y0) * k) * h + (r() - 0.5) * h * 0.12;
          glow(x, y, (0.05 + r() * 0.08) * Math.max(w, h), `rgba(${col},${0.04 + r() * 0.05})`);
        }
      }
      const n = Math.min(520, Math.round((innerWidth * innerHeight) / 3200));
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = r() * h, big = r() > 0.94;
        const c = r() > 0.8 ? C.stars[1 + Math.floor(r() * 3)] : C.stars[0];
        s.fillStyle = `rgba(${c},${0.25 + r() * 0.55})`;
        s.beginPath();
        s.arc(x, y, (big ? 1.3 + r() * 0.9 : 0.35 + r() * 0.8) * D, 0, TAU);
        s.fill();
        if (big) {
          s.strokeStyle = `rgba(${c},0.35)`;
          s.lineWidth = 0.6 * D;
          const L = 4 * D;
          s.beginPath();
          s.moveTo(x - L, y);
          s.lineTo(x + L, y);
          s.moveTo(x, y - L);
          s.lineTo(x, y + L);
          s.stroke();
        }
      }
    };

    const layout = () => {
      D = Math.min(window.devicePixelRatio || 1, 1.5);
      W = cvs.width = space.width = Math.round(innerWidth * D);
      H = cvs.height = space.height = Math.round(innerHeight * D);
      const phone = innerWidth < 700;
      left = W * (phone ? 0.03 : 0.045);
      right = W * 1.04;
      cy = H * 0.52;
      R = Math.min(H * (phone ? 0.3 : 0.56), (right - left) * 0.5);
      const r = seeded(5);
      const n = phone ? 120 : innerWidth < 1100 ? 200 : 270;
      grains = Array.from({ length: n }, () => ({
        a: r() * TAU, rho: Math.sqrt(r()) * 0.94, u: r(), v: 0.8 + r() * 0.4, seed: r(), kind: r(),
      }));
      flames = Array.from({ length: phone ? 8 : 14 }, () => ({
        u: r(), a: r() * TAU, rho: r() * 0.8, size: 0.5 + r() * 0.7, v: 0.7 + r() * 0.6,
      }));
      const cols = ["90,150,255", "255,196,90", "255,110,70", "190,120,255", "120,220,255", "255,150,200"];
      galaxies = cols.map((col, i) => ({
        t: 0.74 + r() * 0.22,
        a: (i / cols.length) * TAU + r() * 0.6,
        rho: 0.3 + r() * 0.6,
        size: R * 0.075 * (0.7 + r() * 0.6),
        tilt: (r() - 0.5) * 2,
        spin: r() < 0.5 ? -1 : 1,
        col,
      }));
      // the cosmic web: knots near the mouth, each tied to its nearest neighbours
      nodes = Array.from({ length: phone ? 12 : 18 }, () => ({
        t: 0.8 + r() * 0.2, a: r() * TAU, rho: 0.2 + r() * 0.75, links: [],
      }));
      const p0 = nodes.map((q) => at(q.t, q.a, q.rho));
      nodes.forEach((q, i) => {
        q.links = p0
          .map((p, j) => ({ j, d: Math.hypot(p.x - p0[i].x, p.y - p0[i].y) }))
          .filter((e) => e.j > i)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .map((e) => e.j);
      });
      spiral = Array.from({ length: 80 }, (_, i) => {
        const k = (i >> 1) / 40;
        const th = k * 3.4 * Math.PI + (i % 2) * Math.PI + (rnd() - 0.5) * 0.5;
        const rr = 0.12 + k * 0.88;
        return { x: Math.cos(th) * rr, y: Math.sin(th) * rr, r: 0.6 + rnd() * 1.1 };
      });
      // the title is read on top of the funnel: quieten whatever passes behind it
      const h1 = document.querySelector(".sky-hero");
      hush = null;
      if (h1) {
        const b = h1.getBoundingClientRect();
        hush = { x: (b.left + b.width / 2) * D, y: (b.top + b.height / 2) * D, rx: (b.width / 2 + 40) * D, ry: (b.height / 2 + 30) * D };
      }
      paintSpace();
    };

    function dot(x: number, y: number, r: number, c: string, a: number) {
      g.fillStyle = `rgba(${c},${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    function cluster(x: number, y: number, n: number, sc: number, seed: number, a: number) {
      for (let k = 0; k < n; k++) {
        const ang = seed * 40 + k * 2.2;
        const off = n === 1 ? 0 : 1.6 * sc;
        dot(x + Math.cos(ang) * off, y + Math.sin(ang) * off, 1.3 * sc, k % 2 ? C.neutron : C.proton, a);
      }
    }

    const draw = (time: number) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.74; // everything faint, but the singularity itself
      const phi = time * 0.02; // the funnel turns about its own axis, slowly
      const quiet = (x: number, y: number) => {
        if (!hush) return 1;
        const dx = (x - hush.x) / hush.rx, dy = (y - hush.y) / hush.ry;
        const d = dx * dx + dy * dy;
        return d >= 1 ? 1 : 0.25 + 0.75 * d;
      };

      // the funnel's body, coloured by its age: white-hot at the neck, through fire and violet to deep blue
      const STEPS = 60;
      g.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        if (i) g.lineTo(xAt(t), cy - radius(t));
        else g.moveTo(xAt(t), cy - radius(t));
      }
      for (let i = STEPS; i >= 0; i--) g.lineTo(xAt(i / STEPS), cy + radius(i / STEPS));
      g.closePath();
      const body = g.createLinearGradient(left, 0, right, 0);
      body.addColorStop(0, "rgba(255,230,190,0.34)");
      body.addColorStop(0.08, "rgba(255,140,50,0.24)");
      body.addColorStop(0.24, "rgba(220,50,50,0.14)");
      body.addColorStop(0.45, "rgba(150,60,200,0.1)");
      body.addColorStop(0.7, "rgba(70,80,220,0.08)");
      body.addColorStop(1, "rgba(40,50,160,0.05)");
      g.fillStyle = body;
      g.fill();

      // the fire of the first moments, rolling outward and cooling
      for (const f of flames) {
        const t = Math.pow(f.u, 0.7) * 0.3;
        const p = at(t, f.a + phi, f.rho);
        const rr = radius(t) * 0.6 * f.size + R * 0.02;
        const a = 0.16 * Math.sin(Math.PI * f.u) * quiet(p.x, p.y);
        const fg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        fg.addColorStop(0, `rgba(255,${Math.round(170 - f.u * 110)},60,${a})`);
        fg.addColorStop(1, "rgba(255,60,30,0)");
        g.fillStyle = fg;
        g.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
      }

      // the wire funnel: lines along it turning with it, and rings of time sliding outward
      g.lineWidth = D * 0.9;
      const M = 12;
      for (let i = 0; i < M; i++) {
        const a = (i / M) * TAU + phi;
        const front = (Math.sin(a) + 1) / 2;
        g.strokeStyle = `rgba(${C.grid},${0.2 * (0.25 + 0.75 * front)})`;
        g.beginPath();
        for (let k = 0; k <= 56; k++) {
          const q = at(k / 56, a, 1);
          if (k) g.lineTo(q.x, q.y);
          else g.moveTo(q.x, q.y);
        }
        g.stroke();
      }
      // the rim of the funnel's outline, top and bottom
      g.strokeStyle = `rgba(${C.grid},0.28)`;
      for (const sgn of [-1, 1]) {
        g.beginPath();
        for (let k = 0; k <= 56; k++) {
          const t = k / 56;
          if (k) g.lineTo(xAt(t), cy + sgn * radius(t));
          else g.moveTo(xAt(t), cy + sgn * radius(t));
        }
        g.stroke();
      }
      const RINGS = 8;
      for (let i = 0; i < RINGS; i++) {
        const u = (i / RINGS + time / 75) % 1;
        const t = Math.pow(u, 0.62);
        const fade = Math.sin(Math.PI * u);
        const r = radius(t), x = xAt(t);
        g.strokeStyle = `rgba(${C.grid},${0.12 * fade})`;
        g.beginPath();
        g.ellipse(x, cy, r * K, r, 0, Math.PI / 2, (Math.PI * 3) / 2);
        g.stroke();
        g.strokeStyle = `rgba(${C.grid},${0.3 * fade})`;
        g.beginPath();
        g.ellipse(x, cy, r * K, r, 0, -Math.PI / 2, Math.PI / 2);
        g.stroke();
      }

      // the cosmic web at the mouth
      const web = nodes.map((q) => at(q.t, q.a + phi, q.rho));
      g.lineWidth = D;
      nodes.forEach((q, i) => {
        for (const j of q.links) {
          const p1 = web[i], p2 = web[j];
          const a = 0.16 * (0.4 + 0.3 * (p1.z + p2.z + 2) / 2) * quiet((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          g.strokeStyle = `rgba(${C.web},${a})`;
          g.beginPath();
          g.moveTo(p1.x, p1.y);
          g.quadraticCurveTo((p1.x + p2.x) / 2 + (p1.y - p2.y) * 0.15, (p1.y + p2.y) / 2 + (p2.x - p1.x) * 0.15, p2.x, p2.y);
          g.stroke();
        }
        const p = web[i];
        const rr = R * 0.03;
        const ng = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        ng.addColorStop(0, `rgba(255,220,190,${0.35 * quiet(p.x, p.y)})`);
        ng.addColorStop(1, `rgba(${C.web},0)`);
        g.fillStyle = ng;
        g.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
      });

      // the grains, each growing up as it travels
      for (const q of grains) {
        const t = Math.max(0, Math.min(1, Math.pow(q.u, 0.62) + (q.seed - 0.5) * 0.04));
        const pos = at(t, q.a + phi, q.rho);
        const env = Math.min(1, q.u * 25) * Math.min(1, (1 - q.u) * 10);
        const alpha = 0.9 * env * (0.45 + 0.55 * (pos.z + 1) / 2) * quiet(pos.x, pos.y);
        if (alpha < 0.02) continue;
        const sc = (0.7 + t * 1.1) * D;
        let { x, y } = pos;
        if (t < QUARKS) {
          // the quark soup: hot, jittering
          x += Math.sin(time * 9 + q.seed * 50) * 1.4 * D;
          y += Math.cos(time * 11 + q.seed * 70) * 1.4 * D;
          const c = q.kind < 0.45 ? C.red : q.kind < 0.78 ? C.orange : C.green;
          if (q.kind > 0.88) {
            // a gluon: a short wavy thread
            g.strokeStyle = `rgba(${C.green},${alpha * 0.7})`;
            g.beginPath();
            for (let k = 0; k <= 8; k++) {
              const yy = y + (k - 4) * 1.3 * D, xx = x + Math.sin(k * 1.6 + time * 8) * 1.2 * D;
              if (k) g.lineTo(xx, yy);
              else g.moveTo(xx, yy);
            }
            g.stroke();
          } else dot(x, y, 0.9 * sc, c, alpha);
        } else if (t < NUCLEONS) {
          dot(x, y, 1.6 * sc, q.kind < 0.5 ? C.proton : C.neutron, alpha);
        } else if (t < NUCLEI) {
          cluster(x, y, 2 + Math.floor(q.kind * 3), sc, q.seed, alpha);
        } else if (t < ATOMS) {
          cluster(x, y, 1 + Math.floor(q.kind * 3), sc * 0.8, q.seed, alpha);
          const rot = q.seed * Math.PI;
          g.strokeStyle = `rgba(${C.orbit},${alpha * 0.45})`;
          g.beginPath();
          g.ellipse(x, y, 6.5 * sc, 2.4 * sc, rot, 0, TAU);
          g.stroke();
          const e = time * 1.8 + q.seed * 20;
          const ex = 6.5 * sc * Math.cos(e), ey = 2.4 * sc * Math.sin(e);
          dot(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot), 0.8 * sc, C.neutron, alpha);
        } else {
          // the first stars: twinkling, the brightest with a cross of light
          const c = C.stars[Math.floor(q.kind * 4) % 4];
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
        const a = 0.75 * (0.35 + 0.65 * (q.z + 1) / 2) * quiet(q.x, q.y);
        const sz = gx.size * (0.85 + 0.15 * q.z);
        const cg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz * 0.5);
        cg.addColorStop(0, `rgba(255,250,230,${a * 0.8})`);
        cg.addColorStop(1, `rgba(${gx.col},0)`);
        g.fillStyle = cg;
        g.fillRect(q.x - sz, q.y - sz, sz * 2, sz * 2);
        g.save();
        g.translate(q.x, q.y);
        g.rotate(gx.tilt);
        g.scale(1, 0.42);
        g.rotate(time * 0.06 * gx.spin);
        g.fillStyle = `rgba(${gx.col},${a * 0.7})`;
        for (const sp of spiral) {
          g.beginPath();
          g.arc(sp.x * sz, sp.y * sz, sp.r * D, 0, TAU);
          g.fill();
        }
        g.restore();
      }

      // the singularity, breathing, with its rays; now and then it swells
      const beat = (time % 16) / 16;
      const swell = beat < 0.12 ? Math.sin((beat / 0.12) * Math.PI) * 0.35 : 0;
      const pulse = 0.88 + 0.12 * Math.sin(time * 1.3) + swell;
      const G = R * 0.26 * pulse;
      const reach = G * 2.4;
      const rg = g.createRadialGradient(left, cy, 0, left, cy, reach);
      rg.addColorStop(0, "rgba(255,255,240,0.55)");
      rg.addColorStop(0.3, "rgba(255,190,110,0.22)");
      rg.addColorStop(1, "rgba(255,90,30,0)");
      g.fillStyle = rg;
      g.beginPath();
      const rays = 40;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + time * 0.025 + Math.sin(i * 7.3) * 0.05;
        const len = reach * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.6 + i * 2.39)) * (0.5 + 0.5 * Math.abs(Math.sin(i * 12.9))));
        const w = 0.018 + 0.012 * Math.abs(Math.sin(i * 3.7));
        g.moveTo(left + Math.cos(a - w) * G * 0.15, cy + Math.sin(a - w) * G * 0.15);
        g.lineTo(left + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.lineTo(left + Math.cos(a + w) * G * 0.15, cy + Math.sin(a + w) * G * 0.15);
        g.closePath();
      }
      g.fill();
      // its heart: white-hot, with a thin flare across it
      g.globalAlpha = 1;
      const halo = g.createRadialGradient(left, cy, 0, left, cy, G);
      halo.addColorStop(0, "rgba(255,240,210,0.5)");
      halo.addColorStop(0.35, "rgba(255,150,60,0.16)");
      halo.addColorStop(1, "rgba(255,80,30,0)");
      g.fillStyle = halo;
      g.fillRect(left - G, cy - G, G * 2, G * 2);
      const core = R * 0.05 * pulse;
      const cg = g.createRadialGradient(left, cy, 0, left, cy, core);
      cg.addColorStop(0, "rgba(255,255,255,1)");
      cg.addColorStop(0.35, "rgba(255,248,225,0.9)");
      cg.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = cg;
      g.fillRect(left - core, cy - core, core * 2, core * 2);
      for (const [lx, ly] of [[G * 1.6, 1.2 * D], [1.2 * D, G * 0.9]]) {
        const fl = g.createRadialGradient(left, cy, 0, left, cy, Math.max(lx, ly));
        fl.addColorStop(0, "rgba(255,250,235,0.8)");
        fl.addColorStop(1, "rgba(255,200,140,0)");
        g.fillStyle = fl;
        g.fillRect(left - lx, cy - ly, lx * 2, ly * 2);
      }
      g.globalCompositeOperation = "source-over";
    };

    // time goes on only while the page is in view
    let raf = 0, last = 0, clock = 20;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 32) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      for (const q of grains) {
        q.u += (dt * q.v) / 42;
        if (q.u > 1) {
          q.u -= 1;
          q.a = rnd() * TAU;
          q.rho = Math.sqrt(rnd()) * 0.94;
        }
      }
      for (const f of flames) {
        f.u += (dt * f.v) / 9;
        if (f.u > 1) {
          f.u -= 1;
          f.a = rnd() * TAU;
          f.rho = rnd() * 0.8;
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

    return () => {
      stop();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="sky-genesis" aria-hidden>
      <canvas ref={spaceRef} className="sky-genesis-space" />
      <canvas ref={bangRef} className="sky-genesis-bang" />
    </div>
  );
}
