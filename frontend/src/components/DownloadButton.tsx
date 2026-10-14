"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";

/** Asks the API for a short-lived signed link, then follows it. The file URL is never public. */
export function DownloadButton({ id, inline, label }: { id: number; inline?: boolean; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${inline ? "btn-ghost" : "btn-secondary"}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await clientApi<{ url: string }>(`/materials/${id}/link/`, { method: "POST" });
          if (inline) window.open(`${url}?inline=1`, "_blank", "noopener");
          else window.location.assign(url);
        } catch (err) {
          toast((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {inline ? <ExternalLink size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      {label ?? (inline ? "Open" : "Download")}
    </button>
  );
}
