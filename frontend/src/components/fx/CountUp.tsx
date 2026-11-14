"use client";

import { useEffect, useState } from "react";

/** A number that counts up to its value when it appears (shows the final value at once if motion is off). */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [shown, setShown] = useState(to);
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
    if (still || to === 0) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / 900);
      setShown(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
