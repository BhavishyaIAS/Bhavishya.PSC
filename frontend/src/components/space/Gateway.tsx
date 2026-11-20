import { ArrowRight, EyeOff } from "lucide-react";
import Link from "next/link";

import type { Commission } from "@/lib/types";

import { orbAttr } from "./destinations";
import { describeExams, emblemFor } from "./emblems";
import { planetFor } from "./worlds";

/**
 * An examination, as a gateway in deep space: a glass sphere holding the commission's official
 * emblem (drawn by Universe.tsx where the empty .gateway-orb sits; it turns, drifts on its orbit
 * and brightens while the link is hovered or focused), with the name and what it leads to beneath.
 * Without WebGL the CSS shows the emblem flat in a glossy disc.
 */
export function Gateway({ commission, index }: { commission: Commission; index: number }) {
  const emblem = emblemFor(commission.slug);
  const planet = planetFor(commission.slug, commission.theme, index);
  const orb = emblem ? orbAttr({ a: emblem.tint, b: emblem.tint, kind: 0, ring: false }) : orbAttr(planet);
  const css = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(" ")})`;
  const tint = emblem ? `rgb(${emblem.tint.map((v) => Math.round(v * 255)).join(" ")})` : css(planet.a);
  return (
    <Link
      href={`/exams/${commission.slug}`}
      className={`gateway ${emblem ? "has-emblem" : ""}`}
      data-orb-host
      aria-label={`${commission.short_name}: ${commission.name}. ${describeExams(commission)}`}
    >
      <span
        className={`gateway-orb ${!emblem && planet.ring ? "has-ring" : ""}`}
        data-orb={orb}
        data-emblem={emblem?.src}
        style={{
          ["--orb-a" as string]: tint,
          ["--orb-b" as string]: emblem ? tint : css(planet.b),
          ...(emblem ? { ["--emblem" as string]: `url(${emblem.src.replace(/\.webp$/, "-s.webp")})` } : {}),
        }}
        aria-hidden
      />
      <span className="gateway-text">
        {commission.status === "draft" && (
          <span className="gateway-kicker">
            <EyeOff size={12} aria-hidden /> Hidden from students
          </span>
        )}
        <span className="gateway-name">{commission.short_name}</span>
        <span className="gateway-full">{commission.name}</span>
        <span className="gateway-desc">{describeExams(commission)}</span>
        <span className="gateway-enter">
          Enter <ArrowRight size={15} aria-hidden />
        </span>
      </span>
    </Link>
  );
}
