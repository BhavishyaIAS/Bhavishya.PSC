"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Admins' way into the admin area (the only menu entry left in the top bar). */
export function ManageLink() {
  const active = usePathname().startsWith("/manage");
  return (
    <Link href="/manage" className="btn btn-sm btn-ghost logout-btn manage-link hide-mobile" aria-current={active ? "page" : undefined}>
      <Settings size={16} aria-hidden /> Manage
    </Link>
  );
}
