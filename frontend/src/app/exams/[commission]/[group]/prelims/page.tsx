import type { Metadata } from "next";

import { PyqVault } from "@/components/pyq/PyqVault";

export const metadata: Metadata = { title: "Prelims PYQs" };

export default async function PrelimsTab(props: PageProps<"/exams/[commission]/[group]/prelims">) {
  const [{ commission, group }, searchParams] = await Promise.all([props.params, props.searchParams]);
  return <PyqVault commission={commission} group={group} stage="prelims" searchParams={searchParams} />;
}
