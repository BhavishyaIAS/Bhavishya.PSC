"use client";

import { useState } from "react";

import { clientApi } from "@/lib/client-api";
import type { TopicState } from "@/lib/types";

type Progress = { status: TopicState; next_due: string | null; revisions: number };

/**
 * Where the student stands on this topic. Completing it schedules a revision (1, 3, 7, 21, 45 days as it is
 * revised); "Needs attention" brings it back tomorrow. The dashboard lists what is due.
 */
export function TopicStatus({ base, code, initial }: { base: string; code: string; initial: Progress }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const due = p.status !== "studying" && p.next_due && p.next_due <= today;
  async function set(status: string) {
    setBusy(true);
    try {
      setP(await clientApi<Progress>(`${base}/micro-themes/${encodeURIComponent(code)}/status/`, { method: "PUT", json: { status } }));
    } finally {
      setBusy(false);
    }
  }
  const btn = (key: string, label: string, on: boolean) => (
    <button key={key} type="button" className="mini-btn" aria-pressed={on} disabled={busy} onClick={() => set(on ? "none" : key)}>
      {label}
    </button>
  );
  return (
    <div className="topic-status" role="group" aria-label="Your progress on this topic">
      <span className={`topic-status-now ${due ? "is-due" : ""}`}>
        {p.status === null
          ? "Not started"
          : p.status === "studying"
            ? "Studying"
            : p.status === "attention"
              ? "Needs attention"
              : due
                ? "Revision due"
                : `Completed${p.revisions ? ` · revised ${p.revisions}×` : ""}`}
        {p.next_due && p.status !== "studying" && !due && <small> · revise on {new Date(p.next_due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small>}
      </span>
      {btn("studying", "Studying", p.status === "studying")}
      {btn("completed", "Completed", p.status === "completed" && !due)}
      {p.status === "completed" && due && (
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => set("revised")}>
          I&apos;ve revised it
        </button>
      )}
      {btn("attention", "Needs attention", p.status === "attention")}
    </div>
  );
}
