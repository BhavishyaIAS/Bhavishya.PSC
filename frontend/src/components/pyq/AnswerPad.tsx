"use client";

import { PenLine, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { clientApi } from "@/lib/client-api";

const SCORES = ["Weak", "Thin", "Fair", "Good", "Strong"];

/**
 * Write an answer to a Mains question: a plain writing space with a word count against the expected length,
 * saved as a draft; then compare it with the model answer (below) and rate it yourself. Nothing is evaluated by
 * the platform: the rating is the student's own.
 */
export function AnswerPad({ base, id, marks, initialWords }: { base: string; id: number; marks: number | null; initialWords: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  const target = marks ? (marks >= 50 ? 1000 : marks >= 15 ? 250 : marks >= 10 ? 150 : null) : null; // the usual word limits (an essay: about 1,000)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    void clientApi<{ text: string; self_score: number | null; updated_at: string | null }>(`${base}/questions/${id}/answer/`).then((d) => {
      setText((t) => t || d.text); // never over what was typed while it loaded
      setScore((s) => s ?? d.self_score);
      if (d.updated_at) setSaved(new Date(d.updated_at).toLocaleString());
    });
  }, [open, base, id]);

  async function save(nextScore = score) {
    setBusy(true);
    try {
      const d = await clientApi<{ updated_at: string }>(`${base}/questions/${id}/answer/`, { method: "PUT", json: { text, self_score: nextScore } });
      setSaved(new Date(d.updated_at).toLocaleString());
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}>
        <PenLine size={15} aria-hidden /> {initialWords ? `Continue your answer (${initialWords} words)` : "Write an answer"}
      </button>
    );
  }
  return (
    <div className="answer-pad">
      <label className="answer-pad-label" htmlFor={`ans-${id}`}>
        Your answer
      </label>
      <textarea id={`ans-${id}`} value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Introduction, body in points or paragraphs, conclusion…" />
      <div className="answer-pad-foot">
        <span className={`answer-words ${target && words > target * 1.1 ? "over" : ""}`}>
          {words} word{words === 1 ? "" : "s"}
          {target ? ` / about ${target}` : ""}
        </span>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => save()}>
          <Save size={15} aria-hidden /> Save draft
        </button>
        {saved && <span className="muted small">Saved {saved}</span>}
      </div>
      <div className="answer-pad-rate" role="group" aria-label="Rate your answer after comparing it with the model answer">
        <span className="muted small">After comparing with the model answer, rate it yourself:</span>
        {SCORES.map((label, i) => (
          <button
            key={label}
            type="button"
            className="mini-btn"
            aria-pressed={score === i + 1}
            onClick={() => {
              setScore(i + 1);
              void save(i + 1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
