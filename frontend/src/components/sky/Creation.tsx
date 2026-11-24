"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { COSMOS_SEEN, COSMOS_SESSION } from "./cosmos-boot";

/**
 * The Sky look's home page: from a singularity to Bhavishya IAS, then a universe that keeps evolving behind it.
 *
 * One 2D canvas, behind the page, does both: the opening sequence (cosmos-boot.ts decides whether it plays) and,
 * after it, the slow evolution in the background: nebulae drifting, dust gathering, galaxies turning, now and then
 * a star being born. The sequence:
 *   1 singularity   a point of warm light in the dark, and a moment of silence
 *   2 first light   a halo, fine particles, slow rings of light; nothing flashes
 *   3 the cosmos    nebulae, dust, star clusters and distant galaxies gather; the colours of the Sky look
 *   4 order         the scene settles towards the home page's own sky
 *   5 the name      part of the dust gathers into the letters of the page's own heading, in champagne gold, and
 *                   hands over to the crisp heading (the particles dissolve: nothing stays over the letters)
 *   6 possibilities the view eases back, the page appears, the examinations' portals rise one by one
 * Skip at any moment (the button, or Esc); a returning visitor sees the short version, and within a tab it does not
 * play again. Reduced motion: a still sky and a short fade. Sound is optional, off until asked for.
 */

type Mode = "full" | "short" | "still" | "none";

/** When each part begins (seconds). */
const TIMES = {
  full: { light: 1.7, cosmos: 4.4, order: 8.6, gather: 9.2, land: 12.4, end: 15.2 },
  short: { light: 0.25, cosmos: 0.9, order: 1.6, gather: 1.3, land: 3.3, end: 5.0 },
} as const;
type Times = (typeof TIMES)["full"] | (typeof TIMES)["short"];

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** The two palettes: luminous on the night sky, soft ink on the day sky. */
const PALETTES = {
  night: {
    blend: "lighter" as GlobalCompositeOperation,
    nebula: ["#2a2668", "#16245a", "#5b47a0", "#4f6fae", "#3b2f7a", "#1c2c66", "#b8955c"],
    dust: ["#f6efe0", "#f1dcab", "#9fb6e0", "#b9a2e6"],
    galaxy: ["#f6efe0", "#f1dcab", "#a9bce6", "#c6b2ee"],
    level: { nebula: 0.62, dust: 0.55, galaxy: 0.6, cluster: 0.7 },
  },
  day: {
    blend: "source-over" as GlobalCompositeOperation,
    nebula: ["#8f7fe0", "#7c96e0", "#b39ae8", "#9db4ea", "#e2c48a", "#a898e4"],
    dust: ["#3a2f8a", "#6b55b8", "#a07a3a", "#4b62a8"],
    galaxy: ["#4a3c9a", "#8a6a2a", "#5a72b0", "#7a5cc0"],
    level: { nebula: 0.26, dust: 0.38, galaxy: 0.38, cluster: 0.45 },
  },
};
type Palette = (typeof PALETTES)["night"];

/** A soft round glow, drawn once and stamped many times. */
function glowSprite(color: string, size: number, core = 0.18) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(core, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.globalAlpha = 1;
  g.fillRect(0, 0, size, size);
  return c;
}

