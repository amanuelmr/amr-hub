import { redirect } from "next/navigation";

export default async function ProjectCyclesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${encodeURIComponent(projectId)}/backlog`);
}
