import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";

import { brand } from "@/brand.config";
import { GroupCards } from "@/components/GroupCards";
import { DESTINATIONS } from "@/components/space/destinations";
import { Gateway } from "@/components/space/Gateway";
import { Globe } from "@/components/space/Globe";
import { getCommissions } from "@/lib/catalog";
import { trackPath } from "@/lib/format";
import { currentUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";

/**
 * The arrival. Deep space, the name, and the examinations as worlds to travel to.
 * Everything the old home page did is still here: the greeting, the admin's own
 * headline (Site settings), the dedicated-exam mode, and the way into each module.
 */
export default async function LandingPage() {
  const [commissions, user, site] = await Promise.all([getCommissions(), currentUser(), getSite()]);
  // An admin can dedicate the platform to one exam (say UPSC): the home page then opens straight on it.
  const focus = site.focus ? commissions.find((c) => c.slug === site.focus) : undefined;
  const shown = focus ? [focus] : commissions;
  const lead = focus ?? commissions[0];
  const first = lead?.tracks.find((t) => t.has_content) ?? lead?.tracks[0];
  const isAdmin = user?.role === "admin";
  const firstName = user?.display_name?.split(" ")[0];
  const eyebrow = site.hero_eyebrow || (focus ? focus.name : firstName ? `Welcome back, ${firstName}` : "Civil services preparation");

  return (
    <div className="landing">
      <section className="arrival" aria-labelledby="arrival-h">
        <p className="arrival-eyebrow">{eyebrow}</p>
        <h1 id="arrival-h" className="arrival-title">
          {brand.name} <span>{brand.suffix}</span>
        </h1>
        <p className="arrival-tagline">{brand.tagline}</p>
        <p className="arrival-lead">
          {site.hero_lead || "Syllabus, notes, previous-year questions and your progress. Choose your examination and begin."}
        </p>

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
          <nav className={`gateways gateways-${Math.min(shown.length, 4)}`} aria-label="Choose your examination">
            {shown.map((c, i) => (
              <Gateway key={c.slug} commission={c} index={i} />
            ))}
          </nav>
        )}

        <div className="arrival-cta">
          {user && first ? (
            <Link href={trackPath(first.commission, first.group)} className="btn btn-primary btn-lg">
              Continue with {first.label} <ArrowRight size={18} aria-hidden />
            </Link>
          ) : !user ? (
            <>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Start preparing <ArrowRight size={18} aria-hidden />
              </Link>
              <Link href="/login" className="btn btn-ghost btn-lg">
                Log in
              </Link>
            </>
          ) : null}
        </div>
        {first && (
          <a href="#worlds" className="arrival-more">
            Five worlds inside every exam <ChevronDown size={15} aria-hidden />
          </a>
        )}
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

      {first && (
        <section id="worlds" className="page landing-section" aria-labelledby="worlds-h">
          <h2 id="worlds-h" className="section-title">
            Five worlds inside every exam
          </h2>
          <div className="destinations">
            {DESTINATIONS.map((d, i) => (
              <Link key={d.tab} href={trackPath(first.commission, first.group, d.tab)} className={`destination destination-${d.world}`}>
                <span className="destination-idx" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Globe world={d.world} size={54} />
                <span className="destination-place">{d.place}</span>
                <b>{d.long}</b>
                <span className="destination-text">{d.blurb}</span>
                <span className="destination-go">
                  {first.label} <ArrowRight size={14} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
