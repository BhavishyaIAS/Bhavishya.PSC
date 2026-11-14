"use client";

import { BookUp, ExternalLink, Eye, EyeOff, ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import { TopicGlyph } from "@/components/TopicGlyph";
import { topicTone } from "@/lib/topics";
import { LOOKS, type Commission, type PaperNode, type SubjectNode } from "@/lib/types";

import { SortableList } from "./SortableList";
import { findTrack, TrackPicker } from "./TrackPicker";

/**
 * The catalogue of syllabus topics a learner chooses from in Material / Notes:
 * add, rename, restyle, reorder (drag), show/hide and delete. Chapters and
 * sections inside a topic are edited in the Syllabus manager.
 */
export function TopicsManager({ commissions, trackKey, papers }: { commissions: Commission[]; trackKey: string; papers: PaperNode[] }) {
  const router = useRouter();
  const toast = useToast();
  const track = findTrack(commissions, trackKey);
  const [title, setTitle] = useState("");
  const [look, setLook] = useState("");
  const [editing, setEditing] = useState<SubjectNode | null>(null);
  const [deleting, setDeleting] = useState<SubjectNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const total = papers.reduce((n, p) => n + p.subjects.length, 0);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast(done, "success");
      setEditing(null);
      setDeleting(null);
      start(() => router.refresh());
      return true;
    } catch (err) {
      toast((err as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!track) {
    return (
      <div className="empty">
        <h3>No exams yet</h3>
        <p>
          Add an exam first in{" "}
          <Link className="link" href="/manage/exams">
            Manage → Exams
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Topics catalogue</div>
          <h1>{track.label}</h1>
          <p>
            These are the topics a learner picks from in Material / Notes, in this order. Drag to reorder. A hidden topic — and
            everything inside it — is visible to admins only.
          </p>
        </div>
        <div className="row">
          <Link href={`/exams/${trackKey}/materials`} className="btn btn-ghost">
            <ExternalLink size={16} aria-hidden /> See it as a learner
          </Link>
        </div>
      </div>

      <section className="panel">
        <form
          className="row"
          style={{ alignItems: "flex-end", gap: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const ok = await run(() => clientApi(`/manage/exam-tracks/${track.id}/topics/`, { method: "POST", json: { title: title.trim(), look } }), `“${title.trim()}” added`);
            if (ok) setTitle("");
          }}
        >
          <TrackPicker commissions={commissions} value={trackKey} label="Exam" />
          <label className="field" style={{ flex: 1, minWidth: 220 }}>
            <span className="label">New topic</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="e.g. Indian Society, Ethics, Current Affairs" />
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            <span className="label">Look</span>
            <select className="select" value={look} onChange={(e) => setLook(e.target.value)}>
              {LOOKS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            <Plus size={17} aria-hidden /> Add topic
          </button>
        </form>
      </section>

      {total === 0 ? (
        <div className="empty">
          <h3>No topics in {track.label} yet</h3>
          <p>Add the first one above — for example History, Geography, Polity, Economy.</p>
        </div>
      ) : (
        papers
          .filter((p) => p.subjects.length > 0)
          .map((paper) => (
            <section key={paper.id} className="panel">
              {papers.filter((p) => p.subjects.length > 0).length > 1 && (
                <div className="panel-head">
                  <h2>{paper.title}</h2>
                  <span className="muted small">Topics are grouped by paper; drag within a paper.</span>
                </div>
              )}
              <SortableList
                items={paper.subjects}
                onReorder={async (ordered) => {
                  await run(() => clientApi("/manage/reorder/", { method: "POST", json: { level: "subject", ids: ordered.map((s) => s.id) } }), "Order saved");
                }}
                render={(s, handle) => {
                  const published = s.status === "published";
                  const sections = s.topics.reduce((n, t) => n + t.micro_themes.length, 0);
                  return (
                    <div className={`topic-row ${topicTone(s.title, s.look)} ${published ? "" : "is-hidden"}`}>
                      {handle(s.title)}
                      <span className="tc-icon" aria-hidden>
                        <TopicGlyph title={s.title} look={s.look} />
                      </span>
                      <span className="tr-title">
                        <b>{s.title}</b>
                        <span className="muted small">
                          {s.topics.length} chapter{s.topics.length === 1 ? "" : "s"} · {sections} section{sections === 1 ? "" : "s"}
                        </span>
                      </span>
                      {!published && <span className="badge badge-warning">Hidden</span>}
                      <span className="row" style={{ gap: 4 }}>
                        <Link className="mini-btn" href={`/manage/syllabus?track=${trackKey}`} title="Add, rename or remove its chapters and sections">
                          <ListTree size={14} aria-hidden /> <span className="hide-mobile">Chapters</span>
                        </Link>
                        <Link className="mini-btn" href="/manage/notes-import" title="Import a Word book into this topic">
                          <BookUp size={14} aria-hidden /> <span className="hide-mobile">Import</span>
                        </Link>
                        <button type="button" className="mini-btn" disabled={busy} title={published ? "Hide from students" : "Show to students"} aria-label={`${published ? "Hide" : "Show"} ${s.title}`} onClick={() => run(() => clientApi("/manage/status/", { method: "POST", json: { level: "subject", id: s.id, status: published ? "draft" : "published" } }), `${s.title} is now ${published ? "hidden" : "visible"}`)}>
                          {published ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                        </button>
                        <button type="button" className="mini-btn" aria-label={`Edit ${s.title}`} title="Rename / change look" onClick={() => setEditing(s)}>
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button type="button" className="mini-btn danger" aria-label={`Delete ${s.title}`} title="Delete" onClick={() => setDeleting(s)}>
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </span>
                    </div>
                  );
                }}
              />
            </section>
          ))
      )}

      {editing && <EditTopic topic={editing} busy={busy} onClose={() => setEditing(null)} onSave={(json) => run(() => clientApi(`/manage/subjects/${editing.id}/`, { method: "PATCH", json }), "Saved")} />}
      {deleting && (
        <Modal
          title={`Delete ${deleting.title}?`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => clientApi(`/manage/subjects/${deleting.id}/`, { method: "DELETE" }), `${deleting.title} deleted`)}>
                <Trash2 size={16} aria-hidden /> Delete topic
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            <b>{deleting.title}</b> and its {deleting.topics.length} chapter{deleting.topics.length === 1 ? "" : "s"} — with all their notes, videos and glossary — will be deleted for
            good. PYQs mapped to it stay, but lose their mapping. To take it off the site without losing anything, use the eye button to hide it instead.
          </p>
        </Modal>
      )}
    </div>
  );
}

function EditTopic({ topic, busy, onClose, onSave }: { topic: SubjectNode; busy: boolean; onClose: () => void; onSave: (json: { title: string; look: string }) => void }) {
  const [title, setTitle] = useState(topic.title);
  const [look, setLook] = useState(topic.look ?? "");
  return (
    <Modal
      title="Edit topic"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="topic-form" className="btn btn-primary" disabled={busy || !title.trim()}>
            Save
          </button>
        </>
      }
    >
      <form
        id="topic-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ title: title.trim(), look });
        }}
      >
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} required />
        </label>
        <label className="field">
          <span className="label">Look — its icon, colour and 3D background</span>
          <select className="select" value={look} onChange={(e) => setLook(e.target.value)}>
            {LOOKS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className={`topic-row ${topicTone(title, look)}`} aria-hidden>
          <span className="tc-icon">
            <TopicGlyph title={title} look={look} />
          </span>
          <span className="tr-title">
            <b>{title || "Topic name"}</b>
            <span className="muted small">Preview</span>
          </span>
        </div>
      </form>
    </Modal>
  );
}
