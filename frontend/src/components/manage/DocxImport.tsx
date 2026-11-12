"use client";

import { BookUp, ChevronRight, FileText, ListTree, RotateCcw, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { stageLabel } from "@/lib/format";
import { NOTE_KINDS, type Commission, type NoteKind, type PaperNode, type Status, type SyllabusTree } from "@/lib/types";

import { TrackPicker } from "./TrackPicker";

type Outline = {
  title: string;
  subtitle: string;
  subject: string;
  prefix: string;
  chapters: { title: string; sections: { code: string; title: string; words: number; tables: number }[] }[];
  sections: number;
  words: number;
  warnings: string[];
  conflicts: string[];
  existing_subject: boolean;
  result?: {
    topics_created: number;
    micro_themes_created: number;
    micro_themes_updated: number;
    notes_written: number;
    subject_id: number;
    track: { commission: string; group: string; label: string };
  };
};

export function DocxImport({ commissions, initialTrack }: { commissions: Commission[]; initialTrack: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [trackKey, setTrackKey] = useState(initialTrack);
  const [papers, setPapers] = useState<PaperNode[]>([]);
  const [paperId, setPaperId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [prefix, setPrefix] = useState("");
  const [kind, setKind] = useState<NoteKind>("comprehensive");
  const [status, setStatus] = useState<Status>("published");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "import">("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  useEffect(() => {
    let live = true;
    clientApi<SyllabusTree>(`/tracks/${trackKey}/syllabus/`)
      .then((t) => {
        if (!live) return;
        setPapers(t.papers);
        setPaperId((cur) => (t.papers.some((p) => String(p.id) === cur) ? cur : t.papers[0] ? String(t.papers[0].id) : ""));
      })
      .catch(() => live && setPapers([]));
    return () => {
      live = false;
    };
  }, [trackKey]);

  async function send(commit: boolean, f = file, overrides: { subject?: string; prefix?: string } = {}) {
    if (!f) return;
    const body = new FormData();
    body.set("file", f);
    if (paperId) body.set("paper", paperId);
    const subj = overrides.subject ?? subject;
    const pre = overrides.prefix ?? prefix;
    if (subj) body.set("subject", subj);
    if (pre) body.set("prefix", pre);
    body.set("kind", kind);
    body.set("status", status);
    if (commit) body.set("commit", "true");
    setBusy(commit ? "import" : "preview");
    setError("");
    try {
      const res = await clientApi<Outline>("/manage/import-docx/", { method: "POST", body });
      setOutline(res);
      setSubject(res.subject);
      setPrefix(res.prefix);
      if (commit && res.result) toast(`Imported ${res.result.notes_written} sections`, "success");
    } catch (err) {
      const b = err instanceof ClientApiError ? (err.body as Partial<Outline> & Record<string, unknown>) : null;
      if (b && Array.isArray(b.chapters)) setOutline(b as Outline);
      const msg = b ? (b.detail as string) || (b.file as string[] | undefined)?.join(" ") || (b.paper as string[] | undefined)?.join(" ") : "";
      setError(msg || (err as Error).message);
    } finally {
      setBusy("");
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".docx")) {
      setError("Choose a Word .docx file (in Word: File → Save As → Word Document).");
      return;
    }
    setFile(f);
    setOutline(null);
    setSubject("");
    setPrefix("");
    void send(false, f, { subject: "", prefix: "" });
  }

  function reset() {
    setFile(null);
    setOutline(null);
    setSubject("");
    setPrefix("");
    setError("");
  }

  const paper = papers.find((p) => String(p.id) === paperId);
  const done = outline?.result;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Import notes</div>
          <h1>Import a book of notes from Word</h1>
          <p>
            Each <b>Heading 1</b> becomes a chapter (a topic in the syllabus) and each <b>Heading 2</b> a section (a micro-theme), with
            the text underneath as its notes — word for word, with bold, lists and tables. Re-importing an edited file updates the same
            notes.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="form-grid">
          <TrackPicker commissions={commissions} value={trackKey} onChange={(v) => (setTrackKey(v), setOutline(null))} />
          <label className="field">
            <span className="label">Paper</span>
            <select className="select" value={paperId} onChange={(e) => (setPaperId(e.target.value), setOutline(null))} disabled={!papers.length}>
              {!papers.length && <option value="">No papers in this exam yet — add one in the Syllabus manager</option>}
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {stageLabel(p.stage)} · {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Notes go in as</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
              {NOTE_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">New items are</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="published">Published (students see them)</option>
              <option value="draft">Draft (admins only, publish later)</option>
            </select>
          </label>
        </div>
      </section>

      {!file ? (
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <FileText size={36} aria-hidden style={{ color: "var(--brand-accent)" }} />
          <h2 style={{ fontSize: 18, margin: "10px 0 4px" }}>Drop your Word file here</h2>
          <p className="muted small" style={{ margin: "0 0 14px" }}>
            .docx, up to 15 MB. You&apos;ll see the chapters and sections before anything is saved.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!paperId}>
            <UploadCloud size={17} aria-hidden /> Choose file
          </button>
          {!paperId && <p className="small muted">Choose the paper first.</p>}
          <input ref={fileRef} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      ) : (
        <section className="panel" aria-labelledby="pv-h">
          <div className="panel-head">
            <div>
              <h2 id="pv-h">{done ? "Imported" : busy === "preview" ? "Reading the document…" : "Preview"}</h2>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                {file.name}
                {outline && ` · ${outline.chapters.length} chapters · ${outline.sections} sections · ${outline.words.toLocaleString("en-IN")} words`}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              <RotateCcw size={15} aria-hidden /> {done ? "Import another file" : "Choose a different file"}
            </button>
          </div>

          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          {done && (
            <div className="alert alert-success" role="status" style={{ marginBottom: 14 }}>
              <b>{done.notes_written}</b> sections imported into <b>{subject}</b> ({done.topics_created} new chapters,{" "}
              {done.micro_themes_created} new sections, {done.micro_themes_updated} updated).{" "}
              <Link className="link" href={`/exams/${done.track.commission}/${done.track.group}/materials?kind=${kind}&subject=${done.subject_id}`}>
                Read them in Material / Notes →
              </Link>{" "}
              ·{" "}
              <Link className="link" href={`/manage/syllabus?track=${done.track.commission}/${done.track.group}`}>
                Open the syllabus manager →
              </Link>
            </div>
          )}

          {outline && !done && (
            <>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <label className="field">
                  <span className="label">Subject (in {paper ? paper.title : "the paper"})</span>
                  <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} />
                  <span className="hint">
                    {outline.existing_subject
                      ? "This subject already exists — its chapters and notes will be updated."
                      : "A new subject with this name will be created."}
                  </span>
                </label>
                <label className="field">
                  <span className="label">Code prefix</span>
                  <input
                    className="input"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                    style={{ textTransform: "uppercase" }}
                  />
                  <span className="hint">Sections get codes like {prefix || "MIH"}-01-01. Keep it the same when re-importing.</span>
                </label>
              </div>
              {outline.conflicts.length > 0 && (
                <div className="alert alert-error" style={{ marginBottom: 14 }}>
                  These codes already belong to another subject in this exam: {outline.conflicts.slice(0, 5).join(", ")}. Change the code
                  prefix, then preview again.
                </div>
              )}
              {outline.warnings.map((w) => (
                <div key={w} className="alert alert-info" style={{ marginBottom: 8 }}>
                  {w}
                </div>
              ))}
              <div className="row" style={{ marginBottom: 14 }}>
                <button type="button" className="btn btn-ghost" onClick={() => send(false)} disabled={!!busy}>
                  Preview again
                </button>
                <span className="spacer" />
                <button type="button" className="btn btn-primary" onClick={() => send(true)} disabled={!!busy || !paperId || outline.conflicts.length > 0}>
                  <BookUp size={17} aria-hidden /> {busy === "import" ? "Importing…" : `Import ${outline.sections} sections`}
                </button>
              </div>
            </>
          )}

          {outline && (
            <div className="stack" style={{ gap: 8 }}>
              {outline.chapters.map((ch, i) => (
                <details key={ch.title} className="import-chapter" open={i === 0}>
                  <summary>
                    <ChevronRight className="chev-rot" size={16} aria-hidden />
                    <ListTree size={16} aria-hidden />
                    <b>
                      {i + 1}. {ch.title}
                    </b>
                    <span className="spacer" />
                    <span className="muted small">{ch.sections.length} sections</span>
                  </summary>
                  <ol className="import-sections">
                    {ch.sections.map((s) => (
                      <li key={s.code}>
                        <span className="code-chip">{s.code}</span> {s.title}
                        <span className="muted small">
                          {" "}
                          · {s.words.toLocaleString("en-IN")} words{s.tables ? ` · ${s.tables} table${s.tables > 1 ? "s" : ""}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="muted small">
        Tip: in Word, chapter titles must use the style <b>Heading 1</b> and section titles <b>Heading 2</b> (Home → Styles). Headings 3–6,
        bold, italics, bullet/numbered lists and tables are kept. Pictures are not imported.
      </p>
    </div>
  );
}
