import { EyeOff } from "lucide-react";
import Link from "next/link";

import { ExamMark, ModuleMark } from "@/components/living/Mark";
import { SPOKES, type Spoke } from "@/components/space/ExamOrbit";
import type { Commission, Skin } from "@/lib/types";

function groupsLine(c: Commission) {
  const names = c.tracks.map((t) => t.group_name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Where = "wide" | "narrow";

/** Where a module sits: as on the Classic page, but on a phone further out above and below (the names are larger here). */
function pos(s: Spoke, where: Where): [number, number] {
  if (where === "wide") return s.wide;
  return [s.narrow[0], s.narrow[1] < 50 ? 9 : 88];
}

/**
 * A point along a spoke, in % of the box: straight for the Sky's constellation lines; for Living's branches an S-curve
 * (M 50 50 C m 50, m y, x y) that leaves the examination sideways and reaches the module from the side, clear of the
 * names beneath the marks.
 */
function along(s: Spoke, where: Where, t: number, curved: boolean): [number, number] {
  const [x, y] = pos(s, where);
  if (!curved) return [50 + (x - 50) * t, 50 + (y - 50) * t];
  const m = (50 + x) / 2, u = 1 - t;
  const bx = u * u * u * 50 + 3 * u * u * t * m + 3 * u * t * t * m + t * t * t * x;
  const by = u * u * u * 50 + 3 * u * u * t * 50 + 3 * u * t * t * y + t * t * t * y;
  return [bx, by];
}

function Spokes({ where, curved }: { where: Where; curved: boolean }) {
  return (
    <>
      <svg className={`hub-lines hub-lines-${where}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {SPOKES.map((s, i) => {
          const [x, y] = pos(s, where);
          const d = curved ? `M50 50 C${(50 + x) / 2} 50 ${(50 + x) / 2} ${y} ${x} ${y}` : `M50 50 L${x} ${y}`;
          return (
            <g key={s.tab} className="hub-spoke">
              <path d={d} vectorEffect="non-scaling-stroke" />
              <path className="hub-flow" d={d} pathLength={1} vectorEffect="non-scaling-stroke" style={{ animationDelay: `${i * -0.7}s` }} />
            </g>
          );
        })}
      </svg>
      {/* the Sky's stars on each line, Living's buds on each branch */}
      <span className={`hub-nodes hub-nodes-${where}`} aria-hidden>
        {SPOKES.flatMap((s, i) =>
          (curved ? [0.3, 0.7] : [0.4, 0.68]).map((t, k) => {
            const [px, py] = along(s, where, t, curved);
            return <span key={`${s.tab}${k}`} className="hub-node" style={{ left: `${px}%`, top: `${py}%`, animationDelay: `${(i * 2 + k) * 0.6}s` }} />;
          }),
        )}
      </span>
    </>
  );
}

/**
 * An examination on the Sky and Living home pages, laid out as on the Classic one: the examination at the centre,
 * its four modules around it — notes and prelims on the left, mains and progress on the right — each a way straight
 * in. Drawn in the look's own terms: in the Sky, portals of night space joined by constellation lines; in Living,
 * the look's emblems joined by branches along which something is always flowing.
 */
export function ExamHub({ skin, commission, index }: { skin: Skin; commission: Commission; index: number }) {
  const group = commission.tracks[0]?.group;
  const base = group ? `/exams/${commission.slug}/${group}` : `/exams/${commission.slug}`;
  const curved = skin === "living";
  const groups = groupsLine(commission);
  return (
    <section className={`exam-hub exam-hub-${skin}`} aria-label={`${commission.short_name}: ${commission.name}`}>
      <Spokes where="wide" curved={curved} />
      <Spokes where="narrow" curved={curved} />
      <Link href={base} className="hub-centre" data-warp aria-label={`Open ${commission.short_name}`}>
        <span className="hub-centre-mark">
          <ExamMark skin={skin} slug={commission.slug} index={index} size={200} />
        </span>
        <span className="hub-centre-text">
          {commission.status === "draft" && (
            <span className="hub-hidden">
              <EyeOff size={11} aria-hidden /> Hidden from students
            </span>
          )}
          <b className="hub-centre-name">{commission.short_name}</b>
          {groups && <span className="hub-centre-groups">{groups}</span>}
        </span>
      </Link>
      {SPOKES.map((s) => (
        <Link
          key={s.tab}
          href={group ? `${base}/${s.tab}` : base}
          className={`hub-module ${s.wide[1] < 50 ? "hub-module-top" : ""}`}
          style={{
            ["--x" as string]: `${s.wide[0]}%`,
            ["--y" as string]: `${s.wide[1]}%`,
            ["--nx" as string]: `${pos(s, "narrow")[0]}%`,
            ["--ny" as string]: `${pos(s, "narrow")[1]}%`,
          }}
          data-warp
        >
          <span className="hub-module-mark">
            <ModuleMark skin={skin} tab={s.tab} size={120} />
          </span>
          <span className="hub-module-name">{s.name}</span>
        </Link>
      ))}
    </section>
  );
}
