"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { toast } from "@/components/Toaster";
import { Avatar, AvatarStack, PlatformLogo, buttonClass } from "@/components/ui";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import type { PanelExtras } from "@/server/content-ops";

type Cell = (change: { field: string; value: unknown }) => Promise<{ ok: boolean; error?: string }>;
type Status = { id: string; name: string; color: string; category: string };

const GROUPS = [
  ["not_started", "Not started"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["closed", "Closed"],
] as const;

const trigger = "flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-subtle disabled:hover:bg-transparent aria-expanded:bg-subtle";

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="mb-1 flex h-8 items-center gap-2 rounded-lg bg-line-soft px-2 text-muted">
      <Icon name="search" size={14} />
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
    </label>
  );
}

export function StatusChip({ status }: { status?: Status }) {
  if (!status) return <span className="text-muted">No status</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: status.color }}>
      {status.name}
    </span>
  );
}

/** Searchable status picker grouped by category (ST-01). */
export function StatusPicker({ statuses, current, disabled, move, manageHref }: { statuses: Status[]; current: string; disabled: boolean; move: (id: string) => Promise<void>; manageHref?: string | null }) {
  const [value, setValue] = useState(current);
  const [query, setQuery] = useState("");
  const [, start] = useTransition();
  const q = query.trim().toLowerCase();
  const pick = (id: string, close: () => void) => {
    close();
    if (id === value) return;
    const before = value;
    setValue(id);
    start(async () => {
      try {
        await move(id);
      } catch (e) {
        setValue(before);
        toast("error", "Couldn’t change the status", e instanceof Error ? e.message : undefined);
      }
    });
  };
  if (disabled) return <StatusChip status={statuses.find((s) => s.id === value)} />;
  return (
    <Popover label="Status" buttonClassName={trigger} panelClassName="left-0 top-full mt-1 w-64" button={<StatusChip status={statuses.find((s) => s.id === value)} />}>
      {(close) => (
        <div>
          <Search value={query} onChange={setQuery} placeholder="Find status…" />
          <div className="max-h-72 overflow-y-auto">
            {GROUPS.map(([cat, label]) => {
              const list = statuses.filter((s) => s.category === cat && (!q || s.name.toLowerCase().includes(q)));
              if (!list.length) return null;
              return (
                <div key={cat} className="py-1">
                  <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
                  {list.map((s) => (
                    <button key={s.id} type="button" onClick={() => pick(s.id, close)} className={menuItem}>
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 uppercase tracking-wide">{s.name}</span>
                      {s.id === value && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {manageHref && (
            <Link href={manageHref} className={`${menuItem} border-t border-line-soft`}>
              <Icon name="gear" size={14} /> Manage statuses
            </Link>
          )}
        </div>
      )}
    </Popover>
  );
}

export function AssigneePicker({ people, initial, disabled, edit }: { people: PanelExtras["members"]; initial: { id: string; name: string }[]; disabled: boolean; edit: Cell }) {
  const [ids, setIds] = useState(initial.map((a) => a.id));
  const [query, setQuery] = useState("");
  const [, start] = useTransition();
  const chosen = people.filter((p) => ids.includes(p.id));
  const q = query.trim().toLowerCase();
  const toggle = (id: string) => {
    const before = ids;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    start(async () => {
      const r = await edit({ field: "assignees", value: next });
      if (!r.ok) {
        setIds(before);
        toast("error", "Couldn’t change assignees", r.error);
      }
    });
  };
  const label = chosen.length ? <AvatarStack people={chosen} /> : <span className="text-muted">{disabled ? "Unassigned" : "Add assignees"}</span>;
  if (disabled) return label;
  return (
    <Popover label="Assignees" buttonClassName={trigger} panelClassName="left-0 top-full mt-1 w-64" button={label}>
      {() => (
        <div>
          <Search value={query} onChange={setQuery} placeholder="Search people…" />
          <ul className="max-h-64 overflow-y-auto">
            {people
              .filter((p) => !q || p.name.toLowerCase().includes(q))
              .map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-subtle">
                    <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} className="accent-ink" />
                    <Avatar name={p.name} size={22} />
                    {p.name}
                  </label>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}

export function ProjectPicker({ projects, initial, disabled, edit }: { projects: PanelExtras["projects"]; initial: string | null; disabled: boolean; edit: Cell }) {
  const [value, setValue] = useState(initial);
  const [, start] = useTransition();
  const current = projects.find((p) => p.id === value);
  const pick = (id: string | null, close: () => void) => {
    close();
    const before = value;
    setValue(id);
    start(async () => {
      const r = await edit({ field: "project", value: id });
      if (!r.ok) {
        setValue(before);
        toast("error", "Couldn’t change the project", r.error);
      }
    });
  };
  const label = current ? (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-full" style={{ background: current.color ?? "#9CA3AF" }} />
      {current.name}
    </span>
  ) : (
    <span className="text-muted">{disabled ? "No project" : "Add to a project"}</span>
  );
  if (disabled) return label;
  return (
    <Popover label="Project" buttonClassName={trigger} panelClassName="left-0 top-full mt-1 w-60" button={label}>
      {(close) => (
        <div className="flex flex-col">
          <button type="button" onClick={() => pick(null, close)} className={menuItem}>
            <span className="flex-1 text-muted">No project</span>
            {!value && <Icon name="check" size={14} />}
          </button>
          {projects.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p.id, close)} className={menuItem}>
              <span aria-hidden className="size-2 rounded-full" style={{ background: p.color ?? "#9CA3AF" }} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === value && <Icon name="check" size={14} />}
            </button>
          ))}
          {projects.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted">This space has no projects yet.</p>}
        </div>
      )}
    </Popover>
  );
}

export function TagsPicker({ initial, options, disabled, edit }: { initial: string[]; options: string[]; disabled: boolean; edit: Cell }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  const save = (next: string[]) => {
    const before = tags;
    setTags(next);
    start(async () => {
      const r = await edit({ field: "tags", value: next });
      if (!r.ok) {
        setTags(before);
        toast("error", "Couldn’t change tags", r.error);
      }
    });
  };
  const add = () => {
    const t = draft.trim().replace(/^#/, "");
    setDraft("");
    if (t && !tags.includes(t)) save([...tags, t]);
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5 px-2 py-1">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-[13px]">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => save(tags.filter((x) => x !== t))} className="text-muted hover:text-ink">
              <Icon name="x" size={12} />
            </button>
          )}
        </span>
      ))}
      {disabled ? (
        !tags.length && <span className="text-muted">No tags</span>
      ) : (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            list="post-tag-options"
            placeholder={tags.length ? "Add" : "Add tags"}
            aria-label="Add a tag"
            maxLength={40}
            className="h-7 w-24 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <datalist id="post-tag-options">
            {options
              .filter((o) => !tags.includes(o))
              .map((o) => (
                <option key={o} value={o} />
              ))}
          </datalist>
        </>
      )}
    </span>
  );
}

/** The panel's URL for another post, keeping the view behind it. */
const postHref = (closeHref: string, id: string) => `${closeHref}${closeHref.includes("?") ? "&" : "?"}content=${id}`;

/** Other posts made by repurposing the same post: one per platform. */
export function GroupRail({ siblings, closeHref }: { siblings: PanelExtras["siblings"]; closeHref: string }) {
  if (siblings.length < 2) return null;
  return (
    <nav aria-label="Repurposed group" className="flex flex-col gap-1.5 rounded-xl border border-line bg-subtle p-2">
      <p className="px-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Repurposed group · {siblings.length} posts</p>
      <div className="flex flex-wrap gap-1.5">
        {siblings.map((s) => (
          <Link
            key={s.id}
            href={postHref(closeHref, s.id)}
            scroll={false}
            aria-current={s.current ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] ${s.current ? "bg-surface font-semibold shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface"}`}
          >
            {s.kinds.map((k) => (
              <PlatformLogo key={k} platform={PLACEMENTS[k as PlacementKind].platform} size={14} />
            ))}
            {s.kinds.map((k) => PLACEMENTS[k as PlacementKind].short).join(", ") || "No platform"}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh]"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-[520px] rounded-2xl bg-surface p-5 text-ink shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex-1 text-[17px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const PERMISSION = { view: "Can view", comment: "Can comment", approve: "Can approve or ask for changes" } as const;
type Permission = keyof typeof PERMISSION;

function ShareDialog({
  title,
  siblings,
  currentId,
  links,
  share,
  revoke,
  onClose,
}: {
  title: string;
  siblings: PanelExtras["siblings"];
  currentId: string;
  links: PanelExtras["links"];
  share: (input: { ids: string[]; permission: Permission; expiresInDays: number | null }) => Promise<{ ok: true; url: string; count: number } | { ok: false; error: string }>;
  revoke: (linkId: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [ids, setIds] = useState([currentId]);
  const [permission, setPermission] = useState<Permission>("approve");
  const [expires, setExpires] = useState<number | null>(14);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast("success", "Link copied");
  };

  return (
    <Modal title={`Share “${title}”`} onClose={onClose}>
      {url ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Anyone with this link can open {ids.length === 1 ? "this post" : `these ${ids.length} posts`} without an account.</p>
          <div className="flex gap-2">
            <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-subtle px-3 text-sm" />
            <button type="button" onClick={() => copy(url)} className={`${buttonClass("primary")} h-10 gap-1.5 px-4`}>
              <Icon name="link" size={15} /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(`For your review: ${title}`)}&body=${encodeURIComponent(`Please have a look: ${url}`)}`} className={buttonClass("secondary", "sm")}>
              Share by email
            </a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Please have a look: ${url}`)}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              Share on WhatsApp
            </a>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className={buttonClass("ghost", "sm")}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await share({ ids, permission, expiresInDays: expires });
              if (r.ok) setUrl(r.url);
              else toast("error", "Couldn’t create the link", r.error);
            });
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-start gap-3 rounded-xl border border-line p-3">
            <Icon name="link" className="mt-0.5 text-muted" />
            <span className="flex-1">
              <b className="block text-sm">Anyone with the link</b>
              <span className="text-[13px] text-muted">No account needed. Internal comments and tasks stay private.</span>
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Access
              <select value={permission} onChange={(e) => setPermission(e.target.value as Permission)} className="h-10 rounded-lg border border-line bg-surface px-2">
                {(Object.keys(PERMISSION) as Permission[]).map((p) => (
                  <option key={p} value={p}>
                    {PERMISSION[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Link expires
              <select value={expires ?? "never"} onChange={(e) => setExpires(e.target.value === "never" ? null : Number(e.target.value))} className="h-10 rounded-lg border border-line bg-surface px-2">
                <option value={1}>In 1 day</option>
                <option value={7}>In 7 days</option>
                <option value={14}>In 14 days</option>
                <option value={30}>In 30 days</option>
                <option value="never">Never</option>
              </select>
            </label>
          </div>
          {siblings.length > 1 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">Posts in this link</legend>
              {siblings.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ink">
                  <input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} className="accent-ink" />
                  {s.kinds.map((k) => (
                    <PlatformLogo key={k} platform={PLACEMENTS[k as PlacementKind].platform} size={16} />
                  ))}
                  <span className="truncate">{s.kinds.map((k) => PLACEMENTS[k as PlacementKind].label).join(", ") || s.title}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={pending || ids.length === 0} className={`${buttonClass("primary")} h-10 px-5`}>
              {pending ? "Creating…" : "Create link"}
            </button>
          </div>
          {links.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
              <p className="text-sm font-medium">Links already shared</p>
              {links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="flex-1 text-muted">
                    {PERMISSION[l.permission]} · {l.expiresAt ? `expires ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(l.expiresAt))}` : "never expires"}
                  </span>
                  <button type="button" onClick={() => copy(`${origin}/review/${l.token}`)} className={buttonClass("ghost", "sm")}>
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      start(async () => {
                        const r = await revoke(l.id);
                        if (r.ok) toast("success", "Link turned off");
                        else toast("error", "Couldn’t turn the link off", r.error);
                      })
                    }
                    className={`${buttonClass("ghost", "sm")} hover:text-danger`}
                  >
                    Turn off
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

/** Share, Repurpose and the "···" menu in the post window's header. */
export function PostMenu(props: {
  title: string;
  contentId: string;
  kinds: PlacementKind[];
  grouped: boolean;
  canEdit: boolean;
  canShare: boolean;
  siblings: PanelExtras["siblings"];
  links: PanelExtras["links"];
  closeHref: string;
  share: (input: { ids: string[]; permission: Permission; expiresInDays: number | null }) => Promise<{ ok: true; url: string; count: number } | { ok: false; error: string }>;
  revoke: (linkId: string) => Promise<{ ok: boolean; error?: string }>;
  repurpose: () => Promise<{ ok: true; count: number } | { ok: false; error: string }>;
  duplicate: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  bulk: (ids: string[], action: { action: "archive" } | { action: "delete" }) => Promise<{ done: number; failed: { reason: string }[] }>;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"share" | "repurpose" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const siblings = props.siblings.length ? props.siblings : [{ id: props.contentId, title: props.title, kinds: props.kinds, current: true }];

  const runBulk = (action: "archive" | "delete") =>
    start(async () => {
      const r = await props.bulk([props.contentId], { action });
      if (r.done) {
        toast("success", action === "archive" ? "Post archived" : "Post deleted", action === "archive" ? "Restore it from the Table’s Archived filter." : undefined);
        router.push(props.closeHref, { scroll: false });
      } else toast("error", action === "archive" ? "Couldn’t archive it" : "Couldn’t delete it", r.failed[0]?.reason);
    });

  return (
    <>
      {props.canShare && (
        <button type="button" onClick={() => setDialog("share")} className={`${buttonClass("secondary", "sm")} gap-1.5`}>
          <Icon name="link" size={15} /> Share
        </button>
      )}
      {props.canEdit && props.kinds.length > 1 && (
        <button type="button" onClick={() => setDialog("repurpose")} className={`${buttonClass("secondary", "sm")} gap-1.5`} title="Make one post per platform">
          <Icon name="board" size={15} /> Repurpose
        </button>
      )}
      {props.canEdit && (
        <Popover label="More actions" buttonClassName="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-subtle aria-expanded:bg-subtle" panelClassName="right-0 top-full mt-1 w-52" button={<Icon name="more" size={18} />}>
          {(close) => (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  close();
                  start(async () => {
                    const r = await props.duplicate();
                    if (r.ok) {
                      toast("success", "Post duplicated", "You’re now looking at the copy.");
                      router.push(postHref(props.closeHref, r.id), { scroll: false });
                    } else toast("error", "Couldn’t duplicate it", r.error);
                  });
                }}
                className={menuItem}
              >
                <Icon name="board" /> Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  runBulk("archive");
                }}
                className={menuItem}
              >
                <Icon name="folder" /> Archive
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  setDialog("delete");
                }}
                className={`${menuItem} text-danger hover:text-danger`}
              >
                <Icon name="trash" /> Delete
              </button>
            </div>
          )}
        </Popover>
      )}

      {dialog === "share" && (
        <ShareDialog title={props.title} siblings={siblings} currentId={props.contentId} links={props.links} share={props.share} revoke={props.revoke} onClose={() => setDialog(null)} />
      )}
      {dialog === "repurpose" && (
        <Modal title={`Repurpose into ${props.kinds.length} posts?`} onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">Each platform becomes its own post, so you can change its caption, media and date without touching the others. They stay linked as a group.</p>
          <div className="my-4 flex flex-wrap gap-1.5">
            {props.kinds.map((k) => (
              <span key={k} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px]">
                <PlatformLogo platform={PLACEMENTS[k].platform} size={16} /> {PLACEMENTS[k].label}
              </span>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={buttonClass("ghost", "sm")}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await props.repurpose();
                  setDialog(null);
                  if (r.ok) toast("success", `Repurposed into ${r.count} posts`);
                  else toast("error", "Couldn’t repurpose it", r.error);
                })
              }
              className={buttonClass("primary", "sm")}
            >
              {pending ? "Repurposing…" : "Repurpose"}
            </button>
          </div>
        </Modal>
      )}
      {dialog === "delete" && (
        <Modal title="Delete this post?" onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">
            “{props.title}” and its comments, tasks and change log are deleted for good. To keep it out of the way instead, archive it.
            {props.grouped ? " The other posts in its group stay." : ""}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={buttonClass("ghost", "sm")}>
              Cancel
            </button>
            <button type="button" disabled={pending} onClick={() => runBulk("delete")} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-semibold text-white">
              {pending ? "Deleting…" : "Delete post"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
