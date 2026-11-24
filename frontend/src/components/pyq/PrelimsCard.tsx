"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";
import type { Question } from "@/lib/types";

/** MCQ, answer first: the student's choice is recorded (with `base`), then the answer and explanation show. */
export function PrelimsOptions({ q, base }: { q: Question; base?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const last = q.mine?.chosen ? q.mine : null;
  const [revealed, setRevealed] = useState(false);
  const show = revealed || picked !== null;
  const options = q.options ?? [];
  const noneCorrect = q.correct_option === "N"; // the official wording leaves no option correct
  // Recorded without its distractors: think of the answer, then reveal it.
  if (options.length < 2) {
    return (
      <>
        {revealed && (
          <div className="option correct answer-only" role="status">
            <span className="key" aria-hidden>
              ✓
            </span>
            <span>
              <b>Answer:</b> {options[0]?.text}
            </span>
          </div>
        )}
        <div className="q-foot">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setRevealed((r) => !r)}
            aria-expanded={revealed}
          >
            {revealed ? (
              <EyeOff size={15} aria-hidden />
            ) : (
              <Eye size={15} aria-hidden />
            )}
            {revealed ? "Hide answer" : "Show the answer"}
          </button>
          {!revealed && (
            <span className="muted small">
              Options for this question are not on record. Answer it in your
              head first.
            </span>
          )}
        </div>
        {revealed && q.explanation && (
          <div className="explanation">
            <b>Explanation.</b> {q.explanation}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="options" role="group" aria-label="Options">
        {options.map((o) => {
          const isCorrect = o.key === q.correct_option;
          const cls =
            show && isCorrect
              ? "correct"
              : picked === o.key && !isCorrect
                ? "wrong"
                : "";
          return (
            <button
              key={o.key}
              type="button"
              className={`option ${cls}`}
              aria-pressed={picked === o.key}
              disabled={show}
              onClick={() => {
                setPicked(o.key);
                if (
                  base &&
                  "ABCD".includes(q.correct_option) &&
                  q.correct_option
                )
                  void clientApi(`${base}/questions/${q.id}/attempt/`, {
                    method: "POST",
                    json: { option: o.key },
                  }).catch(() => {});
              }}
            >
              <span className="key">{o.key}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      <div className="q-foot">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() =>
            show ? (setRevealed(false), setPicked(null)) : setRevealed(true)
          }
        >
          {show ? (
            <EyeOff size={15} aria-hidden />
          ) : (
            <Eye size={15} aria-hidden />
          )}
          {show ? "Hide answer" : "Reveal answer"}
        </button>
        <span aria-live="polite" className="small">
          {picked !== null &&
            (picked === q.correct_option ? (
              <b style={{ color: "var(--success)" }}>Correct!</b>
            ) : (
              <b style={{ color: "var(--danger)" }}>
                Not quite —{" "}
                {noneCorrect
                  ? "none of the options is correct as framed"
                  : `the answer is ${q.correct_option}`}
                .
              </b>
            ))}
          {picked === null && revealed && (
            <b>
              Answer:{" "}
              {noneCorrect
                ? "none of the options is correct as framed"
                : q.correct_option}
            </b>
          )}
          {picked === null && !revealed && last && (
            <span className={last.correct ? "mine-ok" : "mine-wrong"}>
              Last time you chose {last.chosen}:{" "}
              {last.correct ? "right" : "not right"}.
            </span>
          )}
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
