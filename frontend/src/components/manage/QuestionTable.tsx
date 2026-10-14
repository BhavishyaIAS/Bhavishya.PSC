"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import { stageLabel } from "@/lib/format";
import type { Question } from "@/lib/types";

export function QuestionTable({ rows }: { rows: (Question & { track_label?: string })[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function bulk(status: "draft" | "published") {
    try {
      const { updated } = await clientApi<{ updated: number }>("/manage/questions/bulk-status/", {
        method: "POST",
        json: { ids: [...selected], status },
      });
      toast(`${updated} question${updated === 1 ? "" : "s"} ${status === "published" ? "published" : "moved to draft"}`, "success");
      setSelected(new Set());
      start(() => router.refresh());
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 10, minHeight: 34 }} aria-live="polite">
        {selected.size > 0 ? (
          <>
            <b className="small">{selected.size} selected</b>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => bulk("published")} disabled={pending}>
              <Eye size={15} aria-hidden /> Publish
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => bulk("draft")} disabled={pending}>
              <EyeOff size={15} aria-hidden /> Unpublish
            </button>
          </>
        ) : (
          <span className="muted small">Select questions to publish or unpublish in bulk.</span>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              <th scope="col">Year · Paper · Q</th>
              <th scope="col">Question</th>
              <th scope="col">Micro-theme</th>
              <th scope="col">Stage</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${q.year} ${q.paper_label} Q${q.question_no}`}
                    checked={selected.has(q.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(q.id)) n.delete(q.id);
                        else n.add(q.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <b>{q.year}</b> · {q.paper_label} · Q{q.question_no}
                  {q.track_label && <div className="small muted">{q.track_label}</div>}
                </td>
                <td style={{ minWidth: 260 }}>
                  <span className="clamp-2">{q.text}</span>
                </td>
                <td>{q.micro_theme ? <span className="code-chip">{q.micro_theme.code}</span> : <span className="badge badge-warning">Unmapped</span>}</td>
                <td>
                  <span className={`badge ${q.stage === "mains" ? "badge-primary" : ""}`}>{stageLabel(q.stage)}</span>
                </td>
                <td>
                  <StatusBadge status={q.status} />
                </td>
                <td>
                  <Link href={`/manage/questions/${q.id}`} className="mini-btn" aria-label={`Edit ${q.year} ${q.paper_label} Q${q.question_no}`}>
                    <Pencil size={14} aria-hidden /> Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
