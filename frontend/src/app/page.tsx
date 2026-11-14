import { ArrowRight, BookOpen, Target, TrendingUp } from "lucide-react";
import Link from "next/link";

import { brand } from "@/brand.config";
import { CommissionCard } from "@/components/CommissionCard";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";
import { trackPath } from "@/lib/format";
import { currentUser } from "@/lib/server-api";

/** The three words of the tagline are the three things a learner does here. */
const JOURNEY = [
  { word: "Prepare", icon: BookOpen, tab: "materials", text: "Read the notes topic by topic — comprehensive, prelims or mains — one chapter at a time." },
  { word: "Practice", icon: Target, tab: "prelims", text: "Try previous-year questions, check yourself and read the explanation." },
  { word: "Perform", icon: TrendingUp, tab: "progress", text: "Tick off what you've studied and watch your syllabus coverage grow." },
];

export default async function LandingPage() {
  const [commissions, user] = await Promise.all([getCommissions(), currentUser()]);
  const first = commissions[0]?.tracks.find((t) => t.has_content) ?? commissions[0]?.tracks[0];
  const firstName = user?.display_name?.split(" ")[0];

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">{brand.subtitle}</div>
          <h1 className="hero-title">{brand.heroTitle}</h1>
          <p className="hero-tagline" aria-label={brand.tagline}>
            {JOURNEY.map((j) => (
              <span key={j.word}>{j.word}</span>
            ))}
          </p>
          <p className="hero-lead">
            {firstName ? <b>Welcome back, {firstName}. </b> : null}
            Syllabus, notes, previous-year questions and your progress — in one calm place built for long hours of study.
          </p>
          <div className="row hero-cta">
            {user && first ? (
              <Link href={trackPath(first.commission, first.group)} className="btn btn-primary btn-lg">
                Continue with {first.label} <ArrowRight size={18} aria-hidden />
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Start preparing <ArrowRight size={18} aria-hidden />
                </Link>
                <Link href="/login" className="btn btn-ghost btn-lg">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
        {/* The 3D scene (open book, rising sparks, orbiting books) is drawn here by the backdrop. */}
        <div className="hero-stage" data-stage aria-hidden />
      </section>

      <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="section-title">
          Choose your exam
        </h2>
        {commissions.length === 0 ? (
          <EmptyState title="No examinations yet">
            The exam catalogue couldn&apos;t be loaded. If you&apos;re running locally, make sure the API is up and seeded.
          </EmptyState>
        ) : (
          <div className={`commission-grid ${commissions.length === 1 ? "single" : ""}`}>
            {commissions.map((c, i) => (
              <CommissionCard key={c.slug} commission={c} index={i} />
            ))}
          </div>
        )}
      </section>

      {first && (
        <section aria-labelledby="journey-h">
          <h2 id="journey-h" className="section-title">
            Three steps, every day
          </h2>
          <div className="journey">
            {JOURNEY.map((j, i) => (
              <Link key={j.word} href={trackPath(first.commission, first.group, j.tab)} className="journey-card">
                <span className="jc-num" aria-hidden>
                  {i + 1}
                </span>
                <span className="jc-icon" aria-hidden>
                  <j.icon size={26} />
                </span>
                <b>{j.word}</b>
                <span className="jc-text">{j.text}</span>
                <span className="jc-go">
                  Open <ArrowRight size={15} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
