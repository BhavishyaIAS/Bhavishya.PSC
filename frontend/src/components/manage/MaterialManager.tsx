"use client";

import { Eye, EyeOff, FileUp, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DownloadButton } from "@/components/DownloadButton";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, StatusBadge } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { formatBytes, formatDate } from "@/lib/format";
import { NOTE_KINDS, type Commission, type Material, type NoteKind, type PaperNode, type Paginated, type SyllabusTree } from "@/lib/types";

import { findTrack, TrackPicker } from "./TrackPicker";

const ALLOWED = [".pdf", ".docx", ".pptx", ".xlsx", ".epub", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md"];
const MAX_MB = 25;

export function MaterialManager({
  commissions,
  trackKey,
  category,
  editId,
}: {
  commissions: Commission[];
  trackKey: string;
  category: NoteKind | "";
  editId: number | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const track = findTrack(commissions, trackKey);
  const [items, setItems] = useState<Material[] | null>(null);
  const [papers, setPapers] = useState<PaperNode[]>([]);
  const [form, setForm] = useState<{ material?: Material } | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);

  const reload = useCallback(async () => {
    const qs = new URLSearchParams({ track: trackKey, page_size: "100" });
    if (category) qs.set("category", category);
    const [list, tree] = await Promise.all([
      clientApi<Paginated<Material>>(`/manage/materials/?${qs}`),
      clientApi<SyllabusTree>(`/tracks/${trackKey}/syllabus/`),
    ]);
    setItems(list.results);
    setPapers(tree.papers);
    return list.results;
  }, [trackKey, category]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch for the selected track/category
    reload()
      .then((list) => {
        if (editId) {
          const m = list.find((x) => x.id === editId);
          if (m) setForm({ material: m });
        }
      })
      .catch((err) => toast((err as Error).message, "error"));
  }, [reload, editId, toast]);

  const go = (changes: Record<string, string>) => {
    const sp = new URLSearchParams({ track: trackKey, ...(category ? { category } : {}), ...changes });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    router.push(`${pathname}?${sp}`);
  };

  async function toggleStatus(m: Material) {
    try {
      await clientApi(`/manage/materials/${m.id}/`, { method: "PATCH", json: { status: m.status === "published" ? "draft" : "published" } });
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Material manager</div>
          <h1>Study materials</h1>
          <p>Files are private: students download them through short-lived signed links, and only while they&apos;re published.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm({})} disabled={!track}>
          <FileUp size={17} aria-hidden /> Upload file
        </button>
      </div>

      <section className="panel">
        <div className="toolbar" style={{ alignItems: "flex-end" }}>
          <TrackPicker commissions={commissions} value={trackKey} />
          <div className="field">
            <span className="label" id="cat-l">Category</span>
            <div className="segmented" role="group" aria-labelledby="cat-l">
              <button type="button" aria-pressed={!category} onClick={() => go({ category: "" })}>
                All
              </button>
              {NOTE_KINDS.map((k) => (
                <button key={k.key} type="button" aria-pressed={category === k.key} onClick={() => go({ category: k.key })}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {items === null ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={UploadCloud}
            title="No files here yet"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
                <FileUp size={17} aria-hidden /> Upload the first file
              </button>
            }
          >
            Upload PDFs, slides or documents for {track?.label} and map them to the syllabus.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Category</th>
                  <th scope="col">Mapped to</th>
                  <th scope="col">Size</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.title}</b>
                      <div className="small muted">
                        {m.original_filename} · {formatDate(m.created_at)}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{NOTE_KINDS.find((k) => k.key === m.category)?.label}</span>
                    </td>
                    <td className="small">{m.mapping ? m.mapping.crumbs.join(" › ") : <span className="muted">Whole track</span>}</td>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {formatBytes(m.size_bytes)}
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <DownloadButton id={m.id} label="" />
                        <button type="button" className="mini-btn" onClick={() => toggleStatus(m)} aria-label={`${m.status === "published" ? "Unpublish" : "Publish"} ${m.title}`} title={m.status === "published" ? "Unpublish" : "Publish"}>
                          {m.status === "published" ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                        </button>
                        <button type="button" className="mini-btn" onClick={() => setForm({ material: m })} aria-label={`Edit ${m.title}`}>
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button type="button" className="mini-btn danger" onClick={() => setDeleting(m)} aria-label={`Delete ${m.title}`}>
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
      </section>

      {form && track && (
        <MaterialForm
          trackId={track.id}
          trackLabel={track.label}
          papers={papers}
          material={form.material}
          defaultCategory={category || "comprehensive"}
          onClose={() => {
            setForm(null);
            if (editId) go({ edit: "" });
          }}
          onSaved={async (msg) => {
            setForm(null);
            toast(msg, "success");
            await reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this file?"
          message={
            <>
              <b>{deleting.title}</b> will be removed for everyone, and the stored file deleted. This can&apos;t be undone.
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await clientApi(`/manage/materials/${deleting.id}/`, { method: "DELETE" });
              setDeleting(null);
              toast("File deleted", "success");
              await reload();
            } catch (err) {
              toast((err as Error).message, "error");
            }
          }}
        />
      )}
    </div>
  );
}

function MaterialForm({
  trackId,
  trackLabel,
  papers,
  material,
  defaultCategory,
  onClose,
  onSaved,
}: {
  trackId: number;
  trackLabel: string;
  papers: PaperNode[];
  material?: Material;
  defaultCategory: NoteKind;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = !material;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  // Resolve the current mapping into the 4 cascading selects.
  const initial = useMemo(() => {
    const out = { paper: "", subject: "", topic: "", micro: "" };
    if (!material) return out;
    for (const p of papers)
      for (const s of p.subjects)
        for (const t of s.topics) {
          for (const m of t.micro_themes)
            if (m.id === material.micro_theme) Object.assign(out, { paper: `${p.id}`, subject: `${s.id}`, topic: `${t.id}`, micro: `${m.id}` });
          if (t.id === material.topic) Object.assign(out, { paper: `${p.id}`, subject: `${s.id}`, topic: `${t.id}` });
        }
    for (const p of papers) {
      for (const s of p.subjects) if (s.id === material.subject) Object.assign(out, { paper: `${p.id}`, subject: `${s.id}` });
      if (p.id === material.paper) out.paper = `${p.id}`;
    }
    return out;
  }, [material, papers]);
  const [map, setMap] = useState(initial);
  const paper = papers.find((p) => `${p.id}` === map.paper);
  const subject = paper?.subjects.find((s) => `${s.id}` === map.subject);
  const topic = subject?.topics.find((t) => `${t.id}` === map.topic);

  function pick(f: File | undefined) {
    if (!f) return;
    const ext = `.${f.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED.includes(ext)) return setErrors({ file: `File type not allowed. Use: ${ALLOWED.join(", ")}` });
    if (f.size > MAX_MB * 1024 * 1024) return setErrors({ file: `File is too large (max ${MAX_MB} MB).` });
    setErrors({});
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isNew && !file) return setErrors({ file: "Choose a file to upload." });
    const f = new FormData(e.currentTarget);
    const body = new FormData();
    body.set("track", String(trackId));
    for (const k of ["title", "description", "category", "status"]) body.set(k, String(f.get(k) ?? ""));
    // Keep only the most specific syllabus mapping.
    const level = map.micro ? "micro_theme" : map.topic ? "topic" : map.subject ? "subject" : map.paper ? "paper" : "";
    const ids = { paper: map.paper, subject: map.subject, topic: map.topic, micro_theme: map.micro };
    for (const k of ["paper", "subject", "topic", "micro_theme"] as const) body.set(k, k === level ? ids[k] : "");
    if (file) body.set("file", file);
    setBusy(true);
    setErrors({});
    try {
      await clientApi(`/manage/materials/${isNew ? "" : `${material!.id}/`}`, { method: isNew ? "POST" : "PATCH", body });
      onSaved(isNew ? "File uploaded" : "File updated");
    } catch (err) {
      const b = err instanceof ClientApiError ? err.body : null;
      const fe: Record<string, string> = {};
      if (b) for (const [k, v] of Object.entries(b)) fe[k] = Array.isArray(v) ? v.join(" ") : String(v);
      setErrors(Object.keys(fe).length ? fe : { detail: (err as Error).message });
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  const sel = (key: keyof typeof map, label: string, options: { id: number; title: string; code?: string }[], reset: Partial<typeof map>) => (
    <div className="field">
      <label htmlFor={`mm-${key}`}>{label}</label>
      <select id={`mm-${key}`} className="select" value={map[key]} onChange={(e) => setMap({ ...map, ...reset, [key]: e.target.value })} disabled={!options.length}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code && key === "micro" ? `${o.code} · ` : ""}
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal
      wide
      title={isNew ? `Upload to ${trackLabel}` : "Edit file"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="material-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Uploading…" : isNew ? "Upload" : "Save"}
          </button>
        </>
      }
    >
      <form id="material-form" className="form-grid" onSubmit={submit} noValidate>
        {(errors.detail || errors.mapping || errors.non_field_errors) && (
          <div className="alert alert-error full" role="alert">
            {errors.detail || errors.mapping || errors.non_field_errors}
          </div>
        )}
        <div
          className={`dropzone full ${over ? "over" : ""}`}
          style={{ padding: 20 }}
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
          {file ? (
            <div className="row" style={{ justifyContent: "center" }}>
              <b>{file.name}</b> <span className="muted small">{formatBytes(file.size)}</span>
              <button type="button" className="mini-btn" onClick={() => setFile(null)} aria-label="Remove selected file">
                <X size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <p style={{ margin: "0 0 10px" }}>
                {isNew ? "Drop a file here, or" : `Current file: ${material!.original_filename}. Drop a new one to replace it, or`}
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <UploadCloud size={15} aria-hidden /> Choose file
              </button>
              <p className="muted small" style={{ margin: "10px 0 0" }}>
                PDF, Word, PowerPoint, Excel, EPUB, images, text · up to {MAX_MB} MB
              </p>
            </>
          )}
          <input ref={fileRef} type="file" hidden accept={ALLOWED.join(",")} onChange={(e) => pick(e.target.files?.[0])} aria-label="File" />
          {err("file")}
        </div>
        <div className="field full">
          <label htmlFor="mm-title">Title</label>
          <input id="mm-title" name="title" className="input" defaultValue={material?.title ?? ""} required maxLength={200} />
          {err("title")}
        </div>
        <div className="field full">
          <label htmlFor="mm-desc">Description</label>
          <textarea id="mm-desc" name="description" className="textarea" rows={2} defaultValue={material?.description ?? ""} style={{ minHeight: 60 }} />
        </div>
        <div className="field">
          <label htmlFor="mm-cat">Category</label>
          <select id="mm-cat" name="category" className="select" defaultValue={material?.category ?? defaultCategory}>
            {NOTE_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mm-status">Status</label>
          <select id="mm-status" name="status" className="select" defaultValue={material?.status ?? "draft"}>
            <option value="draft">Draft (hidden from students)</option>
            <option value="published">Published</option>
          </select>
        </div>
        <fieldset className="full form-grid" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, margin: 0 }}>
          <legend className="label" style={{ padding: "0 6px" }}>
            Map to the syllabus (optional — the most specific level wins)
          </legend>
          {sel("paper", "Paper", papers, { subject: "", topic: "", micro: "" })}
          {sel("subject", "Subject", paper?.subjects ?? [], { topic: "", micro: "" })}
          {sel("topic", "Topic", subject?.topics ?? [], { micro: "" })}
          {sel("micro", "Micro-theme", topic?.micro_themes ?? [], {})}
        </fieldset>
      </form>
    </Modal>
  );
}
