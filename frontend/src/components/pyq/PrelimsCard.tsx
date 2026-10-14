"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { Question } from "@/lib/types";

/** MCQ with "try it" + reveal-answer interaction. */
export function PrelimsOptions({ q }: { q: Question }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const show = revealed || picked !== null;
  return (
    <>
      <div className="options" role="group" aria-label="Options">
        {(q.options ?? []).map((o) => {
          const isCorrect = o.key === q.correct_option;
          const cls = show && isCorrect ? "correct" : picked === o.key && !isCorrect ? "wrong" : "";
          return (
            <button
              key={o.key}
              type="button"
              className={`option ${cls}`}
              aria-pressed={picked === o.key}
              disabled={show}
              onClick={() => setPicked(o.key)}
            >
              <span className="key">{o.key}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      <div className="q-foot">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => (show ? (setRevealed(false), setPicked(null)) : setRevealed(true))}>
          {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          {show ? "Hide answer" : "Reveal answer"}
        </button>
        <span aria-live="polite" className="small">
          {picked !== null &&
            (picked === q.correct_option ? (
              <b style={{ color: "var(--success)" }}>Correct!</b>
            ) : (
              <b style={{ color: "var(--danger)" }}>Not quite — the answer is {q.correct_option}.</b>
            ))}
          {picked === null && revealed && <b>Answer: {q.correct_option}</b>}
        </span>
      </div>
      {show && q.explanation && (
        <div className="explanation">
          <b>Explanation.</b> {q.explanation}
        </div>
      )}
    </>
  );
}
