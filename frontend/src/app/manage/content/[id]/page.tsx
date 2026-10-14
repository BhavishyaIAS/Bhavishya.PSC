import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentEditor } from "@/components/manage/ContentEditor";
import { NOTE_KINDS, type NoteKind } from "@/lib/types";

export const metadata: Metadata = { title: "Micro-theme content" };

export default async function ContentPage(props: PageProps<"/manage/content/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  const kind = (NOTE_KINDS.some((k) => k.key === sp.kind) ? sp.kind : "comprehensive") as NoteKind;
  return <ContentEditor key={id} id={Number(id)} initialKind={kind} />;
}
