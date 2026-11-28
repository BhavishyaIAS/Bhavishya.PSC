import { EyeOff } from "lucide-react";
import Link from "next/link";

import { ExamMark, ModuleMark } from "@/components/living/Mark";
import { SPOKES } from "@/components/space/ExamOrbit";
import { emblemFor } from "@/components/space/emblems";
import type { Commission, Skin } from "@/lib/types";

function groupsLine(c: Commission) {
  const names = c.tracks.map((t) => t.group_name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Where = "wide" | "narrow";
type Pt = [number, number];

/**
 * The Living look's plant, in % of its box: the examination at its foot (the roots), a trunk rising from it, and
 * the four modules at the ends of its branches - two high, two lower - on a wide screen and on a phone.
 */
const PLANT: Record<Where, { hub: Pt; at: Record<string, Pt>; forks: { upper: number; lower: number }; roots: number }> = {
  wide: {
    hub: [50, 62],
    at: { materials: [25, 13], mains: [75, 13], prelims: [12, 42], progress: [88, 42] },
    forks: { upper: 28, lower: 46 },
    roots: 77,
  },
  narrow: {
    hub: [50, 60],
    at: { materials: [25, 8], mains: [75, 8], prelims: [17, 32], progress: [83, 32] },
    forks: { upper: 17, lower: 35 },
    roots: 72,
  },
};

/** Where a module sits in the Sky (as on the Classic page; on a phone a little further out above and below). */
function skyAt(tab: string, where: Where): Pt {
  const s = SPOKES.find((x) => x.tab === tab)!;
  return where === "wide" ? s.wide : [s.narrow[0], s.narrow[1] < 50 ? 9 : 88];
}

/** A branch: out of the trunk sideways, then on to the module, reaching it from the side. */
function branch([x, y]: Pt, fork: number) {
  return `M50 ${fork} C ${50 + (x - 50) * 0.35} ${fork}, ${50 + (x - 50) * 0.7} ${y}, ${x} ${y}`;
}

/** A point on that branch (for its leaves). */
function onBranch([x, y]: Pt, fork: number, t: number): Pt {
  const u = 1 - t;
  const c1: Pt = [50 + (x - 50) * 0.35, fork], c2: Pt = [50 + (x - 50) * 0.7, y];
  return [
    u * u * u * 50 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x,
    u * u * u * fork + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y,
  ];
}

function Plant({ where }: { where: Where }) {
  const p = PLANT[where];
  const top = Math.min(...Object.values(p.at).map(([, y]) => y)) + 6;
  const roots: Pt[] = [[30, 97], [40, 103], [50, 105], [60, 103], [70, 97]];
  const forkOf = (tab: string) => (p.at[tab][1] < 25 ? p.forks.upper : p.forks.lower);
  return (
    <>
      <svg className={`hub-lines hub-lines-${where} plant`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path className="plant-trunk" d={`M50 ${p.hub[1]} L50 ${top}`} vectorEffect="non-scaling-stroke" />
        {SPOKES.map((s) => (
          <path key={s.tab} className="plant-branch" d={branch(p.at[s.tab], forkOf(s.tab))} vectorEffect="non-scaling-stroke" />
        ))}
        {roots.map(([x, y], i) => (
          <path
            key={i}
            className="plant-root"
            d={`M50 ${p.roots} C ${50 + (x - 50) * 0.15} ${p.roots + 9}, ${50 + (x - 50) * 0.8} ${y - 10}, ${x} ${y}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span className={`hub-nodes hub-nodes-${where}`} aria-hidden>
        {SPOKES.flatMap((s, i) =>
          [0.45, 0.75].map((t, k) => {
            const [x, y] = onBranch(p.at[s.tab], forkOf(s.tab), t);
            return <span key={`${s.tab}${k}`} className="hub-node" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 2 + k) * 0.6}s` }} />;
          }),
        )}
      </span>
    </>
  );
}

/** The examination's own emblem as a sphere (as on the Classic page), or the look's mark where it has none. */
function Centre({ skin, commission, index }: { skin: Skin; commission: Commission; index: number }) {
  const emblem = emblemFor(commission.slug);
  if (!emblem) return <ExamMark skin={skin} slug={commission.slug} index={index} size={200} />;
  const tint = `rgb(${emblem.tint.map((v) => Math.round(v * 255)).join(" ")})`;
  return (
    <span className="portal-orb hub-emblem" style={{ ["--emblem" as string]: `url(${emblem.src})`, ["--tint" as string]: tint }}>
      <span className="portal-seal" />
    </span>
  );
}

/**
 * An examination on the Sky and Living home pages: its emblem and its four modules, each a way straight in. In the
 * Sky the modules are portals of night space floating free around the emblem; in Living they grow as a plant - the
 * examination at the foot with its roots, the modules at the ends of the branches.
 */
export function ExamHub({ skin, commission, index }: { skin: Skin; commission: Commission; index: number }) {
  const group = commission.tracks[0]?.group;
  const base = group ? `/exams/${commission.slug}/${group}` : `/exams/${commission.slug}`;
  const plant = skin === "living";
  const groups = groupsLine(commission);
  const at = (tab: string, where: Where): Pt => (plant ? PLANT[where].at[tab] : skyAt(tab, where));
  const hub = (where: Where): Pt => (plant ? PLANT[where].hub : [50, 50]);
  return (
    <section
      className={`exam-hub exam-hub-${skin}`}
      aria-label={`${commission.short_name}: ${commission.name}`}
      style={{
        ["--hx" as string]: `${hub("wide")[0]}%`,
        ["--hy" as string]: `${hub("wide")[1]}%`,
        ["--hnx" as string]: `${hub("narrow")[0]}%`,
        ["--hny" as string]: `${hub("narrow")[1]}%`,
      }}
    >
      {plant && <Plant where="wide" />}
      {plant && <Plant where="narrow" />}
      <Link href={base} className="hub-centre" data-warp aria-label={`Open ${commission.short_name}`}>
        <span className="hub-centre-mark">
          <Centre skin={skin} commission={commission} index={index} />
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
      {SPOKES.map((s, i) => (
        <Link
          key={s.tab}
          href={group ? `${base}/${s.tab}` : base}
          className={`hub-module ${at(s.tab, "wide")[1] < hub("wide")[1] - 20 ? "hub-module-top" : ""}`}
          style={{
            ["--x" as string]: `${at(s.tab, "wide")[0]}%`,
            ["--y" as string]: `${at(s.tab, "wide")[1]}%`,
            ["--nx" as string]: `${at(s.tab, "narrow")[0]}%`,
            ["--ny" as string]: `${at(s.tab, "narrow")[1]}%`,
            ["--float-delay" as string]: `${i * -1.7}s`,
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
