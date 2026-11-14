import type { Metadata } from "next";

import { ExamsManager, type ExamsData } from "@/components/manage/ExamsManager";
import { load } from "@/lib/server-api";

export const metadata: Metadata = { title: "Exams" };

export default async function ManageExamsPage() {
  return <ExamsManager initial={await load<ExamsData>("/manage/exams/", "/manage/exams")} />;
}
