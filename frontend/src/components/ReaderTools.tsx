"use client";

import { AArrowDown, AArrowUp, Maximize2, Minimize2, Type } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const ATTRS = ["data-reader-size", "data-reader-font", "data-focus"];
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}
const snapshot = () => ATTRS.map((a) => document.documentElement.getAttribute(a) ?? "").join("|");

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** Reading comfort: text size, a book-style serif, and a distraction-free focus mode. Remembered on this device. */
export function ReaderTools() {
  const [sizeRaw, font, focus] = useSyncExternalStore(subscribe, snapshot, () => "||").split("|");
  const size = Number(sizeRaw) || 2;
  const root = () => document.documentElement;
  const setSize = (n: number) => {
    const v = String(Math.max(1, Math.min(4, n)));
    root().setAttribute("data-reader-size", v);
    save("reader-size", v);
  };

  // Focus mode ends with Esc, and never follows the reader to another page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && root().removeAttribute("data-focus");
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root().removeAttribute("data-focus");
    };
  }, []);

  return (
    <div className="reader-tools" role="group" aria-label="Reading settings">
      <button type="button" onClick={() => setSize(size - 1)} disabled={size <= 1} aria-label="Smaller text" title="Smaller text">
        <AArrowDown size={17} aria-hidden />
      </button>
      <button type="button" onClick={() => setSize(size + 1)} disabled={size >= 4} aria-label="Larger text" title="Larger text">
        <AArrowUp size={17} aria-hidden />
      </button>
      <button
        type="button"
        aria-pressed={font === "serif"}
        title="Book-style font"
        onClick={() => {
          const next = font === "serif" ? "sans" : "serif";
          root().setAttribute("data-reader-font", next);
          save("reader-font", next);
        }}
      >
        <Type size={16} aria-hidden /> <span>Serif</span>
      </button>
      <button type="button" aria-pressed={focus === "on"} title="Focus mode — hide everything but the notes (Esc to exit)" onClick={() => (focus === "on" ? root().removeAttribute("data-focus") : root().setAttribute("data-focus", "on"))}>
        {focus === "on" ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />} <span>{focus === "on" ? "Exit focus" : "Focus"}</span>
      </button>
    </div>
  );
}
