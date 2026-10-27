"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="topbar-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={16} aria-hidden />
      <label htmlFor="global-search" className="sr-only">
        Search notes, glossary and PYQs
      </label>
      <input id="global-search" type="search" placeholder="Search notes & PYQs" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