/** The first light's halo: bright at the heart, falling away softly, with no edge. */
function haloSprite() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,240,206,1)");
  grad.addColorStop(0.06, "rgba(250,228,186,0.7)");
  grad.addColorStop(0.2, "rgba(214,196,214,0.26)");
  grad.addColorStop(0.45, "rgba(150,150,210,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A soft cloud of gas: overlapping glows strung along a gentle curve, so it reads as a drifting filament. */
function nebulaSprite(colors: string[], rnd: () => number) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const bend = (rnd() - 0.5) * 0.5;
  for (let k = 0; k < 9; k++) {
    const col = colors[Math.floor(rnd() * colors.length)];
    const f = k / 8;
    const x = size * (0.18 + f * 0.64), y = size * (0.5 + Math.sin(f * Math.PI) * bend + (rnd() - 0.5) * 0.12), r = size * (0.12 + rnd() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, col);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.22 + rnd() * 0.25;
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

/** A distant spiral galaxy: a bright core and two arms of tiny stars. */
function galaxySprite(colors: string[], rnd: () => number) {
  const size = 220;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r0 = size / 2;
  const core = g.createRadialGradient(r0, r0, 0, r0, r0, size * 0.16);
  core.addColorStop(0, colors[0]);
  core.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const arm = i % 2, f = rnd();
    const a = f * 3.4 + arm * Math.PI + (rnd() - 0.5) * 0.5;
    const d = 6 + f * size * 0.42 + (rnd() - 0.5) * 8;
    const x = r0 + Math.cos(a) * d, y = r0 + Math.sin(a) * d;
    g.globalAlpha = (1 - f) * 0.7 * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[1 + Math.floor(rnd() * (colors.length - 1))];
    const s = 0.6 + rnd() * 1.1;
    g.fillRect(x, y, s, s);
  }
  return c;
}

/** Where the page's own heading puts each letter: points inside its glyphs, in viewport pixels. */
function letterPoints(h1: HTMLElement, max: number, step: number, rnd: () => number) {
  const W = innerWidth, H = innerHeight;
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const g = off.getContext("2d", { willReadFrequently: true })!;
  const cs = getComputedStyle(h1);
  g.font = `${cs.fontStyle} ${cs.fontVariantCaps === "small-caps" ? "small-caps " : ""}${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if (cs.letterSpacing && cs.letterSpacing !== "normal") (g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
  g.fillStyle = "#fff";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const upper = cs.textTransform === "uppercase";
  const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (const m of node.data.matchAll(/\S+/g)) {
      range.setStart(node, m.index!);
      range.setEnd(node, m.index! + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      const word = upper ? m[0].toUpperCase() : m[0];
      const mm = g.measureText(word);
      const a = mm.fontBoundingBoxAscent || mm.actualBoundingBoxAscent, d = mm.fontBoundingBoxDescent || mm.actualBoundingBoxDescent;
      g.fillText(word, r.left, r.top + (a * r.height) / Math.max(1, a + d));
    }
  }
  const data = g.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 140) pts.push(x + (rnd() - 0.5) * step * 0.6, y + (rnd() - 0.5) * step * 0.6);
  // an even sample of what is there
  const n = pts.length / 2, out: [number, number][] = [];
  if (!n) return out;
  for (let i = 0; i < max; i++) {
    const k = Math.floor((i * n) / max + rnd() * (n / max)) % n;
    out.push([pts[k * 2], pts[k * 2 + 1]]);
  }
  return out;
}

/** A low, slow, consonant hum: two sines a fifth apart and a soft octave, filtered; it fades in and out. */
function startHum() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain();
  master.gain.value = 0;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  lp.connect(master).connect(ac.destination);
  const oscs = [
    [55, "sine", 0.5],
    [82.4, "sine", 0.32],
    [110.3, "triangle", 0.14],
    [164.8, "sine", 0.06],
  ].map(([f, type, v]) => {
    const o = ac.createOscillator();
    o.type = type as OscillatorType;
    o.frequency.value = f as number;
    const g = ac.createGain();
    g.gain.value = v as number;
    o.connect(g).connect(lp);
    o.start();
    return o;
  });
  // a slow breathing
  const lfo = ac.createOscillator(), lfoGain = ac.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
  master.gain.linearRampToValueAtTime(0.05, ac.currentTime + 3);
  return {
    stop(after = 2.5) {
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + after);
      window.setTimeout(() => {
        oscs.forEach((o) => o.stop());
        lfo.stop();
        ac.close();
      }, after * 1000 + 200);
    },
  };
}

const noop = () => () => {};

export function CreationCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<() => void>(() => {});
  const humRef = useRef<ReturnType<typeof startHum>>(null);
  // in the browser only (the canvas and the controls live in <body>, outside the page)
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // the controls show while the opening plays: cosmos-boot.ts has already said whether it does
  const [playing, setPlaying] = useState(
    () => typeof document !== "undefined" && ["full", "short"].includes(document.documentElement.dataset.intro ?? ""),
  );
  const [sound, setSound] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = document.documentElement;
    const ctx = canvas.getContext("2d")!;
    const initial = root.dataset.intro as Mode | undefined;
    const mode: Mode = initial === "full" || initial === "short" || initial === "still" ? initial : "none";
    const T: Times | null = mode === "full" || mode === "short" ? TIMES[mode] : null;
    const stillNow = () => matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.motion === "off";

    let seed = 20261124;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // ── the world, sized to the screen ──
    let W = 0, H = 0, D = 1, phone = false;
    let N = 0, LN = 0;
    let px = new Float32Array(0), py = px, vx = px, vy = px, ps = px, pa = px, pc = new Uint8Array(0);
    let sx0 = px, sy0 = px, tx = px, ty = px, delay = px;
    let targets = false;
    const sprites = { night: { dust: [] as HTMLCanvasElement[], neb: [] as HTMLCanvasElement[], gal: [] as HTMLCanvasElement[] }, day: { dust: [] as HTMLCanvasElement[], neb: [] as HTMLCanvasElement[], gal: [] as HTMLCanvasElement[] } };
    const gold = glowSprite("rgba(238,208,142,1)", 20, 0.28);
    const core = glowSprite("rgba(255,244,214,1)", 128, 0.06);
    const halo = haloSprite();
    for (const key of ["night", "day"] as const) {
      const p = PALETTES[key];
      sprites[key].dust = p.dust.map((c) => glowSprite(c, 16, 0.25));
      sprites[key].neb = Array.from({ length: 10 }, () => nebulaSprite(p.nebula, rnd));
      sprites[key].gal = [0, 1, 2].map(() => galaxySprite(p.galaxy, rnd));
    }
    // the scene's furniture, in fractions of the screen
    // filaments spread over the whole sky, none sitting on the centre
    const nebulae = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * TAU + rnd() * 0.5, d = 0.18 + rnd() * 0.34;
      return { x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d * 0.9, r: 0.16 + rnd() * 0.16, sx: 1.5 + rnd() * 1.2, ang: rnd() * Math.PI, ph: rnd() * TAU, sp: 0.02 + rnd() * 0.03, k: i };
    });
    const galaxies = Array.from({ length: 3 }, (_, i) => ({ x: [0.16, 0.84, 0.7][i] + (rnd() - 0.5) * 0.06, y: [0.26, 0.2, 0.82][i] + (rnd() - 0.5) * 0.06, s: [90, 70, 56][i], rot: rnd() * TAU, sp: (rnd() < 0.5 ? -1 : 1) * (0.012 + rnd() * 0.01), tilt: 0.35 + rnd() * 0.4, k: i }));
    const clusters = Array.from({ length: 5 }, () => {
      const cx = 0.08 + rnd() * 0.84, cy = 0.08 + rnd() * 0.84;
      return Array.from({ length: 26 }, () => ({ x: cx + (rnd() - 0.5) * 0.05 * (rnd() + 0.4), y: cy + (rnd() - 0.5) * 0.05 * (rnd() + 0.4), b: 0.3 + rnd() * 0.7, ph: rnd() * TAU }));
    });
    let births: { x: number; y: number; t0: number }[] = [];
    let nextBirth = 2;

    const resize = () => {
      W = innerWidth;
      H = innerHeight;
      phone = W < 640;
      D = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
      canvas.width = Math.round(W * D);
      canvas.height = Math.round(H * D);
      const n = phone ? 700 : W < 1100 ? 1400 : 2200;
      if (n !== N) {
        N = n;
        LN = phone ? 460 : W < 1100 ? 900 : 1500;
        px = new Float32Array(N); py = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
        ps = new Float32Array(N); pa = new Float32Array(N); pc = new Uint8Array(N);
        sx0 = new Float32Array(N); sy0 = new Float32Array(N); tx = new Float32Array(N); ty = new Float32Array(N); delay = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          // born together at the centre, flung outwards at every speed
          // most flung far, a fifth drifting out slowly, so the centre never empties
          const a = rnd() * TAU, sp = (rnd() < 0.2 ? 0.05 + rnd() * 0.35 : 0.45 + rnd() ** 1.3 * 1.5) * Math.max(W, H) * 0.24;
          px[i] = W / 2; py[i] = H / 2;
          vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp;
          ps[i] = 0.5 + rnd() ** 2 * 2.2;
          pa[i] = 0.35 + rnd() * 0.65;
          pc[i] = Math.floor(rnd() * 4);
          delay[i] = rnd();
        }
        if (!T) {
          // no opening: the dust is already spread over the sky
          for (let i = 0; i < N; i++) { px[i] = rnd() * W; py[i] = rnd() * H; vx[i] = vy[i] = 0; }
        }
        targets = false;
      }
    };
    resize();

    const night = () => root.dataset.theme !== "light";

    // ── one frame ──
    let t = 0; // seconds since the start
    let skipped = false;
    let phase: "play" | "reveal" | "ambient" = T ? "play" : "ambient";
    const startAt = performance.now();
    let last = startAt, lastDraw = 0, raf = 0, stopped = false;

    const flowAngle = (x: number, y: number, time: number) =>
      Math.sin(x * 0.0021 + time * 0.05) * 2.1 + Math.cos(y * 0.0017 - time * 0.04) * 2.1 + Math.sin((x + y) * 0.0009 + time * 0.03);

    const drawScene = (pal: Palette, set: (typeof sprites)["night"], level: number, cam: number, time: number) => {
      if (level <= 0.002) return;
      ctx.globalCompositeOperation = pal.blend;
      const cx = W / 2, cy = H / 2, M = Math.max(W, H);
      const at = (fx: number, fy: number): [number, number] => [cx + (fx * W - cx) * cam, cy + (fy * H - cy) * cam];
      // nebulae: drifting and breathing
      for (const n of nebulae) {
        const [x, y] = at(n.x + Math.sin(time * n.sp + n.ph) * 0.03, n.y + Math.cos(time * n.sp * 0.8 + n.ph) * 0.025);
        const r = n.r * M * cam * (1 + Math.sin(time * 0.05 + n.ph) * 0.06);
        if (phone && n.k % 2) continue; // half the filaments on a phone
        ctx.globalAlpha = pal.level.nebula * level * (0.75 + 0.25 * Math.sin(time * 0.07 + n.ph));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(n.ang + Math.sin(time * 0.01 + n.ph) * 0.15);
        ctx.scale(n.sx, 1);
        ctx.drawImage(set.neb[n.k], -r, -r, r * 2, r * 2);
        ctx.restore();
      }
      // star clusters, twinkling
      ctx.fillStyle = pal === PALETTES.night ? "#f6efe0" : "#3a2f8a";
      for (const cl of clusters)
        for (const s of cl) {
          const [x, y] = at(s.x, s.y);
          ctx.globalAlpha = pal.level.cluster * level * s.b * (0.6 + 0.4 * Math.sin(time * 1.3 + s.ph));
          const z = s.b > 0.85 ? 1.6 : 1;
          ctx.fillRect(x, y, z, z);
        }
      // distant galaxies, turning slowly
      for (const g of galaxies) {
        const [x, y] = at(g.x, g.y);
        const s = (phone ? 0.65 : 1) * g.s * cam;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.5 + g.k);
        ctx.scale(1, g.tilt);
        ctx.rotate(g.rot + time * g.sp);
        ctx.globalAlpha = pal.level.galaxy * level;
        ctx.drawImage(set.gal[g.k], -s, -s, s * 2, s * 2);
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // in the background, half the frames are plenty
      if (phase === "ambient" && now - lastDraw < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      draw(dt);
      raf = requestAnimationFrame(frame);
    };

    const draw = (dt: number) => {
      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      const isNight = night();
      const end = T ? T.end : 0;

      // ── the dark of the opening: opaque until the page appears, then gone ──
      let bg = 0;
      if (T && phase !== "ambient") bg = 1 - smooth(ramp(t, T.land, T.land + 1.8));
      if (bg > 0) {
        const deep = T ? smooth(ramp(t, T.cosmos - 1, T.order)) : 1;
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, `rgb(${Math.round(6 + 14 * deep)},${Math.round(4 + 10 * deep)},${Math.round(12 + 34 * deep)})`);
        g.addColorStop(1, `rgb(${Math.round(2 + 4 * deep)},${Math.round(1 + 3 * deep)},${Math.round(6 + 14 * deep)})`);
        ctx.globalAlpha = bg;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // ── the cosmos: forming during the opening, then the evolving background ──
      const time = t;
      const form = T ? smooth(ramp(t, T.cosmos, T.order + 0.6)) : 1;
      const cam = T ? 1.16 - 0.16 * easeInOut(ramp(t, T.cosmos, end)) : 1;
      // the opening is drawn in the night's colours; on a day sky they give way to the day's as the page appears
      const toDay = !isNight && T ? smooth(ramp(t, T.land, end)) : isNight ? 0 : 1;
      const ambient = T ? 1 - 0.35 * smooth(ramp(t, T.land, end)) : 0.65; // calmer once the page is there
      drawScene(PALETTES.night, sprites.night, form * ambient * (1 - toDay) * (isNight || bg > 0 ? 1 : 1), cam, time);
      if (!isNight) drawScene(PALETTES.day, sprites.day, form * ambient * toDay, cam, time);

      // ── stages 1–2: the singularity and the first light ──
      if (T && phase !== "ambient") {
        ctx.globalCompositeOperation = "lighter";
        const cx = W / 2, cy = H / 2, M = Math.max(W, H);
        const fade = 1 - smooth(ramp(t, T.cosmos + (T === TIMES.full ? 1.2 : 0.2), T.order + 0.4));
        // the point
        const pt = smooth(ramp(t, 0.15, T.light)) * fade;
        if (pt > 0) {
          const r = 1.2 + 2.2 * smooth(ramp(t, T.light - 0.4, T.light + 1.2));
          ctx.globalAlpha = pt;
          ctx.drawImage(core, cx - r * 6, cy - r * 6, r * 12, r * 12);
        }
        // the halo
        const h = ramp(t, T.light, T.cosmos + 1.5);
        if (h > 0) {
          const r = 6 + smooth(h) * M * 0.32;
          ctx.globalAlpha = (0.7 * Math.sin(Math.min(1, h * 1.4) * Math.PI * 0.5) * (1 - 0.55 * h)) * fade;
          ctx.drawImage(halo, cx - r, cy - r, r * 2, r * 2);
        }
        // slow rings of light
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const s0 = T.light + k * (T === TIMES.full ? 0.95 : 0.25);
          const p = ramp(t, s0, s0 + (T === TIMES.full ? 3.4 : 1.2));
          if (p <= 0 || p >= 1) continue;
          ctx.globalAlpha = 0.16 * (1 - p) * Math.min(1, p * 6);
          ctx.strokeStyle = k === 1 ? "#cfd8f4" : "#f1dcab";
          ctx.beginPath();
          ctx.arc(cx, cy, 8 + easeInOut(p) * M * 0.62, 0, TAU);
          ctx.stroke();
        }
      }

      // ── the dust: flung out, drifting with the flow; part of it becomes the name ──
      const set = isNight || (T && toDay < 0.5 && bg > 0.2) ? sprites.night : sprites.day;
      const dustNightish = set === sprites.night;
      ctx.globalCompositeOperation = dustNightish ? "lighter" : "source-over";
      const born = T ? smooth(ramp(t, T.light, T.light + 0.8)) : 1;
      const drag = Math.exp(-dt * (T && t < T.cosmos ? 0.9 : 1.6));
      if (T && !targets && t >= T.gather - 0.4 && phase === "play" && !skipped) {
        // the page's own heading decides where the letters are
        const h1 = document.querySelector<HTMLElement>(".sky-hero h1");
        const pts = h1 ? letterPoints(h1, LN, 2, rnd) : [];
        for (let i = 0; i < LN; i++) {
          const p = pts[i];
          if (p) { tx[i] = p[0]; ty[i] = p[1]; } else { tx[i] = NaN; }
          sx0[i] = NaN; // where it sets out from: taken on its first frame of gathering
        }
        targets = true;
      }
      const lvl = isNight ? PALETTES.night.level.dust : PALETTES.day.level.dust;
      for (let i = 0; i < N; i++) {
        const letter = T && i < LN && targets && !Number.isNaN(tx[i]) && !skipped;
        if (letter && t >= T.gather) {
          // gathering into a letter: from where it was to its place in the glyph
          const st = T.gather + delay[i] * (T === TIMES.full ? 1.3 : 0.5);
          const dur = T === TIMES.full ? 1.75 : 1.05;
          const k = ramp(t, st, st + dur);
          if (k <= 0 || Number.isNaN(sx0[i])) {
            sx0[i] = px[i];
            sy0[i] = py[i];
          }
          if (k > 0) {
            const e = easeInOut(k);
            // a gentle curve on the way in
            const bend = Math.sin(k * Math.PI) * 26 * (delay[i] - 0.5);
            px[i] = sx0[i] + (tx[i] - sx0[i]) * e + bend;
            py[i] = sy0[i] + (ty[i] - sy0[i]) * e - bend * 0.6;
          }
          const settle = ramp(t, T.land, T.land + 1.2); // the crisp heading takes over
          const a = (0.4 + 0.3 * k) * (1 - smooth(settle));
          if (a > 0.01) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = a;
            const s = 1.7 + (1 - k) * 1.6;
            ctx.drawImage(gold, px[i] - s, py[i] - s, s * 2, s * 2);
            ctx.globalCompositeOperation = dustNightish ? "lighter" : "source-over";
          }
          continue;
        }
        // free dust
        const ang = flowAngle(px[i], py[i], time);
        const fl = T && t < T.cosmos ? 0.2 : 1;
        vx[i] = vx[i] * drag + Math.cos(ang) * 9 * fl * dt;
        vy[i] = vy[i] * drag + Math.sin(ang) * 9 * fl * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        // the sky wraps round, softly
        if (px[i] < -20) px[i] += W + 40; else if (px[i] > W + 20) px[i] -= W + 40;
        if (py[i] < -20) py[i] += H + 40; else if (py[i] > H + 20) py[i] -= H + 40;
        if (phase === "ambient" && i % 3 !== 0) continue; // in the background, a third of the dust is enough
        let a = pa[i] * born * (T ? 1 - 0.45 * smooth(ramp(t, T.land, end)) : 0.55);
        if (T && phase !== "ambient") a *= 0.55 + 0.45 * (1 - smooth(ramp(t, T.cosmos, T.order)) * 0.5);
        a *= dustNightish ? 1 : lvl / 0.55;
        if (a < 0.02) continue;
        ctx.globalAlpha = Math.min(1, a);
        const s = dustNightish ? ps[i] * 2.2 : 0.9 + ps[i] * 0.5; // on the day sky: fine grains, never smudges
        ctx.drawImage(set.dust[pc[i]], px[i] - s, py[i] - s, s * 2, s * 2);
      }

      // ── now and then, a star is born: it brightens, then rests ──
      if (phase === "ambient" || (T && t > T.order)) {
        if (time > nextBirth) {
          births.push({ x: 0.08 + rnd() * 0.84, y: 0.08 + rnd() * 0.84, t0: time });
          nextBirth = time + 3 + rnd() * 5;
        }
        births = births.filter((b) => time - b.t0 < 11);
        ctx.globalCompositeOperation = isNight ? "lighter" : "source-over";
        for (const b of births) {
          const age = time - b.t0;
          const a = age < 4 ? smooth(age / 4) : 1 - smooth((age - 4) / 7);
          const r = 3 + smooth(Math.min(1, age / 4)) * 9;
          ctx.globalAlpha = a * (isNight ? 0.7 : 0.35);
          ctx.drawImage(isNight ? core : sprites.day.dust[0], b.x * W - r, b.y * H - r, r * 2, r * 2);
        }
      }

      // ── the timeline ──
      if (T && phase === "play" && t >= T.land) reveal();
      if (T && phase === "reveal" && t >= end) finish();
    };

    // ── the page appears: the name hands over to the heading, the portals rise ──
    const reveal = () => {
      if (phase !== "play") return;
      phase = "reveal";
      root.dataset.intro = "reveal";
      root.dataset.introName = "on";
      setPlaying(false);
      // seen (or skipped): next time the short version, and not again in this tab
      try {
        localStorage.setItem(COSMOS_SEEN, "1");
        sessionStorage.setItem(COSMOS_SESSION, "1");
      } catch {}
    };
    const finish = () => {
      if (phase === "ambient") return;
      phase = "ambient";
      // the reveal's animations have run their course: let the page be itself
      window.setTimeout(() => {
        delete root.dataset.intro;
        delete root.dataset.introName;
      }, 200);
      humRef.current?.stop(3);
      humRef.current = null;
      if (stillNow()) stop(true);
    };
    skipRef.current = () => {
      if (!T || phase !== "play") return;
      skipped = true;
      t = Math.max(t, T.land); // straight to the page appearing; the letters are not drawn
      for (let i = 0; i < N; i++) if (t < T.cosmos) { px[i] = rnd() * W; py[i] = rnd() * H; vx[i] = vy[i] = 0; }
      humRef.current?.stop(1);
      humRef.current = null;
      reveal();
    };

    const stop = (drawStill: boolean) => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (drawStill) {
        phase = "ambient";
        draw(0);
      }
    };
    const start = () => {
      if (!stopped) return;
      stopped = false;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    // ── begin ──
    if (mode === "still") {
      // reduced motion: a still sky, the page fades in (CSS), nothing moves
      phase = "ambient";
      for (let i = 0; i < N; i++) { px[i] = rnd() * W; py[i] = rnd() * H; vx[i] = vy[i] = 0; }
      t = 40;
      draw(0);
      stopped = true;
      try { sessionStorage.setItem(COSMOS_SESSION, "1"); } catch {}
      window.setTimeout(() => delete root.dataset.intro, 900);
    } else if (stillNow()) {
      phase = "ambient";
      t = 40;
      draw(0);
      stopped = true;
    } else {
      if (T) window.scrollTo(0, 0);
      raf = requestAnimationFrame(frame);
    }

    // ── keep in step with the screen, the tab, the theme and the motion setting ──
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const keep = phase !== "play";
        resize();
        if (keep) for (let i = 0; i < N; i++) if (!Number.isFinite(px[i]) || px[i] > W + 40 || py[i] > H + 40) { px[i] = rnd() * W; py[i] = rnd() * H; }
        if (stopped) draw(0);
      }, 150);
    };
    const onVisible = () => {
      if (document.hidden) {
        if (phase === "ambient") stop(false);
      } else if (phase === "ambient" && !stillNow()) start();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipRef.current();
    };
    const watch = new MutationObserver(() => {
      if (phase !== "ambient") return;
      if (stillNow()) stop(true);
      else if (stopped) start();
      else draw(0);
    });
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("keydown", onKey);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      watch.disconnect();
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("keydown", onKey);
      window.clearTimeout(resizeTimer);
      humRef.current?.stop(0.5);
      humRef.current = null;
      // leaving the page mid-sequence: never leave it hidden
      if (root.dataset.intro) {
        delete root.dataset.intro;
        delete root.dataset.introName;
        try { sessionStorage.setItem(COSMOS_SESSION, "1"); } catch {}
      }
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <>
      <canvas ref={canvasRef} className="cosmos" aria-hidden />
      {playing && (
        <div className="cosmos-controls" role="group" aria-label="Opening">
          <button
            type="button"
            className="cosmos-btn"
            aria-pressed={sound}
            onClick={() => {
              if (sound) {
                humRef.current?.stop(1);
                humRef.current = null;
              } else humRef.current = startHum();
              setSound(!sound);
            }}
          >
            Sound: {sound ? "on" : "off"}
          </button>
          <button type="button" className="cosmos-btn cosmos-skip" onClick={() => skipRef.current()}>
            Skip intro <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </>,
    document.body,
  );
}
