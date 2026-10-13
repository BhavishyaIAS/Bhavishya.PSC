import { ArrowRight, ArrowUpRight, BarChart3, BookOpen, FileText, Layers, Library, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { themeFor } from "@/brand.config";
import { hasPublicAsset } from "@/lib/assets";
import { getCommissions } from "@/lib/catalog";

export async function generateMetadata(props: PageProps<"/exams/[commission]">): Promise<Metadata> {
  const { commission } = await props.params;
  return { title: `${commission.toUpperCase()} — Choose your group` };
}

const MODULES = [
  { icon: FileText, label: "Syllabus Map" },
  { icon: BarChart3, label: "Progress Tracker" },
  { icon: FileText, label: "Prelims PYQs" },
  { icon: Layers, label: "Mains PYQs" },
  { icon: BookOpen, label: "Materials" },
];

export default async function ChooseGroupPage(props: PageProps<"/exams/[commission]">) {
  const { commission: slug } = await props.params;
  const commissions = await getCommissions();
  const index = commissions.findIndex((c) => c.slug === slug);
  if (index < 0) notFound();
  const commission = commissions[index];
  const theme = themeFor(commission.slug, index, commission.short_name);
  const cover = hasPublicAsset(theme.cover) ? theme.cover : undefined;
  // Group 1 uses the commission's identity colour, Group 2 the brand secondary — two distinct blocks.
  const palettes = [
    `linear-gradient(135deg, ${theme.from} 0%, ${theme.via} 60%, ${theme.to} 100%)`,
    "linear-gradient(135deg, var(--brand-secondary) 0%, var(--brand-accent) 70%, #3b82f6 100%)",
  ];

  return (
    <div className="page">
      <section className="group-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img className="decor" src={cover} alt="" />}
        <div className="eyebrow">{commission.short_name} · Structured preparation ecosystem</div>
        <h1>
          Your Syllabus. Your Strategy. <em>Your Success.</em>
        </h1>
        <p>
          A structured preparation platform for {commission.name} Group 1 and Group 2. Access syllabus mapping, track your
          progress, practise with PYQs and learn with curated materials — all in one place.
        </p>
      </section>

      <div className="grid-2">
        {commission.tracks.map((t, i) => (
          <Link
            key={t.group}
            href={`/exams/${t.commission}/${t.group}`}
            className="group-block"
            style={{ background: palettes[i % 2] }}
          >
            <span className="gb-arrow" aria-hidden>
              <ArrowUpRight size={20} />
            </span>
            <div className="gb-head">
              <span className="gb-icon" aria-hidden>
                {i === 0 ? <BookOpen size={34} /> : <Target size={34} />}
              </span>
              <div>
                <h2>{t.group_name.toUpperCase()}</h2>
                <p>{t.tagline || `Complete preparation workspace for ${t.label}.`}</p>
              </div>
            </div>
            <div className="pill-row">
              {MODULES.map((m) => (
                <span key={m.label} className="pill">
                  <m.icon size={14} aria-hidden /> {m.label}
                </span>
              ))}
            </div>
            <span className="btn btn-white btn-lg enter" style={{ color: i === 0 ? theme.ink : "var(--brand-accent)" }}>
              ENTER {t.group_name.toUpperCase()} <ArrowRight size={18} aria-hidden />
            </span>
            {!t.has_content && <span className="small" style={{ opacity: 0.9 }}>Content for this track is being prepared.</span>}
          </Link>
        ))}
      </div>

      <div className="feature-strip">
        {[
          { icon: Target, t: "Structured Syllabus Coverage", s: "Topic-wise mapping and resources" },
          { icon: BarChart3, t: "Track Your Progress", s: "Stay consistent and measure your preparation" },
          { icon: FileText, t: "Practice with PYQs", s: "Year-wise, paper-wise, subject-wise questions" },
          { icon: Library, t: "Curated Study Materials", s: "Comprehensive, Prelims and Mains notes" },
        ].map((f) => (
          <div key={f.t}>
            <span className="fi" aria-hidden>
              <f.icon size={20} />
            </span>
            <div>
              <b>{f.t}</b>
              <span>{f.s}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
