"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { Facets, PaperNode } from "@/lib/types";

const KEYS = ["id", "year", "paper_label", "paper", "subject", "topic", "micro", "tag", "status", "q"] as const;

/** Filter bar for the PYQ vault. State lives in the URL, so results are shareable and server-rendered. */
export function PyqFilters({ facets, papers, isAdmin }: { facets: Facets; papers: PaperNode[]; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const get = (k: string) => params.get(k) ?? "";

  // Cascading syllabus selects: each level narrows the next.
  const paper = papers.find((p) => String(p.id) === get("paper"));
  const subjects = useMemo(() => (paper ? paper.subjects : papers.flatMap((p) => p.subjects)), [paper, papers]);
  const subject = subjects.find((s) => String(s.id) === get("subject"));
  const topics = useMemo(() => (subject ? subject.topics : subjects.flatMap((s) => s.topics)), [subject, subjects]);
  const topic = topics.find((t) => String(t.id) === get("topic"));
  const micros = topic ? topic.micro_themes : topics.flatMap((t) => t.micro_themes);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Changing a syllabus level clears the levels below it.
    const order = ["paper", "subject", "topic", "micro"];
    const changed = order.findIndex((k) => k in changes);
    if (changed >= 0) order.slice(changed + 1).forEach((k) => !(k in changes) && next.delete(k));
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const active = KEYS.some((k) => params.get(k));
  const select = (key: string, label: string, options: { value: string; label: string }[], all: string) => (
    <label>
      <span className="sr-only">{label}</span>
      <select className="select" value={get(key)} onChange={(e) => update({ [key]: e.target.value })} aria-label={label}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="filters" aria-busy={pending}>
      <form
        role="search"
        className="search-hero"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() });
        }}
      >
        <label htmlFor="pyq-q" className="sr-only">
          Search question text
        </label>
        <input
          id="pyq-q"
          className="input"
          type="search"
          placeholder="Search questions, options, keywords…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary btn-lg">
          <Search size={18} aria-hidden /> Search
        </button>
      </form>
      <div className="toolbar">
        {select("year", "Year", facets.years.map((y) => ({ value: String(y), label: String(y) })), "All years")}
        {select("paper_label", "Exam paper", facets.paper_labels.map((p) => ({ value: p, label: p })), "All exam papers")}
        {select("paper", "Syllabus paper", papers.map((p) => ({ value: String(p.id), label: p.title })), "All syllabus papers")}
        {select("subject", "Subject", subjects.map((s) => ({ value: String(s.id), label: s.title })), "All subjects")}
        {select("topic", "Topic", topics.map((t) => ({ value: String(t.id), label: t.title })), "All topics")}
        {select("micro", "Micro-theme", micros.map((m) => ({ value: m.code, label: `${m.code} · ${m.title}` })), "All micro-themes")}
        {select("tag", "Tag", facets.tags.map((t) => ({ value: t.tags__slug, label: `#${t.tags__name} (${t.n})` })), "All tags")}
        {isAdmin &&
          select("status", "Status", [
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ], "Any status")}
        {active && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              start(() => router.push(pathname, { scroll: false }));
            }}
          >
            <X size={16} aria-hidden /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
