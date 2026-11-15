"use client";

import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Landmark, ListTree, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { themePalettes } from "@/brand.config";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import type { Status } from "@/lib/types";

export type Exam = {
  id: number;
  commission: string;
  group: string;
  group_name: string;
  label: string;
  tagline: string;
  papers: number;
  sections: number;
};
export type ExamBody = {
  id: number;
  slug: string;
  short_name: string;
  name: string;
  description: string;
  status: Status;
  theme: string;
  exams: Exam[];
};
export type ExamsData = { results: ExamBody[]; themes: string[]; focus: number | null };

type Dialog =
  | { kind: "body"; body?: ExamBody }
  | { kind: "exam"; body: ExamBody; exam?: Exam }
  | { kind: "delete-body"; body: ExamBody }
  | { kind: "delete-exam"; body: ExamBody; exam: Exam };

const SUGGESTED = ["Group 1", "Group 2", "Group 3", "Group 4"];

/** Add, edit, reorder, show/hide and remove commissions (APPSC, UPSC…) and the exams inside each. */
export function ExamsManager({ initial }: { initial: ExamsData }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const hasUpsc = data.results.some((b) => b.slug === "upsc");

  /** Run one change, then reload the list (and the rest of the site's menus). */
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      setData(await clientApi<ExamsData>("/manage/exams/"));
      toast(done, "success");
      setDialog(null);
      start(() => router.refresh());
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Exams</div>
          <h1>Commissions and their exams</h1>
          <p>
            Add any examining body — a State PSC, UPSC, SSC — and the exams it holds (Group 1, Group 2, Civil Services…). Each exam gets
            its own syllabus topics, notes, PYQs and progress.
          </p>
        </div>
        <div className="row">
          {!hasUpsc && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => run(() => clientApi("/manage/site/starter/", { method: "POST", json: { kind: "upsc" } }), "UPSC Civil Services added (hidden until you show it)")}
            >
              <Landmark size={17} aria-hidden /> Set up UPSC
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "body" })}>
            <Plus size={17} aria-hidden /> Add a commission
          </button>
        </div>
      </div>

      {data.focus !== null && (
        <div className="alert alert-info">
          The platform is currently <b>dedicated to {data.results.find((b) => b.id === data.focus)?.short_name}</b> — students see only that
          exam. Change this in{" "}
          <Link className="link" href="/manage/site">
            Site settings
          </Link>
          .
        </div>
      )}

      {data.results.length === 0 && (
        <div className="empty">
          <h3>No exams yet</h3>
          <p>Add a commission to begin, or use “Set up UPSC” for a ready-made start.</p>
        </div>
      )}

      {data.results.map((body, i) => {
        const visible = body.status === "published";
        const palette = themePalettes[body.theme];
        return (
          <section key={body.id} className="panel exam-body">
            <div className="panel-head">
              <div className="row" style={{ gap: 12, flexWrap: "nowrap", minWidth: 0 }}>
                <span className="swatch" style={{ background: palette ? `linear-gradient(135deg, ${palette.from}, ${palette.to})` : "var(--aurora)" }} aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <h2>
                    {body.short_name}{" "}
                    {visible ? <span className="badge badge-success">Visible to students</span> : <span className="badge badge-warning">Hidden</span>}{" "}
                    {data.focus === body.id && (
                      <span className="badge badge-primary">
                        <Star size={11} aria-hidden /> Dedicated
                      </span>
                    )}
                  </h2>
                  <div className="muted small">{body.name}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => clientApi(`/manage/exams/${body.id}/`, { method: "PATCH", json: { status: visible ? "draft" : "published" } }), `${body.short_name} is now ${visible ? "hidden from" : "visible to"} students`)}>
                  {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {visible ? "Hide" : "Show"}
                </button>
                <button type="button" className="mini-btn" disabled={busy || i === 0} aria-label={`Move ${body.short_name} up`} title="Move up" onClick={() => run(() => clientApi(`/manage/exams/${body.id}/`, { method: "PATCH", json: { move: "up" } }), "Order saved")}>
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button type="button" className="mini-btn" disabled={busy || i === data.results.length - 1} aria-label={`Move ${body.short_name} down`} title="Move down" onClick={() => run(() => clientApi(`/manage/exams/${body.id}/`, { method: "PATCH", json: { move: "down" } }), "Order saved")}>
                  <ArrowDown size={14} aria-hidden />
                </button>
                <button type="button" className="mini-btn" onClick={() => setDialog({ kind: "body", body })}>
                  <Pencil size={14} aria-hidden /> Edit
                </button>
                <button type="button" className="mini-btn danger" aria-label={`Delete ${body.short_name}`} title="Delete" onClick={() => setDialog({ kind: "delete-body", body })}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>

            {body.exams.length === 0 ? (
              <p className="muted small" style={{ marginTop: 0 }}>
                No exams in {body.short_name} yet — add the first one below.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Exam</th>
                      <th scope="col" className="num">Sections of notes</th>
                      <th scope="col">Work on it</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {body.exams.map((exam, k) => (
                      <tr key={exam.id}>
                        <td>
                          <b>{exam.group_name}</b>
                          {exam.tagline && <div className="muted small clamp-2">{exam.tagline}</div>}
                        </td>
                        <td className="num">{exam.sections}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <Link className="mini-btn" href={`/manage/topics?track=${exam.commission}/${exam.group}`}>
                              <ListTree size={14} aria-hidden /> Topics
                            </Link>
                            <Link className="mini-btn" href={`/exams/${exam.commission}/${exam.group}`}>
                              <ExternalLink size={14} aria-hidden /> Open
                            </Link>
                          </div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            <button type="button" className="mini-btn" disabled={busy || k === 0} aria-label={`Move ${exam.group_name} up`} title="Move up" onClick={() => run(() => clientApi(`/manage/exam-tracks/${exam.id}/`, { method: "PATCH", json: { move: "up" } }), "Order saved")}>
                              <ArrowUp size={14} aria-hidden />
                            </button>
                            <button type="button" className="mini-btn" disabled={busy || k === body.exams.length - 1} aria-label={`Move ${exam.group_name} down`} title="Move down" onClick={() => run(() => clientApi(`/manage/exam-tracks/${exam.id}/`, { method: "PATCH", json: { move: "down" } }), "Order saved")}>
                              <ArrowDown size={14} aria-hidden />
                            </button>
                            <button type="button" className="mini-btn" aria-label={`Edit ${exam.label}`} title="Rename" onClick={() => setDialog({ kind: "exam", body, exam })}>
                              <Pencil size={14} aria-hidden />
                            </button>
                            <button type="button" className="mini-btn danger" aria-label={`Delete ${exam.label}`} title="Delete" onClick={() => setDialog({ kind: "delete-exam", body, exam })}>
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: "exam", body })}>
                <Plus size={15} aria-hidden /> Add an exam to {body.short_name}
              </button>
            </div>
          </section>
        );
      })}

      {dialog?.kind === "body" && <BodyForm body={dialog.body} themes={data.themes} busy={busy} onClose={() => setDialog(null)} onSave={(json) => run(() => (dialog.body ? clientApi(`/manage/exams/${dialog.body.id}/`, { method: "PATCH", json }) : clientApi("/manage/exams/", { method: "POST", json })), dialog.body ? "Saved" : `${json.short_name} added — hidden until you show it`)} />}
      {dialog?.kind === "exam" && (
        <ExamForm
          body={dialog.body}
          exam={dialog.exam}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(json) => run(() => (dialog.exam ? clientApi(`/manage/exam-tracks/${dialog.exam.id}/`, { method: "PATCH", json }) : clientApi(`/manage/exams/${dialog.body.id}/exams/`, { method: "POST", json })), dialog.exam ? "Saved" : `${json.name} added to ${dialog.body.short_name}`)}
        />
      )}
      {dialog?.kind === "delete-body" && (
        <ConfirmDelete
          title={`Delete ${dialog.body.short_name}?`}
          word={dialog.body.short_name}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(confirm) => run(() => clientApi(`/manage/exams/${dialog.body.id}/`, { method: "DELETE", json: { confirm } }), `${dialog.body.short_name} deleted`)}
        >
          This permanently deletes <b>{dialog.body.name}</b> with its {dialog.body.exams.length} exam{dialog.body.exams.length === 1 ? "" : "s"} and every topic, note, PYQ and
          file inside. To keep the content but take it off the site, use <b>Hide</b> instead.
        </ConfirmDelete>
      )}
      {dialog?.kind === "delete-exam" && (
        <ConfirmDelete
          title={`Delete ${dialog.exam.label}?`}
          word={dialog.exam.group_name}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(confirm) => run(() => clientApi(`/manage/exam-tracks/${dialog.exam.id}/`, { method: "DELETE", json: { confirm } }), `${dialog.exam.label} deleted`)}
        >
          This permanently deletes <b>{dialog.exam.label}</b> with its syllabus topics, {dialog.exam.sections} section{dialog.exam.sections === 1 ? "" : "s"} of notes, its PYQs and its
          files.
        </ConfirmDelete>
      )}
    </div>
  );
}

