import { Search } from "lucide-react";
import Link from "next/link";

import { brand } from "@/brand.config";
import type { User } from "@/lib/types";

import { HeaderSearch } from "./HeaderSearch";
import { LogoutButton } from "./LogoutButton";
import { MainNav } from "./MainNav";
import { ThemeToggle } from "./ThemeToggle";

/** Navigation left · logo centre stage · account actions right. */
export function Header({ user, commission }: { user: User | null; commission: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">{user && <MainNav commission={commission} isAdmin={user.role === "admin"} />}</div>

        <Link href="/" className="brand-mark" aria-label={`${brand.name} ${brand.suffix} — home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="brand-logo" width={60} height={60} />
          <div className="brand-words">
            <div className="brand-name">
              {brand.name}
              <span className="suffix"> {brand.suffix}</span>
            </div>
            <div className="brand-sub">{brand.tagline}</div>
          </div>
        </Link>

        <div className="topbar-actions">
          {user && (
            <>
              <HeaderSearch />
              <Link href="/search" className="icon-btn search-link" aria-label="Search notes, glossary and PYQs">
                <Search size={18} aria-hidden />
              </Link>
            </>
          )}
          <ThemeToggle />
          {user ? (
            <LogoutButton name={user.display_name} />
          ) : (
            <>
              <Link href="/login" className="btn btn-sm btn-ghost hide-mobile">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-sm btn-dark">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
