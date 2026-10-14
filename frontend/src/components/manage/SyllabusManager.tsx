"use client";

import { ChevronDown, ChevronRight, Eye, EyeOff, FilePenLine, ListPlus, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, PriorityBadge, StatusBadge } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { stageLabel } from "@/lib/format";
import type { Commission, MicroThemeNode, PaperNode, Status, SubjectNode, SyllabusTree, TopicNode } from "@/lib/types";

import { SortableList } from "./SortableList";
import { findTrack, TrackPicker } from "./TrackPicker";

type Level = "paper" | "subject" | "topic" | "micro_theme";
const ENDPOINT: Record<Level, string> = { paper: "papers", subject: "subjects", topic: "topics", micro_theme: "micro-themes" };
const PARENT: Record<Level, string> = { paper: "track", subject: "paper", topic: "subject", micro_theme: "topic" };
const LABEL: Record<Level, string> = { paper: "paper", subject: "subject", topic: "topic", micro_theme: "micro-theme" };
const CHILD: Partial<Record<Level, Level>> = { paper: "subject", subject: "topic", topic: "micro_theme" };

type AnyNode = PaperNode | SubjectNode | TopicNode | MicroThemeNode;
type Editing = { level: Level; parentId: number; node?: AnyNode; suggestedCode?: string } | null;

