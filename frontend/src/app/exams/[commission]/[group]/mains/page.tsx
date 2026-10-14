import type { Metadata } from "next";

import { PyqVault } from "@/components/pyq/PyqVault";

export const metadata: Metadata = { title: "Mains PYQs" };

export default async function MainsTab(props: PageProps<"/exams/[commission]/[group]/mains">) {
  const [{ commission, group }, searchParams] = await Promise.all([props.params, props.searchParams]);
  return <PyqVault commission={commission} group={group} stage="mains" searchParams={searchParams} />;
}
