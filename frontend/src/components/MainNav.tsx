"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "./nav-items";

export function MainNav({ commission, isAdmin }: { commission: string; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="mainnav" aria-label="Main">
      {navItems(commission, isAdmin).map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.match(pathname) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
