import type { Metadata } from "next";

import { QuestionForm } from "@/components/manage/QuestionForm";
import { getCommissions } from "@/lib/catalog";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage(props: PageProps<"/manage/questions/new">) {
  const sp = await props.searchParams;
  const commissions = await getCommissions();
  const first = commissions[0]?.tracks[0];
  const trackKey = typeof sp.track === "string" ? sp.track : first ? `${first.commission}/${first.group}` : "";
  const stage = sp.stage === "mains" ? "mains" : "prelims";
  return <QuestionForm commissions={commissions} initial={{ trackKey, stage }} />;
}
