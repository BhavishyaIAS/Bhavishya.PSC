"use client";

import { FileQuestion, FileUp, FolderOpen, LayoutDashboard, ListTree, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/manage", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/manage/syllabus", label: "Syllabus & notes", icon: ListTree },
  { href: "/manage/questions", label: "PYQ manager", icon: FileQuestion },
  { href: "/manage/import", label: "Bulk upload", icon: FileUp },
  { href: "/manage/materials", label: "Study materials", icon: FolderOpen },
  { href: "/manage/users", label: "Users & roles", icon: Users },
];

export function ManageNav() {
  const pathname = usePathname();
  return (
    <nav className="manage-nav" aria-label="Manage">
      {ITEMS.map((i) => {
        const active = i.exact
          ? pathname === i.href
          : pathname.startsWith(i.href) || (i.href === "/manage/syllabus" && pathname.startsWith("/manage/content"));
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            <i.icon size={17} aria-hidden /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
