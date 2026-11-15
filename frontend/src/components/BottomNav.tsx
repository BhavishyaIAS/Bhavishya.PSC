"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { navItems, type NavExam } from "./nav-items";

/** Mobile bottom bar mirroring the main nav — reachable one-handed. */
export function BottomNav({ exams, isAdmin }: { exams: NavExam[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const items = navItems(exams, isAdmin);
  if (!isAdmin) {
    items.push({ href: "/search", label: "Search", short: "", icon: Search, match: (p: string) => p.startsWith("/search") });
  }
  return (
    <nav className="bottom-nav" aria-label="Main (mobile)">
      {items.map(({ href, label, short, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? "page" : undefined}>
          <Icon size={21} aria-hidden />
          {short || label}
        </Link>
      ))}
    </nav>
  );
}
