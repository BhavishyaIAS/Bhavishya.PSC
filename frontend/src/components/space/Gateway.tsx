import { ArrowRight, EyeOff } from "lucide-react";
import Link from "next/link";

import type { Commission } from "@/lib/types";

import { orbAttr } from "./destinations";
import { planetFor } from "./worlds";

/**
 * An examination, as a world you can travel to. The planet itself is drawn by the
 * renderer where the empty .gateway-orb sits (and brightens while the link is hovered
 * or focused); without WebGL the CSS sphere underneath shows instead.
 */
export function Gateway({ commission, index, size = "lg" }: { commission: Commission; index: number; size?: "lg" | "md" }) {
  const planet = planetFor(commission.slug, commission.theme, index);
  const exams = commission.tracks.map((t) => t.group_name);
  const css = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(" ")})`;
  return (
    <Link
      href={`/exams/${commission.slug}`}
      className={`gateway gateway-${size}`}
      data-orb-host
      aria-label={`${commission.short_name}: ${commission.name}. ${exams.join(", ")}`}
    >
      <span
        className={`gateway-orb ${planet.ring ? "has-ring" : ""}`}
        data-orb={orbAttr(planet)}
        style={{ ["--orb-a" as string]: css(planet.a), ["--orb-b" as string]: css(planet.b) }}
        aria-hidden
      />
      <span className="gateway-text">
        <span className="gateway-kicker">
          {commission.status === "draft" ? (
            <>
              <EyeOff size={12} aria-hidden /> Hidden from students
            </>
          ) : (
            `System ${String(index + 1).padStart(2, "0")}`
          )}
        </span>
        <span className="gateway-name">{commission.short_name}</span>
        <span className="gateway-full">{commission.name}</span>
        <span className="gateway-info">
          {exams.length > 0 ? exams.join("  ·  ") : "Being charted"}
        </span>
        <span className="gateway-enter">
          Enter <ArrowRight size={15} aria-hidden />
        </span>
      </span>
    </Link>
  );
}
