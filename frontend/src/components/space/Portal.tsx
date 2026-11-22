import { ArrowRight, EyeOff } from "lucide-react";
import Link from "next/link";

import type { Commission } from "@/lib/types";

import { describeExams, emblemFor } from "./emblems";
import { planetFor } from "./worlds";

/** A line on what each examination leads to (an admin's own description is used for any other commission). */
const LINES: Record<string, string> = {
  upsc: "IAS, IPS, IFS and the other All India Services: Prelims, Mains and the Interview.",
  appsc: "Andhra Pradesh State Services: Group 1 and Group 2, from the Screening Test to the Mains.",
  tgpsc: "Telangana State Services: Group 1, Prelims and Mains, and the Group 2 examination.",
};

/**
 * An examination's portal on the home page: a slender, horizontal panel with the commission's sphere in a
 * window at its left (the renderer draws the official emblem's golf ball there, turning; without WebGL the
 * emblem shows flat), its name, what it covers, and the way in. The same examination also sits, small and
 * fixed, on its own track beyond Pluto in the distant system behind the page.
 */
export function Portal({ commission, index }: { commission: Commission; index: number }) {
  const emblem = emblemFor(commission.slug);
  const tint = emblem ? emblem.tint : planetFor(commission.slug, commission.theme, index).a;
  const css = `rgb(${tint.map((v) => Math.round(v * 255)).join(" ")})`;
  const exams = describeExams(commission);
  const line = LINES[commission.slug] ?? (commission.description ? commission.description.split(/(?<=\.)\s/)[0] : "");
  return (
    <Link
      href={`/exams/${commission.slug}`}
      className="portal"
      data-portal={commission.slug}
      data-emblem={emblem?.src}
      data-tint={tint.join(",")}
      data-kind={commission.status === "draft" ? "Examination · hidden from students" : "Examination"}
      data-name={`${commission.short_name} · ${commission.name}`}
      data-text={`${exams}. Select to enter.`}
      style={{ ["--tint" as string]: css, ...(emblem ? { ["--emblem" as string]: `url(${emblem.src.replace(/\.webp$/, "-s.webp")})` } : {}) }}
    >
      <span className="portal-window" aria-hidden>
        <span className="portal-orb" data-portal-orb />
      </span>
      <span className="portal-body">
        {commission.status === "draft" && (
          <span className="portal-hidden">
            <EyeOff size={11} aria-hidden /> Hidden from students
          </span>
        )}
        <span className="portal-name">{commission.short_name}</span>
        <span className="portal-full">{commission.name}</span>
        <span className="portal-exams">{exams}</span>
        {line && <span className="portal-line">{line}</span>}
        <span className="portal-go">
          Enter <ArrowRight size={14} aria-hidden />
        </span>
      </span>
    </Link>
  );
}
