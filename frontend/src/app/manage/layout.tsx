import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ManageNav } from "@/components/manage/ManageNav";
import { EmptyState } from "@/components/ui/bits";
import { requireUser } from "@/lib/server-api";

export const metadata: Metadata = { title: { default: "Manage", template: "%s · Manage" } };

/**
 * Admin area. This check only decides what to render — every /api/manage/*
 * call is independently refused by Django for non-admins.
 */
export default async function ManageLayout({ children }: LayoutProps<"/manage">) {
  const user = await requireUser("/manage");
  if (user.role !== "admin") {
    return (
      <div className="page page-narrow">
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to this area"
          action={
            <Link href="/" className="btn btn-primary">
              Back to your exams
            </Link>
          }
        >
          Content management is limited to administrators. If you think you should have access, ask an admin to change your
          role.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="manage-layout">
        <ManageNav />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
