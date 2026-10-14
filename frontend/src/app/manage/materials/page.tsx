import type { Metadata } from "next";

import { MaterialManager } from "@/components/manage/MaterialManager";
import { getCommissions } from "@/lib/catalog";
import { NOTE_KINDS, type NoteKind } from "@/lib/types";

export const metadata: Metadata = { title: "Study materials" };

export default async function MaterialsPage(props: PageProps<"/manage/materials">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const first = commissions[0]?.tracks[0];
  const trackKey = typeof sp.track === "string" ? sp.track : first ? `${first.commission}/${first.group}` : "";
  const category = (NOTE_KINDS.some((k) => k.key === sp.category) ? sp.category : "") as NoteKind | "";
  const edit = typeof sp.edit === "string" && /^\d+$/.test(sp.edit) ? Number(sp.edit) : null;
  return <MaterialManager key={`${trackKey}-${category}`} commissions={commissions} trackKey={trackKey} category={category} editId={edit} />;
}
