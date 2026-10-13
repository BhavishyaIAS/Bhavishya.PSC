import Link from "next/link";

import { brand } from "@/brand.config";
import type { User } from "@/lib/types";

import { HeaderSearch } from "./HeaderSearch";
import { LogoutButton } from "./LogoutButton";
import { MainNav } from "./MainNav";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ user, commission }: { user: User | null; commission: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand-mark" aria-label={`${brand.name} ${brand.suffix} — home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="brand-logo" width={54} height={54} />
          <div>
            <div className="brand-name">
              {brand.name}
              <span className="suffix"> {brand.suffix}</span>
            </div>
            <div className="brand-sub">{brand.tagline}</div>
          </div>
        </Link>

        {user && <MainNav commission={commission} isAdmin={user.role === "admin"} />}

        <div className="topbar-actions">
          {user && <HeaderSearch />}
          <ThemeToggle />
          {user ? (
            <LogoutButton name={user.display_name} />
          ) : (
            <>
              <Link href="/login" className="btn btn-sm hide-mobile" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.5)" }}>
                Log in
              </Link>
              <Link href="/signup" className="btn btn-sm btn-white">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
