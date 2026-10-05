import { and, desc, isNull } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { listMembers } from "@/db/members";
import { invites } from "@/db/schema";
import { InviteActions, InviteForm, MemberActions, ROLE_INFO } from "@/components/members/MembersClient";
import { canManageMembers } from "@/lib/permissions";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { inviteMembers, removeMemberAction, resendInvite, revokeInviteAction, updateAccess } from "./actions";

export const metadata = { title: "Members" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;

function ago(date: Date | null, now: number) {
  if (!date) return "Not yet";
  const minutes = Math.round((now - date.getTime()) / 60000);
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return f.format(-minutes, "minute");
  if (minutes < 60 * 48) return f.format(-Math.round(minutes / 60), "hour");
  return f.format(-Math.round(minutes / 1440), "day");
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

export default async function MembersPage({ params }: PageProps<"/o/[org]/settings/members">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const db = await getSystemDb();
  const [members, visibleSpaces, pending] = await Promise.all([
    listMembers(db, ctx.org.id),
    listVisibleSpaces(org),
    withOrg(ctx.org.id, (tx) =>
      tx
        .select()
        .from(invites)
        .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt)))
        .orderBy(desc(invites.createdAt)),
    ),
  ]);
  const manage = canManageMembers(ctx.role);
  const canInviteAny = manage || ctx.role === "manager";
  const spaceName = new Map(visibleSpaces.map((s) => [s.id, s.name]));
  const spaceOptions = visibleSpaces.map((s) => ({ id: s.id, name: s.name, avatarColor: s.avatarColor }));
  const now = ctx.requestTime;
  const spacesText = (role: string, ids: string[]) =>
    role === "owner" || role === "admin" ? "All spaces" : ids.map((id) => spaceName.get(id) ?? "Another space").join(", ") || "No spaces";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 pb-14">
      <div>
        <h1 className="font-display text-3xl font-bold">Members</h1>
        <p className="mt-1 text-muted">
          Everyone in {ctx.org.name}. Members only see the spaces they’ve been added to; Owners and Admins see all of them.
        </p>
      </div>

      {canInviteAny && (
        <InviteForm
          action={inviteMembers.bind(null, org)}
          spaces={spaceOptions}
          roles={manage ? ["admin", "manager", "editor"] : ["manager", "editor"]}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          People <span className="font-normal text-muted">· {members.length}</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-subtle text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Spaces</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-t border-line-soft align-top">
                  <td className="px-4 py-3">
                    <span className="block font-semibold">
                      {m.name}
                      {m.userId === ctx.user.id && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                    <span className="text-muted">{m.email}</span>
                  </td>
                  <td className="px-4 py-3">{ROLE_LABEL[m.role]}</td>
                  <td className="px-4 py-3 text-ink-2">{spacesText(m.role, m.spaceIds)}</td>
                  <td className="px-4 py-3 text-ink-2">{ago(m.lastActiveAt, now)}</td>
                  <td className="px-4 py-3">
                    {manage && m.role !== "owner" && m.userId !== ctx.user.id && (
                      <MemberActions
                        name={m.name}
                        role={m.role as keyof typeof ROLE_INFO}
                        spaceIds={m.spaceIds}
                        spaces={spaceOptions}
                        openPosts={m.openPosts}
                        openTasks={m.openTasks}
                        update={updateAccess.bind(null, org, m.userId)}
                        remove={removeMemberAction.bind(null, org, m.userId)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Pending invites <span className="font-normal text-muted">· {pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">No pending invites.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-subtle text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Spaces</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => {
                  const expired = inv.expiresAt.getTime() <= now;
                  const mine = manage || inv.invitedBy === ctx.user.id;
                  return (
                    <tr key={inv.id} className="border-t border-line-soft align-top">
                      <td className="px-4 py-3 font-semibold">{inv.email}</td>
                      <td className="px-4 py-3">{ROLE_LABEL[inv.role]}</td>
                      <td className="px-4 py-3 text-ink-2">{spacesText(inv.role, inv.spaceIds)}</td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">Expired {shortDate(inv.expiresAt)}</span>
                        ) : (
                          <span className="text-ink-2">
                            Sent {inv.lastSentAt ? shortDate(inv.lastSentAt) : shortDate(inv.createdAt)} · expires {shortDate(inv.expiresAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {mine && <InviteActions resend={resendInvite.bind(null, org, inv.id)} revoke={revokeInviteAction.bind(null, org, inv.id)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
