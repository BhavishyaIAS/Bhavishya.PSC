"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { render, type Scene, type View } from "./engine";
import { SCENES, sceneForPath, type SceneName } from "./scenes";

// A page can ask for a specific backdrop (see <SceneHint/>); otherwise the URL decides.
let override: SceneName | null = null;
const listeners = new Set<() => void>();
export function setSceneOverride(name: SceneName | null) {
  override = name;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

const SLOTS = ["--fx-0", "--fx-1", "--fx-2", "--fx-3", "--fx-4", "--fx-5", "--fx-6", "--fx-shadow", "--fx-light"];

function readPalette(): number[][] {
  const css = getComputedStyle(document.documentElement);
  return SLOTS.map((name) => {
    const hex = css.getPropertyValue(name).trim().replace("#", "");
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
    return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
}

/** The fixed 3D canvas behind every page. Pauses when the tab is hidden; a still frame when motion is off. */
export function Backdrop() {
  const pathname = usePathname();
  const hinted = useSyncExternalStore(subscribe, () => override, () => null);
  const name = hinted ?? sceneForPath(pathname);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wanted = useRef<SceneName>(name);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    wanted.current = name;
    kick.current();
  }, [name]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    let shown: SceneName = wanted.current;
    let scene: Scene = SCENES[shown]();
    let fade = 0, raf = 0, last = 0, w = 0, h = 0, px = 0, py = 0, tx = 0, ty = 0;
    let palette = readPalette();
    let stage: HTMLElement | null = null, looked = -1e9;
    const font = getComputedStyle(document.body).fontFamily;
    const still = () => reduced.matches || root.dataset.motion === "off";

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** Draws one frame; returns false when the scene is off-screen and there is nothing to animate. */
    const draw = (now: number): boolean => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const frozen = still();
      if (wanted.current !== shown) {
        fade = frozen ? 0 : fade - dt * 4;
        if (fade <= 0) {
          shown = wanted.current;
          scene = SCENES[shown]();
          fade = 0;
        }
      } else fade = frozen ? 1 : Math.min(1, fade + dt * 2.2);
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;
      // A page marks where its scene belongs with [data-stage]; otherwise it sits top-right like an emblem.
      if (!stage?.isConnected || now - looked > 400) {
        stage = document.querySelector<HTMLElement>("[data-stage]");
        looked = now;
      }
      const wide = w >= 900;
      const box = stage?.getBoundingClientRect();
      const placed = box && box.width > 40 && box.height > 40;
      const scroll = window.scrollY;
      const view: View = {
        w,
        h,
        cx: placed ? box.left + box.width / 2 : w - (wide ? 170 : 74),
        cy: placed ? box.top + box.height / 2 : (wide ? 190 : 150) - scroll,
        unit: placed ? Math.min(box.width / 3.5, box.height / 2.45) : wide ? 60 : 30,
        px: frozen ? 0 : px,
        py: frozen ? 0 : py,
        alpha: fade * (placed || wide ? 1 : 0.6),
        palette,
        font,
      };
      // Scrolled out of view (the reader is deep in the notes): clear once and rest.
      const reach = view.unit * 2.6;
      if (view.cy < -reach || view.cy > h + reach) {
        if (wanted.current !== shown) {
          shown = wanted.current;
          scene = SCENES[shown]();
        }
        ctx.clearRect(0, 0, w, h);
        return false;
      }
      render(ctx, scene, frozen ? 6 : now / 1000, view);
      return true;
    };

    let skip = false;
    const loop = (now: number) => {
      // Phones draw every other frame (30 fps) — smooth enough, and half the work.
      skip = !skip && w < 900;
      const visible = skip ? true : draw(now);
      raf = visible && !still() && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    kick.current = start;

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
    };
    const onResize = () => (resize(), start());
    const observer = new MutationObserver(() => {
      palette = readPalette();
      start();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", start, { passive: true });
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener("change", start);
    resize();
    start();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", start);
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvas} className="backdrop" aria-hidden />;
}
