import { Search } from "lucide-react";
import Link from "next/link";

import { brand } from "@/brand.config";
import type { User } from "@/lib/types";

import { HeaderSearch } from "./HeaderSearch";
import { LogoutButton } from "./LogoutButton";
import { ManageLink } from "./ManageLink";
import { SkyThemeSwitch } from "./sky/SkyThemeSwitch";
import { ThemeToggle } from "./ThemeToggle";

/** Logo left · the examinations · search · account actions right. Phones navigate with the bottom bar. */
export function Header({ user, exams = [], sky = false }: { user: User | null; exams?: { slug: string; short_name: string; tracks?: { group: string }[] }[]; sky?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand-mark" aria-label={`${brand.name} ${brand.suffix} — home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="brand-logo" width={72} height={72} />
          <div className="brand-words">
            <div className="brand-name">
              {brand.name}
              <span className="suffix"> {brand.suffix}</span>
            </div>
            <div className="brand-sub">{brand.tagline}</div>
          </div>
        </Link>

        {exams.length > 0 && (
          <nav className="topbar-exams" aria-label="Examinations">
            {exams.map((e) => (
              <Link key={e.slug} href={e.tracks?.[0] ? `/exams/${e.slug}/${e.tracks[0].group}` : `/exams/${e.slug}`}>
                {e.short_name}
              </Link>
            ))}
          </nav>
        )}

        <div className="topbar-center">{user && <HeaderSearch />}</div>

        <div className="topbar-actions">
          {user && (
            <Link href="/search" className="icon-btn search-link" aria-label="Search notes, glossary and PYQs">
              <Search size={18} aria-hidden />
            </Link>
          )}
          {user?.role === "admin" && <ManageLink />}
          {sky ? <SkyThemeSwitch /> : <ThemeToggle />}
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
