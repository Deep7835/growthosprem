import { InviteButton } from "@/components/members/MembersClient";
import { SpaceMembers } from "@/components/spaces/SpaceMembers";
import { canManageMembers } from "@/lib/permissions";
import { spaceMemberList } from "@/server/spaces";
import { getSpaceContext } from "@/server/tenancy";
import { inviteMembers } from "@/app/o/[org]/settings/members/actions";
import { addMembers, removeMember } from "./actions";

export const metadata = { title: "Space members" };

/** SP-02 Members tab. Owners, Admins and the space's Managers manage it (PRD 4). */
export default async function SpaceMembersPage({ params }: PageProps<"/o/[org]/s/[space]/settings/members">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const { members, addable } = await spaceMemberList(ctx);
  const canManage = ctx.can("members.invite");
  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <InviteButton
            action={inviteMembers.bind(null, org)}
            spaces={[{ id: ctx.space.id, name: ctx.space.name, avatarColor: ctx.space.avatarColor }]}
            roles={canManageMembers(ctx.role) ? ["admin", "manager", "editor"] : ["manager", "editor"]}
            title={ctx.space.name}
            presetSpaceIds={[ctx.space.id]}
          />
        </div>
      )}
      <SpaceMembers
        spaceName={ctx.space.name}
        me={ctx.user.id}
        canManage={canManage}
        members={members}
        addable={addable}
        inviteHref={`/o/${org}/settings/members?invite=1&space=${ctx.space.id}`}
        add={addMembers.bind(null, org, space)}
        remove={removeMember.bind(null, org, space)}
      />
    </div>
  );
}
