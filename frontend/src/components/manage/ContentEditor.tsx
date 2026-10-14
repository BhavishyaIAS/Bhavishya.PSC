"use client";

import { ArrowLeft, ExternalLink, PlayCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RichEditor } from "@/components/rich/RichEditor";
import { ConfirmDialog } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import { stageLabel } from "@/lib/format";
import { NOTE_KINDS, type Note, type NoteKind, type RichDoc, type Status, type TrackRef } from "@/lib/types";

type Content = {
  micro_theme: { id: number; code: string; title: string; status: Status; priority: string; estimated_minutes: number | null };
  track: TrackRef;
  breadcrumb: { paper: { title: string; stage: "prelims" | "mains" }; subject: { title: string }; topic: { title: string } };
  notes: Partial<Record<NoteKind, Note>>;
  videos: { id: number; title: string; url: string; order: number }[];
  glossary: { id: number; term: string; definition: string; order: number }[];
};

type Draft = { body: RichDoc; status: Status; dirty: boolean; exists: boolean };

const EMPTY: RichDoc = { type: "doc", content: [] };

export function ContentEditor({ id, initialKind }: { id: number; initialKind: NoteKind }) {
  const toast = useToast();
  const [data, setData] = useState<Content | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<NoteKind>(initialKind);
  const [drafts, setDrafts] = useState<Partial<Record<NoteKind, Draft>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await clientApi<Content>(`/manage/micro-themes/${id}/content/`);
      setData(d);
      setDrafts((prev) => {
        const next: Partial<Record<NoteKind, Draft>> = {};
        for (const k of NOTE_KINDS) {
          const n = d.notes[k.key];
          next[k.key] = prev[k.key]?.dirty
            ? prev[k.key]
            : { body: n?.body ?? EMPTY, status: n?.status ?? "draft", dirty: false, exists: !!n };
        }
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const anyDirty = Object.values(drafts).some((d) => d?.dirty);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="panel muted">Loading…</div>;

  const draft = drafts[kind]!;
  const mt = data.micro_theme;
  const studentHref = `/exams/${data.track.commission}/${data.track.group}/micro/${encodeURIComponent(mt.code)}?note=${kind}`;

  async function saveNote() {
    setSaving(true);
    try {
      await clientApi(`/manage/micro-themes/${id}/notes/${kind}/`, { method: "PUT", json: { body: draft.body, status: draft.status } });
      setDrafts((d) => ({ ...d, [kind]: { ...draft, dirty: false, exists: true } }));
      toast(`${NOTE_KINDS.find((k) => k.key === kind)!.label} saved (${draft.status})`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <Link href={`/manage/syllabus?track=${data.track.commission}/${data.track.group}`} className="link small row" style={{ gap: 4 }}>
          <ArrowLeft size={14} aria-hidden /> {data.track.label} syllabus
        </Link>
        <nav className="crumbs" style={{ marginTop: 10 }} aria-label="Syllabus position">
          <span className="badge badge-neutral">{stageLabel(data.breadcrumb.paper.stage)}</span>
          {data.breadcrumb.paper.title} › {data.breadcrumb.subject.title} › {data.breadcrumb.topic.title}
        </nav>
        <div className="row">
          <h1 style={{ fontSize: 28 }}>{mt.title}</h1>
          <span className="code-chip">{mt.code}</span>
          <StatusBadge status={mt.status} />
          <span className="spacer" />
          <Link href={studentHref} className="btn btn-ghost btn-sm" target="_blank">
            <ExternalLink size={15} aria-hidden /> Preview as student
          </Link>
        </div>
        {mt.status === "draft" && (
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            This micro-theme is a draft, so students won&apos;t see any of its notes until it&apos;s published in the syllabus manager.
          </p>
        )}
      </div>

      <section className="panel" aria-labelledby="notes-h">
        <div className="panel-head">
          <h2 id="notes-h">Notes</h2>
          <div className="segmented" role="group" aria-label="Note type">
            {NOTE_KINDS.map((k) => {
              const d = drafts[k.key];
              return (
                <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
                  {k.label}
                  {d?.dirty ? " •" : d?.exists ? "" : " (new)"}
                </button>
              );
            })}
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {NOTE_KINDS.find((k) => k.key === kind)!.blurb}. Headings, lists, tables, images, callouts and diagrams are supported.
        </p>
        <RichEditor
          key={kind}
          label={`${kind} notes for ${mt.title}`}
          value={draft.body}
          placeholder="Write the notes for this micro-theme…"
          onChange={(body) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind]!, body, dirty: true } }))}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span className="label">Status</span>
            <select
              className="select"
              style={{ width: "auto" }}
              value={draft.status}
              onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...draft, status: e.target.value as Status, dirty: true } }))}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <span className="spacer" />
          {draft.exists && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden /> Delete note
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={saveNote} disabled={saving || !draft.dirty}>
            <Save size={16} aria-hidden /> {saving ? "Saving…" : draft.dirty ? "Save note" : "Saved"}
          </button>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Videos mtId={id} items={data.videos} onChange={load} />
        <Glossary mtId={id} items={data.glossary} onChange={load} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this note?"
          message="The note will be removed for students immediately. This can't be undone."
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await clientApi(`/manage/micro-themes/${id}/notes/${kind}/`, { method: "DELETE" });
              setDrafts((d) => ({ ...d, [kind]: { body: EMPTY, status: "draft", dirty: false, exists: false } }));
              setConfirmDelete(false);
              toast("Note deleted", "success");
            } catch (err) {
              toast((err as Error).message, "error");
            }
          }}
        />
      )}
    </div>
  );
}

