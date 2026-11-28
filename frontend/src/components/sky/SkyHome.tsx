import Link from "next/link";

import { brand } from "@/brand.config";
import type { Commission, Skin, User } from "@/lib/types";

import { ExamHub } from "./ExamHub";
import { SkyGenesis } from "./SkyGenesis";

/**
 * The home page in the Sky and Living looks: the name, then each examination as on the Classic home page — the
 * examination at the centre and its four modules around it, each a way straight in (ExamHub), drawn in the look's
 * own terms. Behind it all, the Big Bang goes on (SkyGenesis).
 */
export function SkyHome({
  skin,
  commissions,
  user,
  eyebrow,
  isAdmin,
}: {
  skin: Skin;
  commissions: Commission[];
  user: User | null;
  eyebrow: string;
  isAdmin: boolean;
}) {
  return (
    <div className="page sky-home">
      {skin === "sky" && <SkyGenesis />}
      <div className="sky-first">
        <section className="sky-hero" aria-labelledby="sky-h">
          <div className="sky-eyebrow">{eyebrow}</div>
          <h1 id="sky-h">
            {brand.name} <span>{brand.suffix}</span>
          </h1>
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
          <nav className="exam-hubs" aria-label="Choose your examination">
            {commissions.map((c, i) => (
              <ExamHub key={c.slug} skin={skin} commission={c} index={i} />
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
    </div>
  );
}
