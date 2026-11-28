import Link from "next/link";

import type { Commission } from "@/lib/types";

import { Globe } from "./Globe";
import { Portal } from "./Portal";

/**
 * The four modules around an examination, and where each sits, in % of the box: on a wide screen and on a phone.
 * Shared by every look's home page (the Sky and Living ones build theirs from it too, see sky/ExamHub.tsx).
 */
export interface Spoke {
  tab: string;
  world: string;
  name: string;
  wide: [number, number];
  narrow: [number, number];
}

// placed symmetrically about the examination at the centre (50, 50): the same distance above and below, left and right
export const SPOKES: Spoke[] = [
  { tab: "materials", world: "mars", name: "Notes/Material", wide: [16, 24], narrow: [22, 15] },
  { tab: "prelims", world: "moon", name: "Prelims PYQs", wide: [16, 76], narrow: [22, 85] },
  { tab: "mains", world: "jupiter", name: "Mains PYQs", wide: [84, 24], narrow: [78, 15] },
  { tab: "progress", world: "earth", name: "Track Your Progress", wide: [84, 76], narrow: [78, 85] },
];

/**
 * An examination on the home page as a small system: its emblem's sphere at the centre, a slow orbit around it,
 * and its four worlds floating free in the space about it, symmetrically placed, each a way straight into that
 * module (of the examination's first group).
 */
export function ExamOrbit({ commission, index }: { commission: Commission; index: number }) {
  const group = commission.tracks[0]?.group;
  const href = (tab: string) => (group ? `/exams/${commission.slug}/${group}/${tab}` : `/exams/${commission.slug}`);
  return (
    <section className="exam-system" aria-label={`${commission.short_name}: ${commission.name}`}>
      <div className="xs-hub">
        <span className="xs-ring" aria-hidden />
        <Portal commission={commission} index={index} />
      </div>
      {SPOKES.map((s, i) => (
        <Link
          key={s.tab}
          href={href(s.tab)}
          className={`xs-world xs-world-${s.world}`}
          style={{
            ["--x" as string]: `${s.wide[0]}%`,
            ["--y" as string]: `${s.wide[1]}%`,
            ["--nx" as string]: `${s.narrow[0]}%`,
            ["--ny" as string]: `${s.narrow[1]}%`,
            ["--float-delay" as string]: `${i * -1.7}s`,
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
