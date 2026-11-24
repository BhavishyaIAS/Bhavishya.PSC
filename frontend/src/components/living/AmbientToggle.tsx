"use client";

import { useEffect, useState } from "react";

import { startAmbience, stopAmbience } from "./sound";

const KEY = "living-sound";

/** Sound is off unless asked for. Once asked, it comes back with the visitor's first touch on later visits. */
export function AmbientToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem(KEY) === "on";
    } catch {}
    if (!wanted) return;
    const begin = () => {
      startAmbience();
      setOn(true);
    };
    window.addEventListener("pointerdown", begin, { once: true });
    return () => window.removeEventListener("pointerdown", begin);
  }, []);

  return (
    <button
      type="button"
      className="ambient-toggle"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        if (next) startAmbience();
        else stopAmbience();
        try {
          localStorage.setItem(KEY, next ? "on" : "off");
        } catch {}
      }}
    >
      {on ? "Sound: on" : "Sound: off"}
    </button>
  );
}
