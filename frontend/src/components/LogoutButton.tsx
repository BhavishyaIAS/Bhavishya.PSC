"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";

export function LogoutButton({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      style={{ background: "rgba(16,44,90,.55)", color: "#fff", borderColor: "rgba(255,255,255,.35)" }}
      disabled={busy}
      title={`Signed in as ${name}`}
      onClick={async () => {
        setBusy(true);
        try {
          await clientApi("/auth/logout/", { method: "POST" });
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
    >
      <LogOut size={16} aria-hidden />
      <span className="hide-mobile">Log out</span>
    </button>
  );
}
