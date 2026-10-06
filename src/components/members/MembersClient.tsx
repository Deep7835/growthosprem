"use client";

import { useActionState, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { InviteState, SentInvite } from "@/app/o/[org]/settings/members/actions";

export const ROLE_INFO = {
  admin: { label: "Admin", body: "Manages the whole organisation and is added to every space." },
  manager: { label: "Manager", body: "Runs the spaces they’re added to: accounts, settings, members, publishing." },
  editor: { label: "Editor", body: "Creates and edits posts and tasks. Can’t publish or change settings." },
} as const;
type RoleKey = keyof typeof ROLE_INFO;

interface SpaceOption {
  id: string;
  name: string;
  avatarColor: string;
}

function SpacePicker({ spaces, selected, onChange, disabled }: { spaces: SpaceOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const all = spaces.length > 0 && selected.length === spaces.length;
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-50">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold">Spaces</legend>
        <button type="button" onClick={() => onChange(all ? [] : spaces.map((s) => s.id))} className="text-[13px] font-semibold text-ink-2 underline">
          {all ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {spaces.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ink">
            <input
              type="checkbox"
              name="spaceIds"
              value={s.id}
              checked={selected.includes(s.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))}
              className="accent-ink"
            />
            <span className="grid size-5 place-items-center rounded text-[11px] font-bold" style={{ background: s.avatarColor }} aria-hidden>
              {s.name[0]}
            </span>
            {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`You're invited to join us on Plotline: ${link}`)}`}
        target="_blank"
        rel="noreferrer"
        className={buttonClass("secondary", "sm")}
      >
        Share on WhatsApp
      </a>
    </span>
  );
}

function ResultRow({ r }: { r: SentInvite }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-sm">
      <span>
        <strong>{r.email}</strong>{" "}
        <span className="text-muted">
          {r.status === "already-member"
            ? "is already a member"
            : r.emailed
              ? r.status === "renewed"
                ? "· invite renewed and emailed"
                : "· invite emailed"
              : `· invite created, not emailed (${r.reason})`}
        </span>
      </span>
      {r.link && <CopyLink link={r.link} />}
    </li>
  );
}

/** Invite dialog (TM-01): emails, role, spaces. */
export function InviteForm({
  action,
  spaces,
  roles,
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  spaces: SpaceOption[];
  roles: RoleKey[];
}) {
  const initialSpaces = spaces.length === 1 ? [spaces[0].id] : [];
  const [role, setRole] = useState<RoleKey>("editor");
  const [selected, setSelected] = useState<string[]>(initialSpaces);
  // The form clears itself after a successful send; clear the controlled choices with it.
  const [state, formAction, pending] = useActionState(async (prev: InviteState, formData: FormData) => {
    const next = await action(prev, formData);
    if (next?.results) {
      setRole("editor");
      setSelected(initialSpaces);
    }
    return next;
  }, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">Invite people</h2>
        <p className="text-sm text-muted">Invite links work for 7 days. People join with the email you invite.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Email addresses
        <textarea
          name="emails"
          required
          rows={2}
          placeholder="anjali@agency.in, rohit@agency.in"
          className="rounded-lg border border-line px-3 py-2 text-[15px] font-normal outline-none focus:border-ink"
        />
        <span className="text-xs font-normal text-muted">Separate several with commas.</span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Role</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {roles.map((key) => (
            <label key={key} className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="role" value={key} checked={role === key} onChange={() => setRole(key)} className="accent-ink" />
                {ROLE_INFO[key].label}
              </span>
              <span className="text-xs leading-relaxed text-muted">{ROLE_INFO[key].body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {role === "admin" ? (
        <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink-2">Admins are added to every space, including new ones.</p>
      ) : (
        <SpacePicker spaces={spaces} selected={selected} onChange={setSelected} />
      )}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={`${buttonClass("primary")} h-11 px-5`}>
          {pending ? "Sending invites…" : "Send invites"}
        </button>
      </div>
      {state?.results && (
        <div role="status" className="flex flex-col">
          <p className="text-sm font-semibold">Done</p>
          <ul>
            {state.results.map((r) => (
              <ResultRow key={r.email} r={r} />
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

/** Resend and Revoke for a pending invite (TM-02). */
export function InviteActions({ resend, revoke }: { resend: () => Promise<SentInvite>; revoke: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SentInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => run(async () => setResult(await resend()))} className={buttonClass("secondary", "sm")}>
          Resend
        </button>
        <button type="button" disabled={pending} onClick={() => run(revoke)} className={buttonClass("ghost", "sm")}>
          Revoke
        </button>
      </div>
      {result && (
        <div className="flex flex-col items-end gap-1.5 text-xs text-muted">
          <span>{result.emailed ? "New link emailed." : `New link created, not emailed (${result.reason}).`}</span>
          {result.link && <CopyLink link={result.link} />}
        </div>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Edit access and Remove for a member (TM-03). */
export function MemberActions({
  name,
  role,
  spaceIds,
  spaces,
  openPosts,
  openTasks,
  update,
  remove,
}: {
  name: string;
  role: RoleKey;
  spaceIds: string[];
  spaces: SpaceOption[];
  openPosts: number;
  openTasks: number;
  update: (formData: FormData) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [nextRole, setNextRole] = useState<RoleKey>(role);
  const [selected, setSelected] = useState(spaceIds);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
        setMode("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  if (mode === "idle") {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setMode("edit")} className={buttonClass("secondary", "sm")}>
          Edit access
        </button>
        <button type="button" onClick={() => setMode("remove")} className={buttonClass("ghost", "sm")}>
          Remove
        </button>
      </div>
    );
  }

  if (mode === "remove") {
    const work = [openPosts && `${openPosts} open post${openPosts === 1 ? "" : "s"}`, openTasks && `${openTasks} task${openTasks === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
    return (
      <div role="alertdialog" aria-label={`Remove ${name}`} className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-bg p-3 text-sm">
        <p className="text-danger">
          Remove {name}? They lose access straight away.{work ? ` Their ${work} will be unassigned.` : ""}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMode("idle")} className={buttonClass("ghost", "sm")}>
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={() => run(remove)} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-semibold text-white">
            {pending ? "Removing…" : `Remove ${name}`}
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <form action={(fd) => run(() => update(fd))} className="flex min-w-[320px] flex-col gap-3 rounded-xl border border-line bg-subtle p-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Role
        <select name="role" value={nextRole} onChange={(e) => setNextRole(e.target.value as RoleKey)} className="h-9 rounded-lg border border-line bg-surface px-2 font-normal">
          {(Object.keys(ROLE_INFO) as RoleKey[]).map((k) => (
            <option key={k} value={k}>
              {ROLE_INFO[k].label}
            </option>
          ))}
        </select>
      </label>
      {nextRole !== "admin" && <SpacePicker spaces={spaces} selected={selected} onChange={setSelected} />}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setMode("idle")} className={buttonClass("ghost", "sm")}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? "Saving…" : "Save access"}
        </button>
      </div>
    </form>
  );
}
