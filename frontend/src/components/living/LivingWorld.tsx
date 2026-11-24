"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { World } from "./engine";
import { sceneForPath } from "./scenes";
import { setAmbienceScene } from "./sound";

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";

/**
 * The Living Universe behind every page. One canvas, at most ~30 frames a second, paused while the tab is hidden;
 * with reduced motion (or Animations: off) it is a still picture, redrawn now and then as the light changes.
 */
export function LivingWorld() {
  const ref = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const w = new World(ref.current!, sceneForPath(location.pathname));
    world.current = w;
    (window as unknown as { __livingWorld?: World }).__livingWorld = w; // for looking closely (tests, the console)
    const theme = () => {
      w.dark = root.dataset.theme === "dark";
      w.clock();
    };
    theme();
    const themeObs = new MutationObserver(theme);
    themeObs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const clock = window.setInterval(() => w.clock(), 30_000);

    let raf = 0, last = performance.now(), acc = 0, lastStill = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (still()) {
        if (now - lastStill > 4000) {
          lastStill = now;
          w.step(0.016);
          w.draw();
        }
        return;
      }
      acc += dt;
      if (acc < 1 / 30) return;
      w.step(Math.min(acc, 0.1));
      w.draw();
      acc = 0;
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => w.resize();
    const onClick = (e: PointerEvent) => w.touch(e.clientX, e.clientY);
    const onMove = (e: PointerEvent) => w.move(e.clientX, e.clientY);
    let lastY = scrollY;
    const onScroll = () => {
      w.scroll(scrollY - lastY);
      lastY = scrollY;
    };
    addEventListener("resize", onResize);
    addEventListener("pointerdown", onClick, { passive: true });
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(clock);
      themeObs.disconnect();
      removeEventListener("resize", onResize);
      removeEventListener("pointerdown", onClick);
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  // each page is a stage of the journey: the world transforms into the next, it never cuts
  useEffect(() => {
    const s = sceneForPath(pathname);
    document.documentElement.dataset.scene = s;
    world.current?.setScene(s);
    setAmbienceScene(s);
  }, [pathname]);

  return <canvas ref={ref} className="living-world" aria-hidden />;
}
