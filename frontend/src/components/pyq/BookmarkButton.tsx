"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";

/** Keep a question to come back to (the vault's "Bookmarked" filter lists them). */
export function BookmarkButton({ base, id, initial }: { base: string; id: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`mini-btn bookmark-btn ${on ? "is-on" : ""}`}
      aria-pressed={on}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await clientApi(`${base}/questions/${id}/bookmark/`, { method: on ? "DELETE" : "POST" });
          setOn(!on);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Bookmark size={14} aria-hidden fill={on ? "currentColor" : "none"} /> {on ? "Kept" : "Keep"}
    </button>
  );
}
