import type { Metadata } from "next";

import { SyllabusManager } from "@/components/manage/SyllabusManager";
import { getCommissions } from "@/lib/catalog";

export const metadata: Metadata = { title: "Syllabus" };

export default async function ManageSyllabusPage(props: PageProps<"/manage/syllabus">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const first = commissions[0]?.tracks[0];
  const trackKey = typeof sp.track === "string" ? sp.track : first ? `${first.commission}/${first.group}` : "";
  return <SyllabusManager key={trackKey} commissions={commissions} trackKey={trackKey} />;
}
