"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { HELP_ARTICLES, searchHelp, TICKET_CATEGORIES, type TicketCategory } from "@/lib/help";

type View = { name: "home" } | { name: "form"; category: TicketCategory } | { name: "sent"; emailed: boolean };

export interface SupportProps {
  orgSlug: string;
  user: { name: string; email: string };
  spaces: { slug: string; name: string }[];
}

const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] text-ink-2 hover:bg-line-soft hover:text-ink";

/** Support Center: search the help articles, open bookmarks, or send a ticket. Opens from the sidebar. */
export function SupportCenter({ orgSlug, user, spaces }: SupportProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: "home" });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [space, setSpace] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const base = `/o/${orgSlug}`;
  const results = query.trim() ? searchHelp(query) : HELP_ARTICLES.slice(0, 4);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);

  const close = () => setOpen(false);
  const category = view.name === "form" ? TICKET_CATEGORIES.find((c) => c.id === view.category)! : null;

  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={row}>
        <Icon name="comment" />
        <span className="flex-1">Support Center</span>
      </button>
      {/* On the page body: the sidebar's slide-in transform would otherwise pin this inside the sidebar. */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-label="Support Center"
            className="fixed bottom-4 right-4 z-[55] flex max-h-[min(620px,calc(100dvh-2rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl"
          >
            <header className="shrink-0 bg-gradient-to-br from-[#f7b04f] to-[#ea7a2a] px-4 pb-4 pt-3 text-ink">
              <div className="flex items-center gap-2">
                {view.name !== "home" && (
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setView({ name: "home" })}
                    className="grid size-7 place-items-center rounded-md hover:bg-white/25"
                  >
                    <Icon name="chevronDown" className="rotate-90" />
                  </button>
                )}
                <span className="grid size-7 place-items-center rounded-md bg-ink text-sm font-bold text-accent">P</span>
                <span className="flex-1" />
                <button type="button" aria-label="Close Support Center" onClick={close} className="grid size-7 place-items-center rounded-md hover:bg-white/25">
                  <Icon name="x" />
                </button>
              </div>
              {view.name === "home" && (
                <p className="mt-3 text-[19px] font-bold leading-tight">
                  Hey there 👋
                  <br />
                  How can we help?
                </p>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {view.name === "home" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-ink">
                      <Icon name="search" size={15} className="text-muted" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search help articles…"
                        aria-label="Search help articles"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </label>
                    <ul className="mt-2 flex flex-col">
                      {results.map((a) => (
                        <li key={a.slug}>
                          <Link href={`${base}/help/${a.slug}`} onClick={close} className="block rounded-lg px-2 py-1.5 hover:bg-subtle">
                            <b className="block text-[13.5px]">{a.title}</b>
                            <span className="line-clamp-1 text-xs text-muted">{a.summary}</span>
                          </Link>
                        </li>
                      ))}
                      {results.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No articles match. Send us a ticket below.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Bookmarks</p>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {(
                        [
                          [`${base}/updates`, "megaphone", "Product updates"],
                          [`${base}/help`, "clipboard", "All help articles"],
                          [`${base}/help/shortcuts`, "sparkles", "Keyboard shortcuts"],
                        ] as const
                      ).map(([href, icon, label]) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={close}
                          className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[13px] hover:bg-subtle"
                        >
                          <Icon name={icon} size={13} /> {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Submit a ticket</p>
                    {TICKET_CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setError("");
                          setView({ name: "form", category: c.id });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-subtle"
                      >
                        <Icon name="comment" size={15} className="text-muted" />
                        <span className="flex-1">{c.label}</span>
                        <Icon name="chevronRight" size={14} className="text-muted" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {view.name === "form" && category && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError("");
                    start(async () => {
                      const form = new FormData();
                      form.set("category", category.id);
                      form.set("message", message);
                      if (space) form.set("space", space);
                      for (const f of files) form.append("files", f);
                      const res = await fetch(`/api/o/${orgSlug}/support`, { method: "POST", body: form }).catch(() => null);
                      const r = res
                        ? ((await res.json().catch(() => ({}))) as { ok?: boolean; emailed?: boolean; error?: string })
                        : { error: "Couldn’t reach Plotline. Check your connection." };
                      if (!r.ok) return setError(r.error ?? "Couldn’t send it.");
                      setMessage("");
                      setFiles([]);
                      setView({ name: "sent", emailed: Boolean(r.emailed) });
                    });
                  }}
                  className="flex flex-col gap-3"
                >
                  <div>
                    <h2 className="text-[16px] font-semibold">{category.label}</h2>
                    <p className="text-[13px] text-muted">Tell us what’s happening and we’ll get back to you as soon as we can.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                    <label className="flex flex-col gap-1">
                      Name
                      <input value={user.name} disabled className="h-9 rounded-lg border border-line bg-subtle px-2 text-sm text-ink-2" />
                    </label>
                    <label className="flex flex-col gap-1">
                      Email
                      <input value={user.email} disabled className="h-9 rounded-lg border border-line bg-subtle px-2 text-sm text-ink-2" />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    {category.id === "feature" ? "What would you like Plotline to do?" : "What should happen, and what’s happening instead?"}
                    <textarea
                      required
                      autoFocus
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={5000}
                      className="rounded-lg border border-line px-2.5 py-2 text-sm font-normal outline-none focus:border-ink"
                    />
                  </label>
                  {spaces.length > 0 && (
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      The space it’s about <span className="text-xs font-normal text-muted">(optional)</span>
                      <select
                        value={space}
                        onChange={(e) => setSpace(e.target.value)}
                        className="h-9 rounded-lg border border-line bg-surface px-2 text-sm font-normal"
                      >
                        <option value="">Not about one space</option>
                        {spaces.map((s) => (
                          <option key={s.slug} value={s.slug}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      Screenshots or recordings <span className="text-xs font-normal text-muted">(up to 3, 10 MB each)</span>
                    </span>
                    {files.length < 3 && (
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-muted hover:border-ink-2">
                        <Icon name="download" className="rotate-180" />
                        Click to add images, videos or PDFs
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf"
                          className="sr-only"
                          onChange={(e) => {
                            const picked = [...(e.target.files ?? [])];
                            e.target.value = "";
                            setFiles((f) => [...f, ...picked].slice(0, 3));
                          }}
                        />
                      </label>
                    )}
                    {files.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-subtle px-2 py-1 text-xs">
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} className="text-muted hover:text-ink">
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  {error && (
                    <p role="alert" className="rounded-lg bg-danger-bg px-2.5 py-2 text-sm text-danger">
                      {error}
                    </p>
                  )}
                  <button type="submit" disabled={pending || message.trim().length < 10} className={`${buttonClass("primary")} h-10 w-full`}>
                    {pending ? "Sending…" : "Submit"}
                  </button>
                </form>
              )}

              {view.name === "sent" && (
                <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-success-bg text-success">
                    <Icon name="check" size={22} />
                  </span>
                  <b className="text-[16px]">Thanks, we’ve got it</b>
                  <p className="text-sm text-muted">
                    {view.emailed
                      ? `We’ll reply to ${user.email}.`
                      : "Your message is saved in Plotline. Support email isn’t set up on this server yet, so it hasn’t been emailed to the team."}
                  </p>
                  <button type="button" onClick={() => setView({ name: "home" })} className={buttonClass("secondary", "sm")}>
                    Back to help
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
