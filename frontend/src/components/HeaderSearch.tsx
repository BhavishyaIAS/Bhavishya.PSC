"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box from anywhere (unless the reader is already typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      <input ref={input} id="global-search" type="search" placeholder="Search notes & PYQs" value={q} onChange={(e) => setQ(e.target.value)} />
      <kbd aria-hidden>/</kbd>
    </form>
  );
}
