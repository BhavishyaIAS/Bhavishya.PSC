"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";

/** Mark a micro-theme as studied (personal progress). */
export function StudiedToggle({
  commission,
  group,
  code,
  studied,
  title,
  variant = "icon",
}: {
  commission: string;
  group: string;
  code: string;
  studied: boolean;
  title: string;
  variant?: "icon" | "button";
}) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(studied);
  const [pending, start] = useTransition();

  async function toggle() {
    const next = !on;
    setOn(next);
    try {
      await clientApi(`/tracks/${commission}/${group}/micro-themes/${encodeURIComponent(code)}/progress/`, {
        method: next ? "POST" : "DELETE",
      });
      start(() => router.refresh());
    } catch (err) {
      setOn(!next);
      toast((err as Error).message, "error");
    }
  }

  if (variant === "button") {
    return (
      <button type="button" className={`btn ${on ? "btn-secondary" : "btn-primary"} btn-block`} onClick={toggle} disabled={pending} aria-pressed={on}>
        <Check size={17} aria-hidden /> {on ? "Studied — undo" : "Mark as studied"}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`check-toggle ${on ? "on" : ""}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={`${on ? "Unmark" : "Mark"} "${title}" as studied`}
      title={on ? "Studied" : "Mark as studied"}
    >
      <Check size={14} aria-hidden />
    </button>
  );
}
