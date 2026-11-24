import { ArrowLeft, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupCards } from "@/components/GroupCards";
import { orbAttr } from "@/components/space/destinations";
import { emblemFor } from "@/components/space/emblems";
import { planetFor } from "@/components/space/worlds";
import { EmptyState } from "@/components/ui/bits";
import { examPortal } from "@/components/sky/portals";
import { SkyPortal } from "@/components/sky/SkyPortal";
import { getCommissions } from "@/lib/catalog";
import { getSite } from "@/lib/site";
import { currentUser } from "@/lib/server-api";

export async function generateMetadata(props: PageProps<"/exams/[commission]">): Promise<Metadata> {
  const { commission } = await props.params;
  return { title: `${commission.toUpperCase()}: choose your exam` };
}

/** One examination's own system: its planet, close, and its exams in orbit around it. */
export default async function ChooseGroupPage(props: PageProps<"/exams/[commission]">) {
  const { commission: slug } = await props.params;
  const [commissions, user, site] = await Promise.all([getCommissions(), currentUser(), getSite()]);
  const index = commissions.findIndex((c) => c.slug === slug);
  const commission = commissions[index];
  if (!commission) notFound();
  const isAdmin = user?.role === "admin";
  const planet = planetFor(commission.slug, commission.theme, index);
  const emblem = emblemFor(commission.slug); // the official emblem, as a sphere

  return (
    <div className="page system">
      <header className="system-head">
        <div className="system-copy">
          <Link href="/" className="system-back">
            <ArrowLeft size={15} aria-hidden /> All examinations
          </Link>
          <div className="eyebrow">{commission.name}</div>
          <h1>{commission.short_name}</h1>
          <p>
            {commission.description || "Pick the service you are preparing for. Everything inside is arranged for that exam."}
          </p>
        </div>
        {/* the planet itself is drawn here by the renderer (in the Sky style, the exam's portal) */}
        {site.skin === "sky" ? (
          <SkyPortal kind={examPortal(commission.slug, index)} size={200} className="system-portal" />
        ) : emblem ? (
          <div
            className="system-orb has-emblem"
            data-orb={orbAttr({ a: emblem.tint, b: emblem.tint, kind: 0, ring: false })}
            data-emblem={emblem.src}
            style={{ ["--emblem" as string]: `url(${emblem.src})`, ["--orb-a" as string]: `rgb(${emblem.tint.map((v) => Math.round(v * 255)).join(" ")})` }}
            aria-hidden
          />
        ) : (
          <div className={`system-orb ${planet.ring ? "has-ring" : ""}`} data-orb={orbAttr(planet)} aria-hidden />
        )}
      </header>

      {commission.status === "draft" && (
        <div className="alert alert-info row" style={{ marginBottom: 18 }}>
          <EyeOff size={16} aria-hidden /> <b>Admin preview.</b> {commission.short_name} is hidden from students. Show it from{" "}
          <Link className="link" href="/manage">
            Manage → Dashboard
          </Link>
          .
        </div>
      )}

      <h2 className="section-title">Choose your exam</h2>
      {commission.tracks.length === 0 ? (
        <EmptyState title="No exams here yet">
          {isAdmin ? (
            <>
              Add Group 1, Group 2 or any other exam from{" "}
              <Link className="link" href="/manage/exams">
                Manage → Exams
              </Link>
              .
            </>
          ) : (
            "Exams for this commission are being set up. Check back soon."
          )}
        </EmptyState>
      ) : (
        <GroupCards commission={commission} sky={site.skin === "sky"} />
      )}

      <nav aria-label="Breadcrumb" className="crumbs crumbs-center">
        <Link href="/">Home</Link> / <span>{commission.short_name}</span> / <span aria-current="page">Choose your exam</span>
      </nav>
    </div>
  );
}
