"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RichEditor } from "@/components/rich/RichEditor";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { clientApi, ClientApiError } from "@/lib/client-api";
import type { Commission, RichDoc, StageKey, Status } from "@/lib/types";

import { findTrack, TrackPicker } from "./TrackPicker";

export type QuestionInitial = {
  id?: number;
  trackKey: string;
  stage: StageKey;
  year?: number;
  paper_label?: string;
  question_no?: number;
  micro_theme_code?: string;
  text?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_option?: string;
  explanation?: string;
  directive?: string;
  marks?: number | null;
  model_answer?: RichDoc | Record<string, never>;
  keywords?: string;
  tags?: string[];
  status?: Status;
};

type MtOption = { code: string; title: string; paper: string; subject: string; topic: string };

function groupBy<T>(items: T[], key: (t: T) => string) {
  const out: Record<string, T[]> = {};
  for (const i of items) (out[key(i)] ??= []).push(i);
  return out;
}

const DIRECTIVES = ["Analyse", "Assess", "Comment", "Critically evaluate", "Describe", "Discuss", "Elucidate", "Examine", "Explain", "Illustrate", "Justify", "Outline"];

export function QuestionForm({ commissions, initial }: { commissions: Commission[]; initial: QuestionInitial }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial.id;
  const [trackKey, setTrackKey] = useState(initial.trackKey);
  const [stage, setStage] = useState<StageKey>(initial.stage);
  const [answer, setAnswer] = useState<RichDoc | Record<string, never>>(initial.model_answer ?? {});
  const [mts, setMts] = useState<MtOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const track = findTrack(commissions, trackKey);

  useEffect(() => {
    if (!trackKey) return;
    let live = true;
    clientApi<{ micro_themes: MtOption[] }>(`/manage/import-reference/?track=${trackKey}`)
      .then((r) => live && setMts(r.micro_themes))
      .catch(() => live && setMts([]));
    return () => {
      live = false;
    };
  }, [trackKey]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!track) return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const body: Record<string, unknown> = {
      track: track.id,
      stage,
      year: Number(s("year")) || null,
      paper_label: s("paper_label"),
      question_no: Number(s("question_no")) || null,
      micro_theme_code: s("micro_theme_code"),
      text: s("text"),
      keywords: s("keywords"),
      tags: s("tags").split(",").map((t) => t.trim()).filter(Boolean),
      status: s("status"),
    };
    if (!body.micro_theme_code) body.micro_theme = null;
    if (stage === "prelims") {
      Object.assign(body, {
        option_a: s("option_a"),
        option_b: s("option_b"),
        option_c: s("option_c"),
        option_d: s("option_d"),
        correct_option: s("correct_option"),
        explanation: s("explanation"),
      });
    } else {
      Object.assign(body, { directive: s("directive"), marks: Number(s("marks")) || null, model_answer: answer });
    }
    setBusy(true);
    setErrors({});
    try {
      await clientApi(`/manage/questions/${isNew ? "" : `${initial.id}/`}`, { method: isNew ? "POST" : "PATCH", json: body });
      toast(isNew ? "Question added" : "Question saved", "success");
      router.push(`/manage/questions?track=${trackKey}&stage=${stage}`);
      router.refresh();
    } catch (err) {
      const b = err instanceof ClientApiError ? err.body : null;
      const fe: Record<string, string> = {};
      if (b) for (const [k, v] of Object.entries(b)) fe[k] = Array.isArray(v) ? v.join(" ") : String(v);
      setErrors(Object.keys(fe).length ? fe : { detail: (err as Error).message });
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  const inv = (k: string) => (errors[k] ? true : undefined);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Link href={`/manage/questions?track=${trackKey}`} className="link small row" style={{ gap: 4 }}>
          <ArrowLeft size={14} aria-hidden /> All questions
        </Link>
        <h1 style={{ fontSize: 28, marginTop: 8 }}>{isNew ? "New question" : "Edit question"}</h1>
      </div>

      <form className="panel stack" onSubmit={submit} noValidate>
        {(errors.detail || errors.non_field_errors) && (
          <div className="alert alert-error" role="alert">
            {errors.detail || errors.non_field_errors}
          </div>
        )}
        {Object.keys(errors).length > 0 && !errors.detail && !errors.non_field_errors && (
          <div className="alert alert-error" role="alert">
            Please fix the highlighted fields.
          </div>
        )}
        <div className="form-grid">
          <TrackPicker commissions={commissions} value={trackKey} onChange={setTrackKey} />
          <div className="field">
            <span className="label" id="stage-l">Stage</span>
            <div className="segmented" role="group" aria-labelledby="stage-l">
              {(["prelims", "mains"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)}>
                  {s === "prelims" ? "Prelims (MCQ)" : "Mains (descriptive)"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="q-year">Year</label>
            <input id="q-year" name="year" type="number" min={1950} max={2100} className="input" defaultValue={initial.year ?? new Date().getFullYear()} required aria-invalid={inv("year")} />
            {err("year")}
          </div>
          <div className="field">
            <label htmlFor="q-paper">Paper label</label>
            <input id="q-paper" name="paper_label" className="input" defaultValue={initial.paper_label ?? "Paper I"} required maxLength={80} aria-invalid={inv("paper_label")} />
            {err("paper_label")}
          </div>
          <div className="field">
            <label htmlFor="q-no">Question number</label>
            <input id="q-no" name="question_no" type="number" min={1} className="input" defaultValue={initial.question_no ?? ""} required aria-invalid={inv("question_no")} />
            {err("question_no")}
          </div>
          <div className="field">
            <label htmlFor="q-mt">Micro-theme</label>
            <select id="q-mt" name="micro_theme_code" className="select" defaultValue={initial.micro_theme_code ?? ""} key={`${trackKey}-${mts.length}`} aria-invalid={inv("micro_theme_code") ?? inv("micro_theme")}>
              <option value="">— Not mapped —</option>
              {Object.entries(groupBy(mts, (m) => `${m.paper} › ${m.subject}`)).map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} · {m.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {err("micro_theme_code")}
            {err("micro_theme")}
          </div>
          <div className="field full">
            <label htmlFor="q-text">Question</label>
            <textarea id="q-text" name="text" className="textarea" rows={4} defaultValue={initial.text ?? ""} required aria-invalid={inv("text")} />
            {err("text")}
          </div>

          {stage === "prelims" ? (
            <>
              {(["a", "b", "c", "d"] as const).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`q-opt-${k}`}>Option {k.toUpperCase()}</label>
                  <input id={`q-opt-${k}`} name={`option_${k}`} className="input" defaultValue={initial[`option_${k}`] ?? ""} required aria-invalid={inv(`option_${k}`)} />
                  {err(`option_${k}`)}
                </div>
              ))}
              <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label" style={{ marginBottom: 6 }}>
                  Correct option
                </legend>
                <div className="row">
                  {["A", "B", "C", "D"].map((k) => (
                    <label key={k} className="checkbox">
                      <input type="radio" name="correct_option" value={k} defaultChecked={initial.correct_option === k} /> {k}
                    </label>
                  ))}
                </div>
                {err("correct_option")}
              </fieldset>
              <div className="field full">
                <label htmlFor="q-expl">Explanation (optional)</label>
                <textarea id="q-expl" name="explanation" className="textarea" rows={3} defaultValue={initial.explanation ?? ""} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="q-dir">Directive word (optional)</label>
                <input id="q-dir" name="directive" className="input" list="directives" defaultValue={initial.directive ?? ""} maxLength={40} />
                <datalist id="directives">
                  {DIRECTIVES.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="q-marks">Marks</label>
                <input id="q-marks" name="marks" type="number" min={1} max={250} className="input" defaultValue={initial.marks ?? ""} aria-invalid={inv("marks")} />
                {err("marks")}
              </div>
              <div className="field full">
                <span className="label">Model answer</span>
                <RichEditor label="Model answer" value={answer} onChange={setAnswer} placeholder="Introduction, body with headings, a table or diagram, and a conclusion…" />
                {err("model_answer")}
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="q-kw">Keywords</label>
            <input id="q-kw" name="keywords" className="input" defaultValue={initial.keywords ?? ""} placeholder="free text that helps search" maxLength={400} />
          </div>
          <div className="field">
            <label htmlFor="q-tags">Tags</label>
            <input id="q-tags" name="tags" className="input" defaultValue={(initial.tags ?? []).join(", ")} placeholder="polity, fundamental-rights" />
            <span className="hint">Comma-separated</span>
          </div>
          <div className="field">
            <label htmlFor="q-status">Status</label>
            <select id="q-status" name="status" className="select" defaultValue={initial.status ?? "draft"}>
              <option value="draft">Draft (hidden from students)</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <div className="row">
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
          <span className="spacer" />
          <Link href={`/manage/questions?track=${trackKey}`} className="btn btn-ghost">
            Cancel
          </Link>
          <button className="btn btn-primary" disabled={busy || !track}>
            <Save size={16} aria-hidden /> {busy ? "Saving…" : isNew ? "Add question" : "Save changes"}
          </button>
        </div>
      </form>

      {deleting && (
        <ConfirmDialog
          title="Delete this question?"
          message="It will disappear from the PYQ vault for everyone. This can't be undone."
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await clientApi(`/manage/questions/${initial.id}/`, { method: "DELETE" });
              toast("Question deleted", "success");
              router.push(`/manage/questions?track=${trackKey}`);
              router.refresh();
            } catch (err) {
              toast((err as Error).message, "error");
            }
          }}
        />
      )}
    </div>
  );
}
