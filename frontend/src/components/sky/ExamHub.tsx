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

/** Where a module sits (as on the Classic page; on a phone a little further out above and below). */
function placeOf(tab: string, where: Where): Pt {
  const s = SPOKES.find((x) => x.tab === tab)!;
  return where === "wide" ? s.wide : [s.narrow[0], s.narrow[1] < 50 ? 9 : 88];
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
 * An examination on the Sky and Living home pages, as on the Classic one: its emblem as a sphere at the centre and its
 * four modules floating free around it (no lines), each a way straight in - in the Sky as portals of night space, in
 * Living as the look's emblems.
 */
export function ExamHub({ skin, commission, index }: { skin: Skin; commission: Commission; index: number }) {
  const group = commission.tracks[0]?.group;
  const base = group ? `/exams/${commission.slug}/${group}` : `/exams/${commission.slug}`;
  const groups = groupsLine(commission);
  const at = placeOf;
  return (
    <section
      className={`exam-hub exam-hub-${skin}`}
      aria-label={`${commission.short_name}: ${commission.name}`}
    >
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
          className={`hub-module ${at(s.tab, "wide")[1] < 50 ? "hub-module-top" : ""}`}
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
