"use client";

import { Check, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { clientApi } from "@/lib/client-api";

type General = { code: string; title: string; topic: string; subject: string; paper: string; questions: number | null };
export type LinkRow = {
  code: string;
  title: string;
  chapter: string;
  links: { id: number; status: "suggested" | "confirmed" | "rejected"; score: number; live: boolean; general: General }[];
};

/** One notes topic per row, with the general sections it is (or may be) linked to. */
export function LinksReview({ track, rows }: { track: string; rows: LinkRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<General[]>([]);

  async function review(ids: number[], status: string) {
    await clientApi("/manage/syllabus-links/review/", { method: "POST", json: { ids, status } });
    start(() => router.refresh());
  }
  async function search(text: string) {
    setQ(text);
    if (text.trim().length < 2) return setFound([]);
    const d = await clientApi<{ results: General[] }>(`/manage/syllabus-links/general/?${new URLSearchParams({ track, q: text })}`);
    setFound(d.results);
  }
  async function add(notes: string, general: string) {
    await clientApi("/manage/syllabus-links/", { method: "POST", json: { track, notes_code: notes, general_code: general } });
    setAdding(null);
    setQ("");
    setFound([]);
    start(() => router.refresh());
  }

  if (!rows.length) return <p className="muted">Nothing here: every topic of this subject has been reviewed.</p>;
  return (
    <div className={`links-review ${pending ? "is-busy" : ""}`}>
      {rows.map((r) => {
        const open = r.links.filter((l) => l.status === "suggested");
        return (
          <section key={r.code} className="panel links-row">
            <header className="links-row-head">
              <div style={{ minWidth: 0 }}>
                <span className="code-chip">{r.code}</span> <b>{r.title}</b>
                <div className="muted small">{r.chapter}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {open.length > 0 && (
                  <button type="button" className="mini-btn" onClick={() => review(open.map((l) => l.id), "confirmed")}>
                    <Check size={14} aria-hidden /> Confirm all {open.length}
                  </button>
                )}
                <button type="button" className="mini-btn" onClick={() => setAdding(adding === r.code ? null : r.code)}>
                  <Plus size={14} aria-hidden /> Add a link
                </button>
              </div>
            </header>
            {r.links.length === 0 && <p className="muted small">No suggestion. Add the sections this topic covers.</p>}
            <ul className="links-list">
              {r.links.map((l) => (
                <li key={l.id} className={`link-${l.status}`}>
                  <span className={`link-state link-state-${l.status}`}>
                    {l.status === "confirmed" ? "Confirmed" : l.status === "rejected" ? "Rejected" : l.live ? `Suggested · ${Math.round(l.score * 100)} · in use` : `Suggested · ${Math.round(l.score * 100)}`}
                  </span>
                  <span className="link-general">
                    <span className="code-chip">{l.general.code}</span> {l.general.title}
                    <span className="muted small">
                      {" "}
                      · {l.general.subject} › {l.general.topic} · {l.general.questions ?? 0} PYQ{l.general.questions === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {l.status !== "confirmed" && (
                      <button type="button" className="mini-btn" onClick={() => review([l.id], "confirmed")} aria-label={`Confirm the link to ${l.general.code}`}>
                        <Check size={14} aria-hidden /> Confirm
                      </button>
                    )}
                    {l.status !== "rejected" && (
                      <button type="button" className="mini-btn" onClick={() => review([l.id], "rejected")} aria-label={`Reject the link to ${l.general.code}`}>
                        <X size={14} aria-hidden /> Reject
                      </button>
                    )}
                    {l.status !== "suggested" && (
                      <button type="button" className="mini-btn" onClick={() => review([l.id], "suggested")} aria-label={`Undo the review of ${l.general.code}`}>
                        <RotateCcw size={14} aria-hidden /> Undo
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {adding === r.code && (
              <div className="links-add">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => void search(e.target.value)}
                  placeholder="Find a general-syllabus section by code or words, e.g. Kushan"
                  aria-label="Find a general-syllabus section"
                  autoFocus
                />
                {found.length > 0 && (
                  <ul className="links-found">
                    {found.map((g) => (
                      <li key={g.code}>
                        <button type="button" onClick={() => add(r.code, g.code)}>
                          <span className="code-chip">{g.code}</span> {g.title}
                          <span className="muted small"> · {g.topic} · {g.questions ?? 0} PYQs</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
