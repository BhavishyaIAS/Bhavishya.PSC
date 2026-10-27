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
          {"short" in item && item.short ? (
            <>
              <span className="full">{item.label}</span>
              <span className="short">{String(item.short)}</span>
            </>
          ) : (
            item.label
          )}
        </Link>
      ))}
    </nav>
  );
}
