import type { Metadata } from "next";

import type { ExamsData } from "@/components/manage/ExamsManager";
import { SiteSettingsForm } from "@/components/manage/SiteSettingsForm";
import { load } from "@/lib/server-api";
import type { Site } from "@/lib/types";

export const metadata: Metadata = { title: "Site settings" };

export default async function ManageSitePage() {
  const [site, exams] = await Promise.all([load<Site>("/manage/site/", "/manage/site"), load<ExamsData>("/manage/exams/", "/manage/site")]);
  // Keyed by the focus, so the form starts fresh after dedicating / switching back.
  return <SiteSettingsForm key={`${site.focus}-${exams.results.length}`} site={site} exams={exams} />;
}
