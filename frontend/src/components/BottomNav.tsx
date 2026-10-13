"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { navItems } from "./nav-items";

/** Mobile bottom bar mirroring the main nav — reachable one-handed. */
export function BottomNav({ commission, isAdmin }: { commission: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const items = navItems(commission, isAdmin);
  if (!isAdmin) {
    items.push({ href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") });
  }
  return (
    <nav className="bottom-nav" aria-label="Main (mobile)">
      {items.map(({ href, label, icon: Icon, match, ...rest }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? "page" : undefined}>
          <Icon size={21} aria-hidden />
          {"short" in rest && rest.short ? String(rest.short) : label}
        </Link>
      ))}
    </nav>
  );
}
