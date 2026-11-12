import type { Metadata } from "next";

import { DocxImport } from "@/components/manage/DocxImport";
import { getCommissions } from "@/lib/catalog";

export const metadata: Metadata = { title: "Import notes" };

export default async function NotesImportPage(props: PageProps<"/manage/notes-import">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const first = commissions[0]?.tracks[0];
  const track = typeof sp.track === "string" ? sp.track : first ? `${first.commission}/${first.group}` : "";
  return <DocxImport commissions={commissions} initialTrack={track} />;
}
