import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import type { Status } from "@/lib/types";

export function ProgressBar({ value, label, thin }: { value: number; label?: string; thin?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`progress ${thin ? "progress-thin" : ""}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function StatTile({
  icon: Icon,
  value,
  label,
  progress,
}: {
  icon?: LucideIcon;
  value: React.ReactNode;
  label: string;
  progress?: number;
}) {
  return (
    <div className="stat">
      {Icon && (
        <div className="stat-icon" aria-hidden>
          <Icon size={20} />
        </div>
      )}
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {progress !== undefined && <ProgressBar value={progress} label={label} />}
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return status === "published" ? (
    <span className="badge badge-success">Published</span>
  ) : (
    <span className="badge badge-warning">Draft</span>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (!priority) return null;
  const cls = priority === "core" ? "badge-primary" : priority === "important" ? "badge" : "badge-neutral";
  return <span className={`badge ${cls}`}>{priority[0].toUpperCase() + priority.slice(1)}</span>;
}