function Videos({ mtId, items, onChange }: { mtId: number; items: Content["videos"]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel" aria-labelledby="videos-h">
      <div className="panel-head">
        <h2 id="videos-h">Videos</h2>
        <span className="muted small">{items.length} linked</span>
      </div>
      <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
        {items.length === 0 && <p className="muted small" style={{ margin: 0 }}>No videos yet.</p>}
        {items.map((v) => (
          <div key={v.id} className="video-item">
            <span className="vi" aria-hidden>
              <PlayCircle size={18} />
            </span>
            <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
              {v.title}
            </a>
            <button
              type="button"
              className="mini-btn danger"
              aria-label={`Remove video ${v.title}`}
              onClick={async () => {
                try {
                  await clientApi(`/manage/videos/${v.id}/`, { method: "DELETE" });
                  await onChange();
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <form
        className="stack"
        style={{ gap: 8 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          try {
            await clientApi("/manage/videos/", {
              method: "POST",
              json: { micro_theme: mtId, title: f.get("title"), url: f.get("url"), order: items.length + 1 },
            });
            form.reset();
            await onChange();
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input name="title" className="input" placeholder="Video title" aria-label="Video title" required maxLength={200} />
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input name="url" type="url" className="input" placeholder="https://www.youtube.com/watch?v=…" aria-label="Video URL" required />
          <button className="btn btn-secondary" disabled={busy}>
            <Plus size={16} aria-hidden /> Add
          </button>
        </div>
      </form>
    </section>
  );
}

function Glossary({ mtId, items, onChange }: { mtId: number; items: Content["glossary"]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel" aria-labelledby="gloss-h">
      <div className="panel-head">
        <h2 id="gloss-h">Glossary</h2>
        <span className="muted small">{items.length} terms</span>
      </div>
      {items.length === 0 ? (
        <p className="muted small">No terms yet.</p>
      ) : (
        <dl className="gloss">
          {items.map((g) => (
            <div key={g.id} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div style={{ flex: 1 }}>
                <dt>{g.term}</dt>
                <dd>{g.definition}</dd>
              </div>
              <button
                type="button"
                className="mini-btn danger"
                aria-label={`Remove term ${g.term}`}
                onClick={async () => {
                  try {
                    await clientApi(`/manage/glossary/${g.id}/`, { method: "DELETE" });
                    await onChange();
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          ))}
        </dl>
      )}
      <form
        className="stack"
        style={{ gap: 8 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          try {
            await clientApi("/manage/glossary/", {
              method: "POST",
              json: { micro_theme: mtId, term: f.get("term"), definition: f.get("definition"), order: items.length + 1 },
            });
            form.reset();
            await onChange();
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input name="term" className="input" placeholder="Term" aria-label="Term" required maxLength={160} />
        <textarea name="definition" className="textarea" rows={2} placeholder="Definition" aria-label="Definition" required style={{ minHeight: 60 }} />
        <button className="btn btn-secondary" disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Plus size={16} aria-hidden /> Add term
        </button>
      </form>
    </section>
  );
}
