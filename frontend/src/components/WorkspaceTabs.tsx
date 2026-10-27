"use client";

import { BarChart3, BookOpen, FileText, Layers, ListTree } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { trackPath } from "@/lib/format";

export const WORKSPACE_TABS = [
  { slug: "syllabus", label: "Syllabus Detailer", icon: ListTree, adminOnly: true },
  { slug: "materials", label: "Material / Notes", icon: BookOpen },
  { slug: "prelims", label: "Prelims PYQs", icon: FileText },
  { slug: "mains", label: "Mains PYQs", icon: Layers },
  { slug: "progress", label: "Progress Tracker", icon: BarChart3 },
];

export function WorkspaceTabs({ commission, group, isAdmin }: { commission: string; group: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = WORKSPACE_TABS.filter((t) => !t.adminOnly || isAdmin);
  return (
    <nav className="tabs" aria-label="Workspace sections">
      {tabs.map((t, i) => {
        const href = trackPath(commission, group, t.slug);
        const active = pathname === href || pathname.startsWith(href + "/") || (t.slug === "materials" && pathname.includes("/micro/"));
        return (
          <Link key={t.slug} href={href} className="tab" aria-current={active ? "page" : undefined}>
            <t.icon size={17} aria-hidden />
            {i + 1}. {t.label}
            {t.adminOnly && <span className="tab-tag">Admin</span>}
          </Link>
        );
      })}
    </nav>
  );
}
