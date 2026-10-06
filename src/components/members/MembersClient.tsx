"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { InviteState, SentInvite } from "@/app/o/[org]/settings/members/actions";

export const ROLE_INFO = {
  admin: { label: "Admin", body: "Manages the whole organisation and is added to every space." },
  manager: { label: "Manager", body: "Runs the spaces they’re added to: accounts, settings, members, publishing." },
  editor: { label: "Editor", body: "Creates and edits posts and tasks. Can’t publish or change settings." },
} as const;
type RoleKey = keyof typeof ROLE_INFO;
const ROLE_ICON: Record<RoleKey, IconName> = { admin: "shield", manager: "users", editor: "pencil" };

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

/** Closes on an outside click or Esc; used by the pickers in the invite window. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", down);
    ref.current?.addEventListener("keydown", key);
    const el = ref.current;
    return () => {
      document.removeEventListener("pointerdown", down);
      el?.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

function RoleSelect({ roles, value, onChange }: { roles: RoleKey[]; value: RoleKey; onChange: (r: RoleKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <input type="hidden" name="role" value={value} />
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-[15px] hover:border-ink-2">
        <Icon name={ROLE_ICON[value]} className="text-muted" />
        <span className="flex-1">{ROLE_INFO[value].label}</span>
        <Icon name="chevronDown" className="text-muted" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Role" className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {roles.map((r) => (
            <li key={r} role="option" aria-selected={r === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-subtle ${r === value ? "bg-subtle" : ""}`}
              >
                <Icon name={ROLE_ICON[r]} className="mt-0.5 text-muted" />
                <span className="flex-1">
                  <b className="block text-sm">{ROLE_INFO[r].label}</b>
                  <span className="text-[13px] text-muted">{ROLE_INFO[r].body}</span>
                </span>
                {r === value && <Icon name="check" className="mt-0.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpaceMultiSelect({ spaces, selected, onChange }: { spaces: SpaceOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useDismiss(open, () => setOpen(false));
  const q = query.trim().toLowerCase();
  const shown = spaces.filter((s) => !q || s.name.toLowerCase().includes(q));
  const all = spaces.length > 0 && selected.length === spaces.length;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div ref={ref} className="relative">
      {selected.map((id) => (
        <input key={id} type="hidden" name="spaceIds" value={id} />
      ))}
      <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
        {selected.map((id) => {
          const sp = spaces.find((s) => s.id === id);
          if (!sp) return null;
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-md bg-subtle py-0.5 pl-1 pr-1 text-[13px]">
              <span aria-hidden className="grid size-4 place-items-center rounded text-[10px] font-bold" style={{ background: sp.avatarColor }}>
                {sp.name[0]}
              </span>
              {sp.name}
              <button type="button" aria-label={`Remove ${sp.name}`} onClick={() => toggle(id)} className="grid size-4 place-items-center rounded text-muted hover:text-ink">
                <Icon name="x" size={12} />
              </button>
            </span>
          );
        })}
        <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className="flex flex-1 items-center justify-between gap-2 px-1 text-left text-[15px] text-muted">
          {selected.length ? "" : "Choose spaces…"}
          <Icon name="chevronDown" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <label className="mb-1 flex h-9 items-center gap-2 rounded-lg bg-line-soft px-2 text-muted">
            <Icon name="search" size={14} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search spaces" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
          </label>
          <ul role="listbox" aria-multiselectable="true" aria-label="Spaces" className="max-h-56 overflow-y-auto">
            {!q && (
              <li>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-subtle">
                  <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : spaces.map((s) => s.id))} className="accent-ink" />
                  Select all
                </label>
              </li>
            )}
            {shown.map((s) => (
              <li key={s.id} role="option" aria-selected={selected.includes(s.id)}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-subtle">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} className="accent-ink" />
                  <span aria-hidden className="grid size-5 place-items-center rounded text-[11px] font-bold" style={{ background: s.avatarColor }}>
                    {s.name[0]}
                  </span>
                  {s.name}
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">No spaces match.</li>}
          </ul>
          <div className="mt-1 border-t border-line-soft pt-1">
            <button type="button" onClick={() => setOpen(false)} className={`${buttonClass("secondary", "sm")} w-full`}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Invite new member" and its window (TM-01): emails, a role with what it can do, and spaces. */
export function InviteButton({
  action,
  spaces,
  roles,
  title,
  presetSpaceIds = [],
  startOpen = false,
  label = "Invite new member",
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  spaces: SpaceOption[];
  roles: RoleKey[];
  /** "Invite to …": the organisation or the space it was opened from. */
  title: string;
  presetSpaceIds?: string[];
  startOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(startOpen);
  const [role, setRole] = useState<RoleKey>(roles.includes("editor") ? "editor" : roles[0]);
  const [selected, setSelected] = useState<string[]>(presetSpaceIds.length ? presetSpaceIds : spaces.length === 1 ? [spaces[0].id] : []);
  const [emails, setEmails] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [sentKey, setSentKey] = useState(0);
  const done = Boolean(state?.results) && sentKey > 0 && !pending;
  const ready = emails.trim().length > 0 && (role === "admin" || selected.length > 0);
  const reset = () => {
    setEmails("");
    setSentKey(0);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("secondary", "sm")} gap-1.5`}>
        <Icon name="userPlus" size={15} /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label={`Invite to ${title}`} className="relative w-full max-w-[560px] rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2.5">
              <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-sm font-bold text-ink">
                {title[0]}
              </span>
              <h2 className="flex-1 text-[16px] font-semibold">Invite to {title}</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
                <Icon name="x" />
              </button>
            </div>
            {done ? (
              <div role="status" className="flex flex-col gap-3">
                <ul>
                  {state!.results!.map((r) => (
                    <ResultRow key={r.email} r={r} />
                  ))}
                </ul>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={reset} className={buttonClass("secondary", "sm")}>
                    Invite more
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className={buttonClass("primary", "sm")}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form action={(fd) => {
                setSentKey((k) => k + 1);
                return formAction(fd);
              }} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Email
                  <textarea
                    name="emails"
                    required
                    rows={2}
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    placeholder="anjali@agency.in, rohit@agency.in"
                    className="rounded-lg border border-line px-3 py-2 text-[15px] font-normal outline-none focus:border-ink"
                  />
                  <span className="text-xs font-normal text-muted">Separate several with commas. Invite links work for 7 days.</span>
                </label>
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  Role
                  <RoleSelect roles={roles} value={role} onChange={setRole} />
                </div>
                {role === "admin" ? (
                  <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink-2">Admins are added to every space, including new ones.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 text-sm font-medium">
                    <span>
                      Add to space <span className="font-normal text-muted">(required)</span>
                    </span>
                    <SpaceMultiSelect spaces={spaces} selected={selected} onChange={setSelected} />
                  </div>
                )}
                {state?.error && (
                  <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                    {state.error}
                  </p>
                )}
                <div className="flex justify-end">
                  <button type="submit" disabled={pending || !ready} className={`${buttonClass("primary")} h-10 gap-2 px-5`}>
                    <Icon name="send" size={15} />
                    {pending ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
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
