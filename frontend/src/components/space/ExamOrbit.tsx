import Link from "next/link";

import type { Commission } from "@/lib/types";

import { Globe } from "./Globe";
import { Portal } from "./Portal";

/** Where each world sits around the examination, in % of the orbit's box: on a wide screen and on a phone. */
interface Spoke {
  tab: string;
  world: string;
  name: string;
  wide: [number, number];
  narrow: [number, number];
}

const SPOKES: Spoke[] = [
  { tab: "materials", world: "mars", name: "Syllabus-Wise Notes", wide: [15, 25], narrow: [22, 13] },
  { tab: "prelims", world: "moon", name: "Prelims PYQs with Solutions", wide: [15, 77], narrow: [22, 79] },
  { tab: "mains", world: "jupiter", name: "Mains PYQs with Model Answers", wide: [85, 25], narrow: [78, 13] },
  { tab: "progress", world: "earth", name: "Track Your Progress", wide: [85, 77], narrow: [78, 79] },
];

function Lines({ which }: { which: "wide" | "narrow" }) {
  return (
    <svg className={`xs-lines xs-lines-${which}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {SPOKES.map((s, i) => {
        const [x, y] = s[which];
        return (
          <g key={s.tab} className={`xs-spoke xs-spoke-${s.world}`}>
            <line x1="50" y1="50" x2={x} y2={y} vectorEffect="non-scaling-stroke" />
            {/* a mote of light travelling out from the examination to the world */}
            <line
              className="xs-pulse"
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${i * 1.1}s` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * An examination on the home page as a small system: its emblem's sphere at the centre, a slow orbit around it,
 * and its four worlds out on spokes, each a way straight into that module (of the examination's first group).
 */
export function ExamOrbit({ commission, index }: { commission: Commission; index: number }) {
  const group = commission.tracks[0]?.group;
  const href = (tab: string) => (group ? `/exams/${commission.slug}/${group}/${tab}` : `/exams/${commission.slug}`);
  return (
    <section className="exam-system" aria-label={`${commission.short_name}: ${commission.name}`}>
      <Lines which="wide" />
      <Lines which="narrow" />
      <div className="xs-hub">
        <span className="xs-ring" aria-hidden />
        <Portal commission={commission} index={index} />
      </div>
      {SPOKES.map((s) => (
        <Link
          key={s.tab}
          href={href(s.tab)}
          className={`xs-world xs-world-${s.world}`}
          style={{
            ["--x" as string]: `${s.wide[0]}%`,
            ["--y" as string]: `${s.wide[1]}%`,
            ["--nx" as string]: `${s.narrow[0]}%`,
            ["--ny" as string]: `${s.narrow[1]}%`,
          }}
          data-warp
        >
          <Globe world={s.world} size={112} />
          <span className="xs-name">{s.name}</span>
        </Link>
      ))}
    </section>
  );
}
