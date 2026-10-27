import { ArrowLeft, ArrowRight, ArrowUpRight, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { groupTheme } from "@/brand.config";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";
import { trackPath } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/exams/[commission]">): Promise<Metadata> {
  const { commission } = await props.params;
  return { title: `${commission.toUpperCase()} — Choose your group` };
}

const MODULES = [
  { label: "Syllabus Detailer", tab: "syllabus", adminOnly: true },
  { label: "Study Material", tab: "materials" },
  { label: "Prelims PYQs", tab: "prelims" },
  { label: "Mains PYQs", tab: "mains" },
  { label: "Progress Tracker", tab: "progress" },
];

const BLURBS: Record<string, (c: string) => string> = {
  "group-1": (c) =>
    `The complete ${c} Group 1 journey — from the prelims concepts through the descriptive mains papers and the interview.`,
  "group-2": (c) =>
    `Structured ${c} Group 2 preparation across the screening test and the main examination, mapped subject by subject.`,
};

export default async function ChooseGroupPage(props: PageProps<"/exams/[commission]">) {
  const { commission: slug } = await props.params;
  const [commissions, user] = await Promise.all([getCommissions(), currentUser()]);
  const commission = commissions.find((c) => c.slug === slug);
  if (!commission) notFound();
  const isAdmin = user?.role === "admin";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{commission.name}</div>
          <h1 className="display-light">Choose Your Group</h1>
        </div>
        <Link href="/" className="btn btn-secondary btn-lg">
          <ArrowLeft size={18} aria-hidden /> All exams
        </Link>
      </div>

      {commission.status === "draft" && (
        <div className="alert alert-info row" style={{ marginBottom: 18 }}>
          <EyeOff size={16} aria-hidden /> <b>Admin preview.</b> {commission.short_name} is hidden from students. Show it from{" "}
          <Link className="link" href="/manage">
            Manage → Dashboard
          </Link>
          .
        </div>
      )}

      <div className="grid-2">
        {commission.tracks.map((t, i) => {
          const theme = groupTheme(t.group, i);
          const blurb = BLURBS[t.group]?.(commission.short_name) ?? t.tagline;
          return (
            <article key={t.group} className="group-card" style={{ background: theme.gradient }}>
              <ArrowUpRight className="gc-arrow" size={30} aria-hidden />
              <h2>
                <Link href={trackPath(t.commission, t.group)} className="stretched">
                  {commission.short_name} · {t.group_name.toUpperCase()}
                </Link>
              </h2>
              <p>{blurb}</p>
              <div className="gc-pills">
                {MODULES.filter((m) => !m.adminOnly || isAdmin).map((m) => (
                  <Link key={m.tab} href={trackPath(t.commission, t.group, m.tab)} className="pill">
                    {m.label}
                  </Link>
                ))}
              </div>
              {!t.has_content && <span className="gc-soon">Content for this track is being prepared</span>}
              <span className="gc-enter" aria-hidden>
                ENTER {t.group_name.toUpperCase()} <ArrowRight size={20} />
              </span>
            </article>
          );
        })}
      </div>

      <nav aria-label="Breadcrumb" className="crumbs crumbs-center">
        <Link href="/">Home</Link> / <span>PSC</span> / <span>{commission.short_name}</span> / <span>Groups</span> /{" "}
        <span aria-current="page">Choose Your Group</span>
      </nav>
    </div>
  );
}
