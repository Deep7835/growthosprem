import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { listProjects, PROJECT_COLORS } from "@/server/projects";
import { getSpaceContext } from "@/server/tenancy";
import { addProject, archiveProject, copyProject, editProject, previewDelete, removeProject } from "./actions";

export const metadata = { title: "Projects" };

/** SP-02 Projects tab (PRD 6.5). */
export default async function ProjectsSettingsPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/settings/projects">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const projects = await listProjects(ctx);
  return (
    <ProjectsClient
      base={`/o/${org}/s/${space}`}
      projects={projects}
      colors={PROJECT_COLORS}
      canManage={ctx.can("space.settings")}
      startOpen={query.new === "1"}
      add={addProject.bind(null, org, space)}
      edit={editProject.bind(null, org, space)}
      copy={copyProject.bind(null, org, space)}
      archive={archiveProject.bind(null, org, space)}
      preview={previewDelete.bind(null, org, space)}
      remove={removeProject.bind(null, org, space)}
    />
  );
}
