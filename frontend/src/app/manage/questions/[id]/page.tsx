import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuestionForm, type QuestionInitial } from "@/components/manage/QuestionForm";
import { getCommissions } from "@/lib/catalog";
import { load } from "@/lib/server-api";
import type { Question, TrackRef } from "@/lib/types";

export const metadata: Metadata = { title: "Edit question" };

type Detail = Omit<Question, "track"> & {
  track: TrackRef;
  micro_theme_code: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

export default async function EditQuestionPage(props: PageProps<"/manage/questions/[id]">) {
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [commissions, q] = await Promise.all([getCommissions(), load<Detail>(`/manage/questions/${id}/`, `/manage/questions/${id}`)]);
  const initial: QuestionInitial = {
    ...q,
    trackKey: `${q.track.commission}/${q.track.group}`,
    model_answer: q.model_answer,
  };
  return <QuestionForm key={q.id} commissions={commissions} initial={initial} />;
}
