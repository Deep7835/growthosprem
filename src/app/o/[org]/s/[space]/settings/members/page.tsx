import { SpaceMembers } from "@/components/spaces/SpaceMembers";
import { spaceMemberList } from "@/server/spaces";
import { getSpaceContext } from "@/server/tenancy";
import { addMembers, removeMember } from "./actions";

export const metadata = { title: "Space members" };

/** SP-02 Members tab. Owners, Admins and the space's Managers manage it (PRD 4). */
export default async function SpaceMembersPage({ params }: PageProps<"/o/[org]/s/[space]/settings/members">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const { members, addable } = await spaceMemberList(ctx);
  return (
    <SpaceMembers
      spaceName={ctx.space.name}
      me={ctx.user.id}
      canManage={ctx.can("members.invite")}
      members={members}
      addable={addable}
      inviteHref={`/o/${org}/settings/members`}
      add={addMembers.bind(null, org, space)}
      remove={removeMember.bind(null, org, space)}
    />
  );
}
