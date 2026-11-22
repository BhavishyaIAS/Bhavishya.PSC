import type { Metadata } from "next";

import { MoonPhase } from "@/components/MoonPhase";
import { PyqVault } from "@/components/pyq/PyqVault";

export const metadata: Metadata = { title: "Prelims PYQs" };

export default async function PrelimsTab(props: PageProps<"/exams/[commission]/[group]/prelims">) {
  const [{ commission, group }, searchParams] = await Promise.all([props.params, props.searchParams]);
  return (
    <>
      {/* the lunar facility's window: the Moon's real phase tonight (or on any chosen date) */}
      <MoonPhase />
      <PyqVault commission={commission} group={group} stage="prelims" searchParams={searchParams} />
    </>
  );
}
