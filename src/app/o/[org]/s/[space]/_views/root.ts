import type { SpaceContext } from "@/server/tenancy";

export type Query = Record<string, string | string[] | undefined>;

/** Where a view's links point: the space, or the project inside it (PJ-02). */
export function viewRoot(ctx: SpaceContext) {
  const space = `/o/${ctx.org.slug}/s/${ctx.space.slug}`;
  return ctx.project ? `${space}/p/${ctx.project.id}` : space;
}
