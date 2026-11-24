import { EyeOff } from "lucide-react";
import Link from "next/link";

import type { Commission } from "@/lib/types";

import { describeExams, emblemFor } from "./emblems";
import { planetFor } from "./worlds";

/**
 * An examination's portal on the home page: its official emblem as a sphere (the artwork itself, undistorted,
 * lit and shaded, with a turning rim of light), and its name beneath. Nothing else: the page is the doors.
 * The same examination also sits, small and fixed, on its own track beyond Pluto in the distant system behind.
 */
export function Portal({ commission, index }: { commission: Commission; index: number }) {
  const emblem = emblemFor(commission.slug);
  const tint = emblem ? emblem.tint : planetFor(commission.slug, commission.theme, index).a;
  const css = `rgb(${tint.map((v) => Math.round(v * 255)).join(" ")})`;
  const exams = describeExams(commission);
  return (
    <Link
      href={`/exams/${commission.slug}`}
      className="portal"
      aria-label={`${commission.short_name}: ${commission.name}`}
      data-portal={commission.slug}
      data-emblem={emblem?.src}
      data-tint={tint.join(",")}
      data-kind={commission.status === "draft" ? "Examination · hidden from students" : "Examination"}
      data-name={`${commission.short_name} · ${commission.name}`}
      data-text={`${exams}. Select to enter.`}
      style={{ ["--tint" as string]: css, ...(emblem ? { ["--emblem" as string]: `url(${emblem.src})` } : {}) }}
    >
      {/* the emblem as a sphere: lit from the upper left, a turning rim of light around it */}
      <span className="portal-orb" aria-hidden>
        <span className="portal-seal" />
      </span>
      <span className="portal-body">
        {commission.status === "draft" && (
          <span className="portal-hidden">
            <EyeOff size={11} aria-hidden /> Hidden from students
          </span>
        )}
        <span className="portal-name">{commission.short_name}</span>
      </span>
    </Link>
  );
}
