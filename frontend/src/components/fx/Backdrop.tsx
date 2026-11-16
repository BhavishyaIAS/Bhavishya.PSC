"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { drawCosmos } from "./cosmos";
import { render, type Scene, type View } from "./engine";
import { SCENES, sceneForPath, type SceneName } from "./scenes";
import { buildSky, hexToRgb, WORLDS } from "./worlds";

// A page can ask for a specific world (see <SceneHint/>); otherwise the URL decides.
let override: SceneName | null = null;
const listeners = new Set<() => void>();
export function setSceneOverride(name: SceneName | null) {
  override = name;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

// Travel between pages: Interactions calls depart() on a click and arrive() when the new page is in.
let warpTarget = 0;
let wake: () => void = () => {};
export function depart() {
  warpTarget = 1;
  wake();
}
export function arrive() {
  warpTarget = 0;
  wake();
}

const SLOTS = ["--fx-0", "--fx-1", "--fx-2", "--fx-3", "--fx-4", "--fx-5", "--fx-6", "--fx-shadow", "--fx-light"];

/**
 * The world behind the page, in layers:
 *   0. nebula light in this world's colours — painted on a tiny canvas that the browser
 *      stretches over the viewport (soft by nature, and nearly free to draw);
 *   1. the stars (cosmos.ts);
 *   2. a great figure of sacred geometry turning slowly in that sky (worlds.ts);
 *   3. the sculpture on the page's [data-stage] (scenes.ts).
 * Moving to another page shifts the light from one world's colours to the next while
 * the stars stretch into streaks. Deep in a page (scrolled past the stage) the sky
 * dims and holds still, so reading is calm and a phone's battery is spared.
 */
export function Backdrop() {
  const pathname = usePathname();
  const hinted = useSyncExternalStore(subscribe, () => override, () => null);
  const name = hinted ?? sceneForPath(pathname);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nebula = useRef<HTMLCanvasElement>(null);
  const wanted = useRef<SceneName>(name);

  useEffect(() => {
    wanted.current = name;
    wake();
  }, [name]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    const mist = nebula.current?.getContext("2d");
    if (!el || !ctx || !mist) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const isDark = () => root.dataset.theme === "dark";
    const still = () => reduced.matches || root.dataset.motion === "off";

    let shown: SceneName = wanted.current;
    let scene: Scene = SCENES[shown]();
    let sky: Scene = buildSky(WORLDS[shown].sky);
    let fade = 0, warp = 0, raf = 0, last = 0, w = 0, h = 0, px = 0, py = 0, tx = 0, ty = 0;
    let stage: HTMLElement | null = null, looked = -1e9, skip = false, lite = false;
    const font = getComputedStyle(document.body).fontFamily;
    let base: number[][] = [];
    let palette: number[][] = [];
    let light: number[][] = []; // the colours the sky is drifting towards
    const colors: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // …and where it is now
    let colorsReady = false;

    /** Materials and light for the world on show, in the current theme. */
    const enterWorld = () => {
      const world = WORLDS[shown], dark = isDark();
      palette = base.map((c) => [...c]);
      for (const [slot, hex] of Object.entries(world.materials?.[dark ? "dark" : "light"] ?? {})) palette[Number(slot)] = hexToRgb(hex);
      light = (dark ? world.dark : world.light).map(hexToRgb);
      if (!colorsReady) light.forEach((c, i) => (colors[i] = [...c]));
      colorsReady = true;
      mistDrawn = false;
    };
    /** Nebula light: four soft clouds on a 192×120 canvas. Redrawn only while the colours are changing. */
    let mistDrawn = false;
    const CLOUDS = [
      [0.84, 0.16, 0.52, 0],
      [0.1, 0.32, 0.46, 1],
      [0.5, 1.0, 0.6, 2],
      [0.98, 0.76, 0.34, 1],
    ];
    const paintMist = () => {
      const mw = mist.canvas.width, mh = mist.canvas.height, dark = isDark();
      mist.clearRect(0, 0, mw, mh);
      mist.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const [x, y, r, c] of CLOUDS) {
        const rgb = colors[c].map((v) => v | 0).join(","), radius = r * mw;
        const g = mist.createRadialGradient(x * mw, y * mh, 0, x * mw, y * mh, radius);
        g.addColorStop(0, `rgba(${rgb},${dark ? 0.34 : 0.42})`);
        g.addColorStop(0.45, `rgba(${rgb},${dark ? 0.13 : 0.16})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        mist.fillStyle = g;
        mist.fillRect(0, 0, mw, mh);
      }
      mistDrawn = true;
    };
    const readTheme = () => {
      const css = getComputedStyle(root);
      base = SLOTS.map((slot) => hexToRgb(css.getPropertyValue(slot)));
      enterWorld();
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, w < 900 ? 1.5 : 1.75);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** Draws one frame; returns false when nothing on screen is moving any more. */
    const draw = (now: number): boolean => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const frozen = still();
      if (wanted.current !== shown) {
        fade = frozen ? 0 : fade - dt * 4.5;
        if (fade <= 0) {
          shown = wanted.current;
          scene = SCENES[shown]();
          sky = buildSky(WORLDS[shown].sky);
          fade = 0;
          enterWorld();
        }
      } else fade = frozen ? 1 : Math.min(1, fade + dt * 2);

      // the light of one world flows into the next
      let shifting = false;
      for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3; k++) {
          const d = light[i][k] - colors[i][k];
          if (Math.abs(d) > 0.5) shifting = true;
          colors[i][k] += frozen ? d : d * Math.min(1, dt * 2.4);
        }
      if (shifting || !mistDrawn) paintMist();
      warp += ((frozen ? 0 : warpTarget) - warp) * Math.min(1, dt * (warpTarget ? 7 : 3.2));
      if (warp < 0.004) warp = 0;
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;

      // A page marks where its scene belongs with [data-stage]; otherwise it sits top-right like an emblem.
      if (!stage?.isConnected || now - looked > 400) {
        stage = document.querySelector<HTMLElement>("[data-stage]");
        looked = now;
      }
      const wide = w >= 900, dark = isDark();
      const box = stage?.getBoundingClientRect();
      const placed = box && box.width > 40 && box.height > 40;
      const scroll = window.scrollY;
      const depth = Math.min(1, scroll / 520); // 0 at the top of the page … 1 once the reader is into the content
      const t = frozen ? 6 : now / 1000;
      const view: View = {
        w,
        h,
        cx: placed ? box.left + box.width / 2 : w - (wide ? 170 : 74),
        cy: placed ? box.top + box.height / 2 : (wide ? 190 : 150) - scroll,
        unit: placed ? Math.min(box.width / 3.5, box.height / 2.45) : wide ? 60 : 30,
        px: frozen ? 0 : px,
        py: frozen ? 0 : py,
        alpha: fade * (placed || wide ? 1 : 0.6) * (1 - warp * 0.5),
        palette,
        font,
      };

      ctx.clearRect(0, 0, w, h);
      drawCosmos(ctx, w, h, t, {
        colors,
        star: dark ? [255, 244, 226] : [156, 120, 58],
        dark,
        px: view.px,
        py: view.py,
        alpha: (wide ? 1 : 0.8) * (1 - depth * 0.5),
        warp,
        lite,
      });
      const reach = view.unit * 2.6;
      const onScreen = view.cy > -reach && view.cy < h + reach;
      if (onScreen) {
        // the figure in the sky: larger than the sculpture, behind it, barely there
        const figure = Math.max(view.unit * 2.1, Math.min(w, h) * (wide ? 0.3 : 0.36));
        render(ctx, sky, t, { ...view, unit: figure, alpha: view.alpha * (dark ? 0.34 : 0.4) * (1 - depth * 0.6) });
        render(ctx, scene, t, view);
      }
      return onScreen || warp > 0 || shifting || wanted.current !== shown || fade < 1;
    };

    // If the device can't keep up (no graphics acceleration, an old phone), go "lite":
    // fewer stars, no paper grain, 30 frames a second. Smoothness matters more than detail.
    let slow = 0, before = 0;
    const loop = (now: number) => {
      // Phones (and lite mode) draw every other frame — smooth enough, and half the work.
      const halved = w < 900 || lite;
      skip = !skip && halved;
      const gap = now - before;
      before = now;
      if (!lite && gap < 250) {
        slow = gap > 27 ? slow + 1 : Math.max(0, slow - 2);
        if (slow > 70) {
          lite = true;
          root.dataset.lite = "on";
        }
      }
      const moving = skip ? true : draw(now);
      raf = moving && !still() && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    wake = start;

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
    };
    const onResize = () => (resize(), start());
    const observer = new MutationObserver(() => {
      readTheme();
      start();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", start, { passive: true });
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener("change", start);
    resize();
    readTheme();
    start();
    return () => {
      cancelAnimationFrame(raf);
      wake = () => {};
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", start);
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return (
    <>
      <canvas ref={nebula} className="nebula" width={192} height={120} aria-hidden />
      <canvas ref={canvas} className="backdrop" aria-hidden />
    </>
  );
}
