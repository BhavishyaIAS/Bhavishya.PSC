"use client";

import type { Skin } from "@/lib/types";

const LOOKS: { key: Skin; label: string }[] = [
  { key: "living", label: "Living" },
  { key: "sky", label: "Sky" },
  { key: "classic", label: "Classic" },
];

/** Each visitor can choose their own look (remembered on this device); the site's choice is the default. */
export function LookSwitch({ current }: { current: Skin }) {
  return (
    <div className="look-switch" role="group" aria-label="Look of the site">
      <span className="look-switch-label">Look</span>
      {LOOKS.map((l) => (
        <button
          key={l.key}
          type="button"
          aria-pressed={l.key === current}
          onClick={() => {
            if (l.key === current) return;
            document.cookie = `bp_skin=${l.key}; path=/; max-age=31536000; samesite=lax`;
            window.location.reload();
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
