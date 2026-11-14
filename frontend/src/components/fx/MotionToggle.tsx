"use client";

import { Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => obs.disconnect();
}

/** Lets a reader switch the animations off (and back on); remembered on this device. */
export function MotionToggle() {
  const off = useSyncExternalStore(subscribe, () => document.documentElement.dataset.motion === "off", () => false);
  return (
    <button
      type="button"
      className="motion-toggle"
      aria-pressed={!off}
      onClick={() => {
        const next = off ? "on" : "off";
        document.documentElement.dataset.motion = next;
        try {
          localStorage.setItem("motion", next);
        } catch {}
      }}
    >
      <Sparkles size={14} aria-hidden /> Animations: {off ? "off" : "on"}
    </button>
  );
}
