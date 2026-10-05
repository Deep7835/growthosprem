import { redirect } from "next/navigation";

/** A project opens on its Board. */
export default async function ProjectPage({ params }: PageProps<"/o/[org]/s/[space]/p/[project]">) {
  const { org, space, project } = await params;
  redirect(`/o/${org}/s/${space}/p/${project}/board`);
}
