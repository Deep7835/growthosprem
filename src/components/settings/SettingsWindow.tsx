import type { ReactNode } from "react";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { SettingsFrame } from "./SettingsFrame";

/** Server wrapper: loads what the settings window's navigation needs. */
export async function SettingsWindow({ org, children }: { org: string; children: ReactNode }) {
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  return (
    <SettingsFrame
      orgSlug={org}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      spaces={spaces.map((s) => ({ slug: s.slug, name: s.name, avatarColor: s.avatarColor }))}
      manageOrg={ctx.role === "owner" || ctx.role === "admin"}
    >
      {children}
    </SettingsFrame>
  );
}

/** Title and description at the top of a settings page. */
export function SettingsHeading({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export const settingsPage = "mx-auto flex w-full max-w-[920px] flex-col gap-6 px-4 py-6 pb-14 sm:px-8";
