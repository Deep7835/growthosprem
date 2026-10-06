"use client";

import { useActionState, useState } from "react";
import { PlatformLogo, StatusDot, buttonClass } from "@/components/ui";

function FirstComment({ initial, disabled }: { initial: string; disabled: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      First comment
      <textarea
        name="firstComment"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        maxLength={2200}
        placeholder="Hashtags or a line posted as the first comment, e.g. #cafe #delhi"
        className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-ink"
      />
      <span className="flex justify-between text-xs font-normal text-muted">
        <span>Posted as the first comment when Plotline publishes to Instagram (not on Stories).</span>
        <span>{value.length.toLocaleString("en-IN")} / 2,200</span>
      </span>
    </label>
  );
}

export function AutopostForm({
  space,
  statuses,
  canEdit,
  save,
}: {
  space: { autopostNewContent: boolean; requireClientApproval: boolean; editorsCanSchedule: boolean; postDefaults: { firstComment?: string; shareReelsToFeed?: boolean } };
  statuses: { id: string; name: string; color: string; category: string; autopostEligible: boolean }[];
  canEdit: boolean;
  save: (state: { saved?: boolean; error?: string }, form: FormData) => Promise<{ saved?: boolean; error?: string }>;
}) {
  const [state, action, pending] = useActionState(save, {});
  const toggle = (name: string, checked: boolean, title: string, body: string) => (
    <label className="flex items-start gap-3 px-4 py-3.5">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={!canEdit} className="mt-1 size-4 accent-ink" />
      <span>
        <strong className="block text-[15px]">{title}</strong>
        <span className="text-sm text-muted">{body}</span>
      </span>
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="divide-y divide-line-soft rounded-2xl border border-line bg-surface">
        {toggle("autopostNewContent", space.autopostNewContent, "Turn on autopost for new content", "New posts start with autopost on, so scheduled posts publish themselves. Each post can still switch it off.")}
        {toggle(
          "requireClientApproval",
          space.requireClientApproval,
          "Require client approval before publishing",
          "A post only publishes once the client approved its current version. Any edit after approval needs a new approval.",
        )}
        {toggle("editorsCanSchedule", space.editorsCanSchedule, "Editors can schedule and publish", "Off: only Managers and above schedule, post and retry.")}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Statuses that can autopost</h2>
        <p className="text-sm text-muted">A post publishes automatically only while it’s in one of these statuses. Usually just your “done” status.</p>
        <ul className="divide-y divide-line-soft rounded-2xl border border-line bg-surface">
          {statuses.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-3 px-4 py-2.5">
                <input type="checkbox" name="eligible" value={s.id} defaultChecked={s.autopostEligible} disabled={!canEdit} className="size-4 accent-ink" />
                <StatusDot color={s.color} />
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted">{s.category.replace("_", " ")}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Platform defaults</h2>
        <p className="text-sm text-muted">Applied when a post or a platform is added. Changing a default later doesn’t change existing posts.</p>
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <PlatformLogo platform="instagram" size={18} /> Instagram
          </p>
          <FirstComment initial={space.postDefaults.firstComment ?? ""} disabled={!canEdit} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="shareReelsToFeed" defaultChecked={space.postDefaults.shareReelsToFeed ?? true} disabled={!canEdit} className="mt-0.5 size-4 accent-ink" />
            <span>
              <strong className="block">Share Reels to the main feed</strong>
              <span className="text-muted">New Instagram Reels also appear on the profile grid. Each Reel can still change it.</span>
            </span>
          </label>
          <p className="border-t border-line-soft pt-3 text-xs text-muted">Facebook and LinkedIn have no defaults yet: Plotline doesn’t send titles or visibility settings to them.</p>
        </div>
      </section>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Saving…" : "Save autopost settings"}
          </button>
          {state.error && !pending && (
            <span role="alert" className="text-sm text-danger">
              {state.error}
            </span>
          )}
          {state.saved && !pending && (
            <span role="status" className="text-sm text-success-ink">
              Saved
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Only Managers and above can change these settings.</p>
      )}
    </form>
  );
}
