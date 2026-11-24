"use client";

import { useState } from "react";

import { isScene, SCENES, WORLD_COOKIE, type Scene } from "./scenes";

/** "Auto" lets each page have its own world; or one world can be kept everywhere (remembered on this device). */
export function WorldPicker({ pinned }: { pinned: Scene | null }) {
  const [value, setValue] = useState<string>(pinned ?? "auto");
  return (
    <label className="world-picker">
      <span className="look-switch-label">World</span>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          document.cookie = isScene(v) ? `${WORLD_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax` : `${WORLD_COOKIE}=; path=/; max-age=0; samesite=lax`;
          window.dispatchEvent(new CustomEvent("living-world", { detail: isScene(v) ? v : null }));
        }}
      >
        <option value="auto">Auto (each page its own)</option>
        {SCENES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
