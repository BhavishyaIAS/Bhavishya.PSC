import Link from "next/link";

import { brand } from "@/brand.config";
import type { Commission, User } from "@/lib/types";

import { examPortal, MODULES } from "./portals";
import { SkyPortal } from "./SkyPortal";

/** "Andhra Pradesh Public Service Commission" → "Andhra Pradesh"; "Union Public Service Commission" → "Union". */
function region(name: string) {
  return name.replace(/\s*Public Service Commission.*$/i, "").trim() || name;
}

function groupsLine(c: Commission) {
  const names = c.tracks.map((t) => t.group_name);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The home page in the Sky style: the name, then one gateway per examination, each a round portal
 * of night space; below, the five portals every exam opens into.
 */
export function SkyHome({
  commissions,
  user,
  eyebrow,
  lead,
  isAdmin,
}: {
  commissions: Commission[];
  user: User | null;
  eyebrow: string;
  lead: string;
  isAdmin: boolean;
}) {
  return (
    <div className="page sky-home">
      <div className="sky-first">
        <section className="sky-hero" aria-labelledby="sky-h">
          <div className="sky-eyebrow">{eyebrow}</div>
          <h1 id="sky-h">
            {brand.name} <span>{brand.suffix}</span>
          </h1>
          <p>{lead}</p>
        </section>

        {commissions.length === 0 ? (
          <div className="sky-panel">
            <b>No examinations yet.</b>{" "}
            {isAdmin ? (
              <>
                Add your first exam from{" "}
                <Link className="link" href="/manage/exams">
                  Manage → Exams
                </Link>
                .
              </>
            ) : (
              "Exams are being set up. Please check back soon."
            )}
          </div>
        ) : (
          <nav className="sky-gates" aria-label="Choose your examination">
            {commissions.map((c, i) => (
              <Link
                key={c.slug}
                href={
                  c.tracks[0]
                    ? `/exams/${c.slug}/${c.tracks[0].group}`
                    : `/exams/${c.slug}`
                }
                className="sky-gate"
                data-warp
              >
                <SkyPortal kind={examPortal(c.slug, i)} size={168} />
                <div>
                  <div className="sky-eyebrow">{region(c.name)}</div>
                  <h2>{c.short_name}</h2>
                  {groupsLine(c) && (
                    <div className="sky-full">{groupsLine(c)}</div>
                  )}
                  <p>{c.description || c.name}</p>
                  <span className="sky-enter">
                    {c.slug === "upsc"
                      ? "Enter the wormhole"
                      : "Open the portal"}
                  </span>
                </div>
              </Link>
            ))}
          </nav>
        )}

        {!user && (
          <p className="sky-cta">
            <Link href="/signup" className="btn btn-primary">
              Start preparing
            </Link>
            <Link href="/login" className="link">
              I have an account
            </Link>
          </p>
        )}
      </div>

      {commissions.length > 0 && (
        <section className="sky-features" aria-labelledby="sky-features-h">
          <h2 id="sky-features-h">Inside every exam</h2>
          <ul>
            {MODULES.map((m) => (
              <li key={m.tab}>
                <b>{m.name}</b>
                <span>{m.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
