// Role permissions from PRD section 4. Checked on the server for every request;
// the UI only uses the same function to hide controls.

export type Role = "owner" | "admin" | "manager" | "editor";

export type Action =
  | "org.billing"
  | "org.delete"
  | "space.create"
  | "space.archive"
  | "ai.budget"
  | "members.invite"
  | "accounts.connect"
  | "space.settings"
  | "content.view"
  | "content.edit"
  | "content.schedule"
  | "share.create"
  | "analytics.view"
  | "ai.use";

export interface SpaceScope {
  /** The user has been added to this space. */
  isSpaceMember: boolean;
  /** Space setting that lets Editors schedule and publish (open question in PRD 13; default off). */
  editorsCanSchedule: boolean;
}

const ORG_ONLY: Partial<Record<Action, Role[]>> = {
  "org.billing": ["owner"],
  "org.delete": ["owner"],
  "space.create": ["owner", "admin"],
  "space.archive": ["owner", "admin"],
  "ai.budget": ["owner", "admin"],
};

const IN_SPACE: Partial<Record<Action, Role[]>> = {
  "members.invite": ["manager"],
  "accounts.connect": ["manager"],
  "space.settings": ["manager"],
  "content.view": ["manager", "editor"],
  "content.edit": ["manager", "editor"],
  "content.schedule": ["manager"],
  "share.create": ["manager", "editor"],
  "analytics.view": ["manager", "editor"],
  "ai.use": ["manager", "editor"],
};

export function can(role: Role, action: Action, scope?: SpaceScope): boolean {
  const orgRoles = ORG_ONLY[action];
  if (orgRoles) return orgRoles.includes(role);

  // Owners and Admins are members of every space.
  if (role === "owner" || role === "admin") return true;
  if (!scope?.isSpaceMember) return false;

  if (action === "content.schedule" && role === "editor") return scope.editorsCanSchedule;
  return IN_SPACE[action]?.includes(role) ?? false;
}

export function canSeeSpace(role: Role, isSpaceMember: boolean): boolean {
  return role === "owner" || role === "admin" || isSpaceMember;
}

export type InviteRole = "admin" | "manager" | "editor";

/**
 * Who may invite whom (PRD 4, TM-01). Owners and Admins invite any role to any space.
 * Managers invite Managers and Editors, only to spaces they belong to. Managers and
 * Editors always need at least one space; Admins see every space.
 */
export function canInvite(inviter: Role, invite: { role: InviteRole; spaceIds: string[] }, inviterSpaceIds: string[]): boolean {
  if (invite.role !== "admin" && invite.spaceIds.length === 0) return false;
  if (inviter === "owner" || inviter === "admin") return true;
  if (inviter !== "manager" || invite.role === "admin") return false;
  return invite.spaceIds.every((id) => inviterSpaceIds.includes(id));
}

/** Changing roles and removing members: Owner and Admin only. The Owner can't be changed or removed here. */
export function canManageMembers(role: Role): boolean {
  return role === "owner" || role === "admin";
}
