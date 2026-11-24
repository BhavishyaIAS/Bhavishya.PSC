"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function set(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

/** Day / Night, as a pair (the Sky style's colour switch; same saved choice as the classic one). */
export function SkyThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? "light", () => "light");
  return (
    <div className="sky-theme" role="group" aria-label="Colour mode">
      <button type="button" aria-pressed={theme === "light"} onClick={() => set("light")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <span>Day</span>
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => set("dark")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
        <span>Night</span>
      </button>
    </div>
  );
}
