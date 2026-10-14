"use client";

import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import type { Commission, StageKey, Status } from "@/lib/types";

import { findTrack, TrackPicker } from "./TrackPicker";

type Raw = Record<string, unknown> & { __row: number };
type RowResult = { row: number; ok: boolean; errors: string[]; action: "create" | "update" | null; summary: string; text: string };
type Preview = {
  columns: string[];
  valid: number;
  invalid: number;
  rows: RowResult[];
  result?: { created: number; updated: number; failed: number };
};

const MAX_BYTES = 10 * 1024 * 1024;

const EXAMPLES: Record<StageKey, Record<string, string | number>[]> = {
  prelims: [
    {
      question_no: 1, year: 2024, paper_label: "Paper I", micro_theme_code: "", question: "Which Article of the Constitution abolishes untouchability?",
      option_a: "Article 14", option_b: "Article 15", option_c: "Article 17", option_d: "Article 18", correct_option: "C",
      explanation: "Article 17 abolishes untouchability and forbids its practice in any form.", keywords: "untouchability", tags: "polity, fundamental-rights", status: "published",
    },
  ],
  mains: [
    {
      question_no: 1, year: 2024, paper_label: "Paper II", micro_theme_code: "", question: "Examine the role of the Finance Commission in fiscal federalism.",
      directive: "Examine", marks: 15, model_answer: "Introduction paragraph.\n\n- First point\n- Second point\n\nConclusion paragraph.",
      keywords: "finance commission", tags: "polity, federalism", status: "published",
    },
  ],
};

function normaliseKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function parseFile(file: File): Promise<Raw[]> {
  const name = file.name.toLowerCase();
  let table: unknown[][];
  if (name.endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    const res = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
    table = res.data;
  } else if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    table = (await readSheet(file)) as unknown[][];
  } else {
    throw new Error("Use an .xlsx or .csv file (download the template above).");
  }
  if (table.length < 2) throw new Error("The sheet has no data rows under the header.");
  const header = table[0].map((h) => normaliseKey(String(h ?? "")));
  if (!header.includes("question")) throw new Error("Couldn't find a “question” column — is the first row the header?");
  const rows: Raw[] = [];
  table.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => c !== null && c !== undefined && String(c).trim() !== "")) return; // blank line
    const row: Raw = { __row: i + 2 };
    header.forEach((h, j) => {
      if (!h) return;
      const v = cells[j];
      row[h] = v instanceof Date ? v.getFullYear() : v ?? "";
    });
    rows.push(row);
  });
  return rows;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkImport({ commissions, initialTrack, initialStage }: { commissions: Commission[]; initialTrack: string; initialStage: StageKey }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [trackKey, setTrackKey] = useState(initialTrack);
  const [stage, setStage] = useState<StageKey>(initialStage);
  const [defaultStatus, setDefaultStatus] = useState<Status>("published");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<Raw[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [show, setShow] = useState<"all" | "errors" | "valid">("all");
  const [busy, setBusy] = useState<"" | "parse" | "commit" | "template">("");
  const [over, setOver] = useState(false);
  const track = findTrack(commissions, trackKey);
  const done = !!preview?.result;
  const step = done ? 4 : preview ? 3 : 2;

  function reset() {
    setRaw(null);
    setPreview(null);
    setFileName("");
    setShow("all");
  }

  async function validate(rows: Raw[], commit = false) {
    return clientApi<Preview>("/manage/questions/import/", {
      method: "POST",
      json: { track: trackKey, stage, default_status: defaultStatus, rows, commit },
    });
  }

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) return toast("That file is over 10 MB.", "error");
    setBusy("parse");
    setPreview(null);
    try {
      const rows = await parseFile(file);
      if (rows.length > 5000) throw new Error(`Too many rows (${rows.length}); split the file into batches of 5,000.`);
      setFileName(file.name);
      setRaw(rows);
      setPreview(await validate(rows));
    } catch (err) {
      toast((err as Error).message, "error");
      reset();
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!raw) return;
    setBusy("commit");
    try {
      const res = await validate(raw, true);
      setPreview(res);
      toast(`Imported: ${res.result!.created} new, ${res.result!.updated} updated`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  async function downloadTemplate() {
    setBusy("template");
    try {
      const ref = await clientApi<{ columns: string[]; micro_themes: { code: string; title: string; paper: string; subject: string; topic: string }[] }>(
        `/manage/import-reference/?track=${trackKey}&stage=${stage}`,
      );
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const example: Record<string, string | number>[] = EXAMPLES[stage].map((r) => ({ ...r, micro_theme_code: ref.micro_themes[0]?.code ?? "PRE-PI-XX-001" }));
      const head = (cols: string[]) => cols.map((c) => ({ value: c, fontWeight: "bold" as const }));
      const file = writeXlsxFile(
        [
          { sheet: "Questions", data: [head(ref.columns), ...example.map((r) => ref.columns.map((c) => ({ value: r[c] ?? "" })))] },
          {
            sheet: "Micro-theme codes",
            data: [
              head(["micro_theme_code", "title", "paper", "subject", "topic"]),
              ...ref.micro_themes.map((m) => [m.code, m.title, m.paper, m.subject, m.topic].map((value) => ({ value }))),
            ],
          },
        ],
      );
      downloadBlob(await file.toBlob(), `pyq-template-${trackKey.replace("/", "-")}-${stage}.xlsx`);
    } catch (err) {
      toast((err as Error).message || "Couldn't build the template", "error");
    } finally {
      setBusy("");
    }
  }

  function downloadErrors() {
    if (!preview || !raw) return;
    const bad = new Map(preview.rows.filter((r) => !r.ok).map((r) => [r.row, r.errors]));
    const cols = ["row", ...preview.columns, "errors"];
    const lines = [cols.join(",")];
    for (const r of raw) {
      const errs = bad.get(r.__row);
      if (!errs) continue;
      lines.push(cols.map((c) => csvEscape(c === "row" ? r.__row : c === "errors" ? errs.join("; ") : r[c])).join(","));
    }
    downloadBlob(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `import-errors-${fileName.replace(/\.\w+$/, "")}.csv`);
  }

  const shown = preview?.rows.filter((r) => (show === "all" ? true : show === "errors" ? !r.ok : r.ok)) ?? [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Bulk upload</div>
          <h1>Import PYQs from a spreadsheet</h1>
          <p>
            Rows are matched on <b>year + paper label + question number</b> within the chosen track and stage, so re-uploading an
            edited sheet updates questions instead of duplicating them.
          </p>
        </div>
      </div>

      <ol className="steps" aria-label="Progress">
        {["Choose exam", "Upload file", "Review preview", "Imported"].map((s, i) => (
          <li key={s} className={`step ${step >= i + 1 ? "on" : ""}`} aria-current={step === i + 1 ? "step" : undefined}>
            <span className="n">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      <section className="panel">
        <div className="toolbar" style={{ alignItems: "flex-end", marginBottom: 0 }}>
          <TrackPicker
            commissions={commissions}
            value={trackKey}
            label="Commission & group"
            onChange={(v) => {
              setTrackKey(v);
              reset();
            }}
          />
          <div className="field">
            <span className="label" id="stage-l">Stage</span>
            <div className="segmented" role="group" aria-labelledby="stage-l">
              {(["prelims", "mains"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={stage === s} onClick={() => (setStage(s), reset())}>
                  {s === "prelims" ? "Prelims" : "Mains"}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="label">Rows without a status become</span>
            <select className="select" value={defaultStatus} onChange={(e) => (setDefaultStatus(e.target.value as Status), reset())}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={downloadTemplate} disabled={!!busy}>
            <Download size={16} aria-hidden /> {busy === "template" ? "Building…" : `Download ${stage} template`}
          </button>
        </div>
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          Every imported row is tagged <b>{track?.label}</b> · <b>{stage === "prelims" ? "Prelims" : "Mains"}</b>. The template lists
          this track&apos;s micro-theme codes on a second sheet.
        </p>
      </section>

      {!preview && (
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
            const f = e.dataTransfer.files[0];
            if (f) void onFile(f);
          }}
        >
          <FileSpreadsheet size={36} aria-hidden style={{ color: "var(--brand-accent)" }} />
          <h2 style={{ fontSize: 18, margin: "10px 0 4px" }}>{busy === "parse" ? "Reading and validating…" : "Drop your .xlsx or .csv here"}</h2>
          <p className="muted small" style={{ margin: "0 0 14px" }}>
            The file is parsed in your browser; the server re-checks every row before anything is saved.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <UploadCloud size={17} aria-hidden /> Choose file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {preview && (
        <section className="panel" aria-labelledby="preview-h">
          <div className="panel-head">
            <div>
              <h2 id="preview-h">{done ? "Import complete" : "Validation preview"}</h2>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                {fileName} · {preview.rows.length} rows
              </p>
            </div>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                <RotateCcw size={15} aria-hidden /> {done ? "Import another file" : "Choose a different file"}
              </button>
              {preview.invalid > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadErrors}>
                  <Download size={15} aria-hidden /> Error report (.csv)
                </button>
              )}
            </div>
          </div>

          {done ? (
            <div className="alert alert-success" role="status">
              <b>{preview.result!.created}</b> created · <b>{preview.result!.updated}</b> updated · <b>{preview.result!.failed}</b> skipped
              with errors.{" "}
              <Link className="link" href={`/exams/${trackKey}/${stage}`}>
                View in the PYQ vault →
              </Link>
            </div>
          ) : (
            <div className="grid-3" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="stat-value" style={{ color: "var(--success)" }}>{preview.valid}</div>
                <div className="stat-label">valid rows — will be imported</div>
              </div>
              <div className="stat">
                <div className="stat-value" style={{ color: preview.invalid ? "var(--danger)" : undefined }}>{preview.invalid}</div>
                <div className="stat-label">rows with errors — skipped</div>
              </div>
              <div className="stat">
                <div className="stat-value">
                  {preview.rows.filter((r) => r.action === "create").length} / {preview.rows.filter((r) => r.action === "update").length}
                </div>
                <div className="stat-label">new / updating existing</div>
              </div>
            </div>
          )}

          <div className="row" style={{ marginBottom: 10 }}>
            <div className="segmented" role="group" aria-label="Show rows">
              {(["all", "errors", "valid"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s === "all" ? `All (${preview.rows.length})` : s === "errors" ? `Errors (${preview.invalid})` : `Valid (${preview.valid})`}
                </button>
              ))}
            </div>
            <span className="spacer" />
            {!done && (
              <button type="button" className="btn btn-primary" onClick={commit} disabled={!!busy || preview.valid === 0}>
                <UploadCloud size={17} aria-hidden /> {busy === "commit" ? "Importing…" : `Import ${preview.valid} valid row${preview.valid === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ maxHeight: 520, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Result</th>
                  <th scope="col">Year · Paper · Q</th>
                  <th scope="col">Question</th>
                  <th scope="col">Problems</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className={r.ok ? "" : "row-error"}>
                    <td className="num">{r.row}</td>
                    <td>
                      {r.ok ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={12} aria-hidden /> {r.action === "update" ? "Update" : "New"}
                        </span>
                      ) : (
                        <span className="badge badge-danger">
                          <XCircle size={12} aria-hidden /> Error
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.summary}</td>
                    <td style={{ minWidth: 220 }}>
                      <span className="clamp-2">{r.text || <i className="muted">(empty)</i>}</span>
                    </td>
                    <td className="small" style={{ color: "var(--danger)" }}>
                      {r.errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="panel">
        <summary className="answer-summary">Column reference</summary>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <tbody>
              <tr><td><code>question_no</code>, <code>year</code>, <code>paper_label</code></td><td>Required. Together they identify a question (re-uploads update it).</td></tr>
              <tr><td><code>micro_theme_code</code></td><td>Required. Must exist in the chosen track (see the template&apos;s second sheet).</td></tr>
              <tr><td><code>question</code></td><td>Required. The question text.</td></tr>
              <tr><td><code>option_a</code>…<code>option_d</code>, <code>correct_option</code></td><td>Prelims only. Correct option is A–D (or 1–4).</td></tr>
              <tr><td><code>explanation</code></td><td>Prelims, optional.</td></tr>
              <tr><td><code>directive</code>, <code>marks</code>, <code>model_answer</code></td><td>Mains only. In the model answer, blank lines separate paragraphs; lines starting “- ” become bullets.</td></tr>
              <tr><td><code>keywords</code>, <code>tags</code></td><td>Optional. Tags are comma-separated.</td></tr>
              <tr><td><code>status</code></td><td>Optional: draft or published (otherwise the default chosen above).</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
