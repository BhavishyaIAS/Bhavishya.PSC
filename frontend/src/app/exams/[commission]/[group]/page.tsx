import { redirect } from "next/navigation";

export default async function WorkspaceIndex(props: PageProps<"/exams/[commission]/[group]">) {
  const { commission, group } = await props.params;
  redirect(`/exams/${commission}/${group}/materials`); // the first tab
}
