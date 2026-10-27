"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import type { Commission, Status } from "@/lib/types";

/** Show or hide a whole commission (all its tracks and content) from students. */
export function CommissionVisibility({ commissions }: { commissions: Commission[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();

  async function set(c: Commission, status: Status) {
    setBusy(c.id);
    try {
      await clientApi(`/manage/commissions/${c.id}/`, { method: "PATCH", json: { status } });
      toast(`${c.short_name} is now ${status === "published" ? "visible to students" : "hidden from students"}`, "success");
      start(() => router.refresh());
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Commission</th>
            <th scope="col">Students</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((c) => {
            const visible = c.status === "published";
            return (
              <tr key={c.id}>
                <td>
                  <b>{c.short_name}</b> <span className="muted small">{c.name}</span>
                </td>
                <td>
                  {visible ? (
                    <span className="badge badge-success">
                      <Eye size={12} aria-hidden /> Visible
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <EyeOff size={12} aria-hidden /> Hidden (admins only)
                    </span>
                  )}
                </td>
                <td className="num">
                  <button
                    type="button"
                    className={`btn btn-sm ${visible ? "btn-ghost" : "btn-secondary"}`}
                    disabled={busy === c.id}
                    onClick={() => set(c, visible ? "draft" : "published")}
                  >
                    {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                    {visible ? "Hide from students" : "Show to students"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
