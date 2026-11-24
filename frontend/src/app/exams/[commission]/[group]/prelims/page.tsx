import type { Metadata } from "next";

import { MoonCorner } from "@/components/MoonPhase";
import { PyqVault } from "@/components/pyq/PyqVault";
import { getSkin } from "@/lib/skin";

export const metadata: Metadata = { title: "Prelims PYQs" };

export default async function PrelimsTab(props: PageProps<"/exams/[commission]/[group]/prelims">) {
  const [{ commission, group }, searchParams, skin] = await Promise.all([props.params, props.searchParams, getSkin()]);
  return (
    <>
      {/* tonight's Moon, small and quiet in the top-right corner, in the Classic look only */}
      {skin === "classic" && <MoonCorner />}
      <PyqVault commission={commission} group={group} stage="prelims" searchParams={searchParams} />
    </>
  );
}
