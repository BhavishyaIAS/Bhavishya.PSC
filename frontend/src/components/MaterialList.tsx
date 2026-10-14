import { Pencil } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/bits";
import { formatBytes, formatDate } from "@/lib/format";
import type { Material } from "@/lib/types";

import { DownloadButton } from "./DownloadButton";

function ext(name: string) {
  return (name.split(".").pop() || "file").slice(0, 4).toUpperCase();
}

export function MaterialList({ items, isAdmin }: { items: Material[]; isAdmin: boolean }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((m) => (
        <div key={m.id} className="file-card">
          <span className="file-icon" aria-hidden>
            {ext(m.original_filename)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <b style={{ color: "var(--text-strong)" }}>{m.title}</b>
              {isAdmin && <StatusBadge status={m.status} />}
            </div>
            {m.description && <div className="small muted">{m.description}</div>}
            <div className="small muted" style={{ marginTop: 4 }}>
              {m.mapping ? m.mapping.crumbs.join(" › ") : "Whole track"} · {formatBytes(m.size_bytes)} · {formatDate(m.created_at)}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {m.content_type === "application/pdf" && <DownloadButton id={m.id} inline />}
            <DownloadButton id={m.id} />
            {isAdmin && (
              <Link href={`/manage/materials?track=${m.track_info.commission}/${m.track_info.group}&edit=${m.id}`} className="mini-btn" aria-label={`Edit ${m.title}`}>
                <Pencil size={14} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
