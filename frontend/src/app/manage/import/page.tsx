import type { Metadata } from "next";

import { BulkImport } from "@/components/manage/BulkImport";
import { getCommissions } from "@/lib/catalog";

export const metadata: Metadata = { title: "Bulk upload" };

export default async function ImportPage(props: PageProps<"/manage/import">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const first = commissions[0]?.tracks[0];
  const track = typeof sp.track === "string" ? sp.track : first ? `${first.commission}/${first.group}` : "";
  return <BulkImport commissions={commissions} initialTrack={track} initialStage={sp.stage === "mains" ? "mains" : "prelims"} />;
}