function BodyForm({ body, themes, busy, onClose, onSave }: { body?: ExamBody; themes: string[]; busy: boolean; onClose: () => void; onSave: (json: Record<string, unknown> & { short_name: string }) => void }) {
  const [short, setShort] = useState(body?.short_name ?? "");
  const [name, setName] = useState(body?.name ?? "");
  const [description, setDescription] = useState(body?.description ?? "");
  const [theme, setTheme] = useState(body?.theme ?? "");
  const [exams, setExams] = useState<string[]>(body ? [] : ["Group 1", "Group 2"]);
  return (
    <Modal
      title={body ? `Edit ${body.short_name}` : "Add a commission"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="body-form" className="btn btn-primary" disabled={busy || !short.trim() || !name.trim()}>
            {body ? "Save" : "Add commission"}
          </button>
        </>
      }
    >
      <form
        id="body-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ short_name: short.trim(), name: name.trim(), description, theme, ...(body ? {} : { exams }) });
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span className="label">Short name</span>
            <input className="input" value={short} onChange={(e) => setShort(e.target.value)} maxLength={20} placeholder="e.g. UPSC, KPSC, TNPSC" required />
          </label>
          <label className="field">
            <span className="label">Full name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="e.g. Union Public Service Commission" required />
          </label>
          <label className="field full">
            <span className="label">Short description (optional)</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
          </label>
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Colour of its card</legend>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={`swatch-btn ${theme === "" ? "on" : ""}`} onClick={() => setTheme("")} aria-pressed={theme === ""}>
              Auto
            </button>
            {themes.map((t) => (
              <button
                key={t}
                type="button"
                className={`swatch-btn ${theme === t ? "on" : ""}`}
                style={{ background: `linear-gradient(135deg, ${themePalettes[t]?.from}, ${themePalettes[t]?.to})`, color: "#fff" }}
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
              >
                {t}
              </button>
            ))}
          </div>
        </fieldset>
        {!body && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Exams to start with (you can add more later)</legend>
            <div className="row" style={{ gap: 8 }}>
              {SUGGESTED.map((g) => (
                <label key={g} className="checkbox">
                  <input type="checkbox" checked={exams.includes(g)} onChange={(e) => setExams(e.target.checked ? [...exams, g].sort() : exams.filter((x) => x !== g))} /> {g}
                </label>
              ))}
            </div>
            <span className="hint">A new commission is hidden from students until you press Show.</span>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

function ExamForm({ body, exam, busy, onClose, onSave }: { body: ExamBody; exam?: Exam; busy: boolean; onClose: () => void; onSave: (json: { name: string; tagline: string }) => void }) {
  const [name, setName] = useState(exam?.group_name ?? "");
  const [tagline, setTagline] = useState(exam?.tagline ?? "");
  const taken = body.exams.map((e) => e.group_name.toLowerCase());
  return (
    <Modal
      title={exam ? `Edit ${exam.label}` : `Add an exam to ${body.short_name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="exam-form" className="btn btn-primary" disabled={busy || !name.trim()}>
            {exam ? "Save" : "Add exam"}
          </button>
        </>
      }
    >
      <form
        id="exam-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name: name.trim(), tagline });
        }}
      >
        <label className="field">
          <span className="label">Name of the exam</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Group 3, Civil Services, Forest Service" required />
          {exam && <span className="hint">Renaming changes this exam&apos;s web address, so old bookmarks to it stop working.</span>}
        </label>
        {!exam && (
          <div className="row" style={{ gap: 6 }}>
            {SUGGESTED.filter((g) => !taken.includes(g.toLowerCase())).map((g) => (
              <button key={g} type="button" className="mini-btn" onClick={() => setName(g)}>
                {g}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span className="label">One line about it (optional)</span>
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={200} placeholder="Shown on the exam's card" />
        </label>
      </form>
    </Modal>
  );
}

/** A delete that can't be undone asks for the name to be typed. */
function ConfirmDelete({ title, word, busy, children, onClose, onConfirm }: { title: string; word: string; busy: boolean; children: React.ReactNode; onClose: () => void; onConfirm: (typed: string) => void }) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === word.toLowerCase();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={busy || !ok} onClick={() => onConfirm(typed.trim())}>
            <Trash2 size={16} aria-hidden /> Delete for good
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>{children}</p>
      <label className="field">
        <span className="label">
          Type <b>{word}</b> to confirm
        </span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
    </Modal>
  );
}
