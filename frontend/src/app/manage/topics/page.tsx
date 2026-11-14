import type { Metadata } from "next";

import { TopicsManager } from "@/components/manage/TopicsManager";
import { getCommissions } from "@/lib/catalog";
import { load } from "@/lib/server-api";
import type { SyllabusTree } from "@/lib/types";

export const metadata: Metadata = { title: "Topics" };

export default async function ManageTopicsPage(props: PageProps<"/manage/topics">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const known = commissions.flatMap((c) => c.tracks.map((t) => `${t.commission}/${t.group}`));
  const trackKey = typeof sp.track === "string" && known.includes(sp.track) ? sp.track : (known[0] ?? "");
  const tree = trackKey ? await load<SyllabusTree>(`/tracks/${trackKey}/syllabus/`, "/manage/topics") : null;
  return <TopicsManager key={trackKey} commissions={commissions} trackKey={trackKey} papers={tree?.papers ?? []} />;
}
