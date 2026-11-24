import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { brand } from "@/brand.config";
import { GroupCards } from "@/components/GroupCards";
import { DESTINATIONS } from "@/components/space/destinations";
import { Portal } from "@/components/space/Portal";
import { Globe } from "@/components/space/Globe";
import { SkyHome } from "@/components/sky/SkyHome";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { getSkin } from "@/lib/skin";

/**
 * The arrival: the name, a distant Solar System behind the page (drawn by the renderer, see space/solar.ts,
 * the examinations fixed on their own tracks beyond Pluto), and in front the three examination portals.
 * Everything the old home page did is still here: the greeting, the admin's own
 * headline (Site settings), the dedicated-exam mode, and the way into each module.
 */
export default async function LandingPage() {
  const [commissions, user, site, skin] = await Promise.all([getCommissions(), currentUser(), getSite(), getSkin()]);
  // An admin can dedicate the platform to one exam (say UPSC): the home page then opens straight on it.
  const focus = site.focus ? commissions.find((c) => c.slug === site.focus) : undefined;
  const shown = focus ? [focus] : commissions;
  const isAdmin = user?.role === "admin";
  const firstName = user?.display_name?.split(" ")[0];
  const eyebrow = site.hero_eyebrow || (focus ? focus.name : firstName ? `Welcome back, ${firstName}` : "Civil services preparation");

  if (skin !== "classic") {
    return (
      <SkyHome
        skin={skin}
        commissions={shown}
        user={user}
        isAdmin={isAdmin}
        eyebrow={site.hero_eyebrow || (firstName ? `Welcome back, ${firstName}` : shown.map((c) => c.short_name).join(" · ") || "Civil services preparation")}
        lead={site.hero_lead || "Step through a gateway to find its syllabus, your notes, past papers and a record of how far you have come."}
      />
    );
  }

  return (
    <div className="landing landing-refined">
      <section className="hero" aria-labelledby="arrival-h">
        <div className="hero-head">
          <p className="hero-eyebrow">
            <span>{eyebrow}</span>
          </p>
          <h1 id="arrival-h" className="hero-title">
            {brand.name} <span>{brand.suffix}</span>
          </h1>
          <p className="hero-tagline">{brand.tagline}</p>
          <p className="hero-lead">{site.hero_lead || "Syllabus, notes, previous-year questions and your progress, for every examination."}</p>
        </div>

        {/* the distant Solar System fills the page behind this (Universe.tsx lays it out here) */}
        <div className="solar-band" data-solar-band aria-hidden />

        {shown.length === 0 ? (
          <div className="arrival-empty">
            <b>No examinations yet</b>
            {isAdmin ? (
              <span>
                Add your first exam from{" "}
                <Link className="link" href="/manage/exams">
                  Manage → Exams
                </Link>
                .
              </span>
            ) : (
              <span>Exams are being set up. Please check back soon.</span>
            )}
          </div>
        ) : (
          <nav className={`portals portals-${Math.min(shown.length, 3)}`} aria-label="Choose your examination">
            {shown.map((c, i) => (
              <Portal key={c.slug} commission={c} index={i} />
            ))}
          </nav>
        )}

        {!user && (
          <p className="hero-cta">
            <Link href="/signup" className="btn btn-primary">
              Start preparing <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/login" className="hero-cta-link">
              I have an account
            </Link>
          </p>
        )}
        <div className="solar-tip" data-solar-tip aria-hidden>
          <span className="solar-tip-kind" />
          <b className="solar-tip-name" />
          <span className="solar-tip-text" />
        </div>
      </section>

      {focus && (
        <section className="page landing-section" aria-labelledby="exams-h">
          <h2 id="exams-h" className="section-title">
            {focus.short_name} examinations
          </h2>
          {isAdmin && (
            <p className="muted small" style={{ marginTop: -8 }}>
              The platform is dedicated to {focus.short_name}; students see only this exam. Change it in{" "}
              <Link className="link" href="/manage/site">
                Manage → Site settings
              </Link>
              .
            </p>
          )}
          <GroupCards commission={focus} />
        </section>
      )}

      {shown.length > 0 && (
        <section id="worlds" className="page landing-section" aria-labelledby="worlds-h">
          <h2 id="worlds-h" className="section-title">
            Five worlds inside every exam
          </h2>
          <ul className="destinations">
            {DESTINATIONS.map((d, i) => (
              <li key={d.tab} className={`destination destination-${d.world}`}>
                <span className="destination-idx" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Globe world={d.world} size={54} />
                <span className="destination-place">{d.place}</span>
                <b>{d.long}</b>
                <span className="destination-text">{d.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