export function SyllabusManager({ commissions, trackKey }: { commissions: Commission[]; trackKey: string }) {
  const toast = useToast();
  const track = findTrack(commissions, trackKey);
  const [tree, setTree] = useState<PaperNode[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<{ level: Level; node: AnyNode } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      const data = await clientApi<SyllabusTree>(`/tracks/${trackKey}/syllabus/`);
      setTree(data.papers);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [trackKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch for the selected track
    void reload();
  }, [reload]);

  const reorder = (level: Level) => async (items: { id: number }[]) => {
    try {
      await clientApi("/manage/reorder/", { method: "POST", json: { level, ids: items.map((i) => i.id) } });
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
      throw err;
    }
  };

  async function setStatus(level: Level, node: AnyNode, status: Status, cascade = false) {
    try {
      await clientApi("/manage/status/", { method: "POST", json: { level, id: node.id, status, cascade } });
      toast(`${node.title} ${status === "published" ? "published" : "moved to draft"}${cascade ? " (with everything inside)" : ""}`, "success");
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const toggleCollapse = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  function actions(level: Level, node: AnyNode) {
    const child = CHILD[level];
    const published = node.status === "published";
    return (
      <span className="t-actions">
        {child && (
          <button
            type="button"
            className="mini-btn"
            onClick={() => setEditing({ level: child, parentId: node.id, suggestedCode: suggestCode(child, node) })}
            title={`Add ${LABEL[child]}`}
          >
            <Plus size={14} aria-hidden /> <span className="hide-mobile">{LABEL[child]}</span>
            <span className="sr-only"> to {node.title}</span>
          </button>
        )}
        {level === "micro_theme" && (
          <Link href={`/manage/content/${node.id}`} className="mini-btn" title="Notes, videos & glossary">
            <FilePenLine size={14} aria-hidden /> <span className="hide-mobile">Content</span>
            <span className="sr-only"> of {node.title}</span>
          </Link>
        )}
        <button type="button" className="mini-btn" onClick={() => setStatus(level, node, published ? "draft" : "published")} aria-label={`${published ? "Unpublish" : "Publish"} ${node.title}`} title={published ? "Unpublish" : "Publish"}>
          {published ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
        {child && (
          <button type="button" className="mini-btn" onClick={() => setStatus(level, node, "published", true)} aria-label={`Publish ${node.title} and everything inside it`} title="Publish with everything inside">
            <UploadCloud size={14} aria-hidden />
          </button>
        )}
        <button type="button" className="mini-btn" onClick={() => setEditing({ level, parentId: 0, node })} aria-label={`Edit ${node.title}`} title="Edit">
          <Pencil size={14} aria-hidden />
        </button>
        <button type="button" className="mini-btn danger" onClick={() => setDeleting({ level, node })} aria-label={`Delete ${node.title}`} title="Delete">
          <Trash2 size={14} aria-hidden />
        </button>
      </span>
    );
  }

  function toggle(k: string, label: string, count: number) {
    const open = !collapsed.has(k);
    return (
      <button type="button" className="mini-btn" onClick={() => toggleCollapse(k)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${label}`} disabled={!count} style={{ minWidth: 26, padding: 0 }}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Syllabus manager</div>
          <h1>{track?.label ?? "Syllabus"}</h1>
          <p>Paper → Subject → Topic → Micro-theme. Drag the handles to reorder; new items start as drafts.</p>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <TrackPicker commissions={commissions} value={trackKey} />
          <button type="button" className="btn btn-primary" onClick={() => track && setEditing({ level: "paper", parentId: track.id })}>
            <ListPlus size={17} aria-hidden /> Add paper
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {tree === null ? (
        <div className="panel muted">Loading syllabus…</div>
      ) : tree.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title={`${track?.label} has no syllabus yet`}
          action={
            <button type="button" className="btn btn-primary" onClick={() => track && setEditing({ level: "paper", parentId: track.id })}>
              <ListPlus size={17} aria-hidden /> Add the first paper
            </button>
          }
        >
          Start with a paper (Prelims or Mains), then add its subjects, topics and micro-themes.
        </EmptyState>
      ) : (
        <section className="panel">
          <SortableList
            items={tree}
            onReorder={reorder("paper")}
            render={(paper, handle) => (
              <div>
                <div className="tree-item level-paper">
                  {handle(paper.title)}
                  {toggle(`p${paper.id}`, paper.title, paper.subjects.length)}
                  <span className={`badge ${paper.stage === "mains" ? "badge-primary" : ""}`}>{stageLabel(paper.stage)}</span>
                  {paper.code && <span className="code-chip">{paper.code}</span>}
                  <span className="t-title">{paper.title}</span>
                  <StatusBadge status={paper.status} />
                  {actions("paper", paper)}
                </div>
                {!collapsed.has(`p${paper.id}`) && paper.subjects.length > 0 && (
                  <div className="tree-children">
                    <SortableList
                      items={paper.subjects}
                      onReorder={reorder("subject")}
                      render={(subject, handle) => (
                        <div>
                          <div className="tree-item">
                            {handle(subject.title)}
                            {toggle(`s${subject.id}`, subject.title, subject.topics.length)}
                            {subject.code && <span className="code-chip">{subject.code}</span>}
                            <span className="t-title">
                              <b>{subject.title}</b>
                            </span>
                            <StatusBadge status={subject.status} />
                            {actions("subject", subject)}
                          </div>
                          {!collapsed.has(`s${subject.id}`) && subject.topics.length > 0 && (
                            <div className="tree-children">
                              <SortableList
                                items={subject.topics}
                                onReorder={reorder("topic")}
                                render={(topic, handle) => (
                                  <div>
                                    <div className="tree-item">
                                      {handle(topic.title)}
                                      {toggle(`t${topic.id}`, topic.title, topic.micro_themes.length)}
                                      <span className="t-title">{topic.title}</span>
                                      <StatusBadge status={topic.status} />
                                      {actions("topic", topic)}
                                    </div>
                                    {!collapsed.has(`t${topic.id}`) && topic.micro_themes.length > 0 && (
                                      <div className="tree-children">
                                        <SortableList
                                          items={topic.micro_themes}
                                          onReorder={reorder("micro_theme")}
                                          render={(mt, handle) => (
                                            <div className="tree-item">
                                              {handle(mt.title)}
                                              <span className="code-chip">{mt.code}</span>
                                              <span className="t-title">{mt.title}</span>
                                              <span className="row hide-mobile" style={{ gap: 4 }}>
                                                <PriorityBadge priority={mt.priority} />
                                                {mt.estimated_minutes ? <span className="small muted">{mt.estimated_minutes}m</span> : null}
                                                {mt.is_dual_stage && <span className="badge badge-neutral">P+M</span>}
                                                <span className="small muted" title="Notes written">
                                                  {mt.note_kinds.length}/3 notes
                                                </span>
                                              </span>
                                              <StatusBadge status={mt.status} />
                                              {actions("micro_theme", mt)}
                                            </div>
                                          )}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    />
                  </div>
                )}
              </div>
            )}
          />
        </section>
      )}

      {editing && (
        <NodeForm
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            toast(msg, "success");
            await reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${LABEL[deleting.level]}?`}
          message={
            <>
              <b>{deleting.node.title}</b>
              {deleting.level === "micro_theme"
                ? " and its notes, videos and glossary will be deleted. Mapped PYQs stay but become unmapped."
                : " and everything inside it (sub-levels, notes, videos, glossary) will be deleted. Mapped PYQs stay but become unmapped."}{" "}
              This can&apos;t be undone.
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await clientApi(`/manage/${ENDPOINT[deleting.level]}/${deleting.node.id}/`, { method: "DELETE" });
              toast(`Deleted ${deleting.node.title}`, "success");
              setDeleting(null);
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

/** Next micro-theme code from the siblings' pattern, e.g. PRE-PI-HC-006 → PRE-PI-HC-007. */
function suggestCode(level: Level, parent: AnyNode): string | undefined {
  if (level !== "micro_theme" || !("micro_themes" in parent)) return undefined;
  const last = parent.micro_themes[parent.micro_themes.length - 1]?.code;
  const m = last?.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}` : undefined;
}

function NodeForm({ editing, onClose, onSaved }: { editing: NonNullable<Editing>; onClose: () => void; onSaved: (msg: string) => void }) {
  const { level, node, parentId } = editing;
  const isNew = !node;
  const n = (node ?? {}) as Partial<PaperNode & MicroThemeNode>;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: String(f.get("title") ?? "").trim(),
      code: String(f.get("code") ?? "").trim(),
    };
    if (isNew) {
      body[PARENT[level]] = parentId;
      body.status = f.get("status") ?? "draft";
    }
    if (level === "paper") {
      body.stage = f.get("stage");
      body.description = f.get("description");
    }
    if (level === "micro_theme") {
      body.priority = f.get("priority");
      body.estimated_minutes = f.get("estimated_minutes") ? Number(f.get("estimated_minutes")) : null;
      body.is_dual_stage = f.get("is_dual_stage") === "on";
    }
    setBusy(true);
    setErrors({});
    try {
      await clientApi(`/manage/${ENDPOINT[level]}/${isNew ? "" : `${node!.id}/`}`, { method: isNew ? "POST" : "PATCH", json: body });
      onSaved(`${isNew ? "Added" : "Saved"} ${LABEL[level]} “${body.title}”`);
    } catch (err) {
      const b = err instanceof ClientApiError ? err.body : null;
      const fe: Record<string, string> = {};
      if (b) for (const [k, v] of Object.entries(b)) fe[k] = Array.isArray(v) ? v.join(" ") : String(v);
      setErrors(Object.keys(fe).length ? fe : { detail: (err as Error).message });
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  return (
    <Modal
      title={`${isNew ? "Add" : "Edit"} ${LABEL[level]}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="node-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      <form id="node-form" className="form-grid" onSubmit={submit} noValidate>
        {errors.detail && <div className="alert alert-error full">{errors.detail}</div>}
        {errors.non_field_errors && <div className="alert alert-error full">{errors.non_field_errors}</div>}
        <div className="field full">
          <label htmlFor="nf-title">Title</label>
          <input id="nf-title" name="title" className="input" defaultValue={n.title ?? ""} required maxLength={255} />
          {err("title")}
        </div>
        <div className="field">
          <label htmlFor="nf-code">{level === "micro_theme" ? "Code (unique in this track)" : "Short code (optional)"}</label>
          <input
            id="nf-code"
            name="code"
            className="input"
            defaultValue={n.code ?? editing.suggestedCode ?? ""}
            placeholder={level === "micro_theme" ? "PRE-PI-HC-001" : level === "paper" ? "PI" : ""}
            required={level === "micro_theme"}
            maxLength={40}
            style={{ textTransform: level === "micro_theme" ? "uppercase" : undefined }}
          />
          {err("code")}
        </div>
        {level === "paper" && (
          <div className="field">
            <label htmlFor="nf-stage">Stage</label>
            <select id="nf-stage" name="stage" className="select" defaultValue={n.stage ?? "prelims"}>
              <option value="prelims">Prelims</option>
              <option value="mains">Mains</option>
            </select>
            {err("stage")}
          </div>
        )}
        {level === "micro_theme" && (
          <>
            <div className="field">
              <label htmlFor="nf-priority">Priority</label>
              <select id="nf-priority" name="priority" className="select" defaultValue={n.priority ?? ""}>
                <option value="">—</option>
                <option value="core">Core</option>
                <option value="important">Important</option>
                <option value="supporting">Supporting</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="nf-min">Estimated study minutes</label>
              <input id="nf-min" name="estimated_minutes" type="number" min={1} max={2000} className="input" defaultValue={n.estimated_minutes ?? ""} />
              {err("estimated_minutes")}
            </div>
            <label className="checkbox full">
              <input type="checkbox" name="is_dual_stage" defaultChecked={n.is_dual_stage ?? false} /> Counts for both Prelims and Mains
            </label>
          </>
        )}
        {level === "paper" && (
          <div className="field full">
            <label htmlFor="nf-desc">Description (optional)</label>
            <textarea id="nf-desc" name="description" className="textarea" defaultValue={(n as Partial<PaperNode>).description ?? ""} rows={3} />
          </div>
        )}
        {isNew && (
          <div className="field">
            <label htmlFor="nf-status">Status</label>
            <select id="nf-status" name="status" className="select" defaultValue="draft">
              <option value="draft">Draft (hidden from students)</option>
              <option value="published">Published</option>
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
}
