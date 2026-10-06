"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { PlatformLogo } from "@/components/ui";
import { GROUPS, highlight, shortAgo } from "@/lib/search";
import type { ResultType, SearchResult } from "@/server/search";

const ICONS: Record<ResultType, React.ReactNode> = {
  content: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  task: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  project: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  space: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  note: (
    <>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </>
  ),
  idea: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z" />
    </>
  ),
};

const noop = () => () => {};

function Marked({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-accent-bg px-px text-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** SR-01..SR-03: opens from the top bar, Ctrl/⌘ K or Ctrl/⌘ /; arrows move, Enter opens, Esc closes. */
export function SearchPalette({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ q: string; results: SearchResult[]; now: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  // The shortcut label: ⌘K on Apple devices; the server render says Ctrl K.
  const mac = useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, SearchResult[]>());
  const id = useId();


  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Ctrl/⌘ K (or Ctrl/⌘ /) anywhere toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "k" || e.key === "/")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc closes from anywhere in the palette, not only the input.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
  }, [open]);

  // Fetch as you type (debounced); answers to earlier queries are ignored rather than aborted,
  // since an aborted fetch can surface as an unhandled AbortError. Repeat queries come from memory.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const hit = cache.current.get(term);
    if (hit) {
      setData({ q: term, results: hit, now: Date.now() });
      setActive(0);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/o/${orgSlug}/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: SearchResult[] };
        if (stale) return;
        cache.current.set(term, body.results);
        setData({ q: term, results: body.results, now: Date.now() });
        setActive(0);
        setError(false);
      } catch {
        if (!stale) setError(true);
      } finally {
        if (!stale) setLoading(false);
      }
    }, term ? 120 : 0);
    return () => {
      clearTimeout(t);
      stale = true;
    };
  }, [q, open, orgSlug]);

  // Results change over time (new posts), so a fresh open starts from the server again.
  useEffect(() => {
    if (!open) cache.current.clear();
  }, [open]);

  const groups = useMemo(() => {
    const results = data?.results ?? [];
    return GROUPS.map(([type, label]) => ({ type, label: !data?.q && type === "content" ? "Recent" : label, items: results.filter((r) => r.type === type) })).filter((g) => g.items.length);
  }, [data]);
  const flat = groups.flatMap((g) => g.items);

  const go = (r: SearchResult | undefined) => {
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  };

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const shortcut = mac ? "⌘K" : "Ctrl K";
  let index = -1;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K Control+/ Meta+/"
        className="flex h-8 w-full max-w-[440px] items-center gap-2 rounded-md bg-bar-2 px-2.5 text-left text-[13px] text-white/55 hover:bg-[#3a3b42] hover:text-white/75"
      >
        <Icon name="search" size={15} />
        <span className="min-w-0 flex-1 truncate">Search organisation…</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 font-sans text-[11px] text-white/70 sm:block">{shortcut}</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/55 px-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="flex max-h-[75vh] w-full max-w-[880px] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-muted">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search posts, captions, tasks, notes…"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={`${id}-list`}
                aria-activedescendant={flat.length ? `${id}-${active}` : undefined}
                aria-autocomplete="list"
                aria-label="Search organisation"
                // The open palette is the focus indicator; no ring around the field inside it.
                style={{ outline: "none" }}
                className="h-14 min-w-0 flex-1 bg-transparent text-[16px]"
              />
              {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line border-t-ink-2" />}
              <button type="button" onClick={close} aria-label="Close search" className="grid size-7 place-items-center rounded-md bg-subtle text-muted hover:bg-line-soft hover:text-ink">
                <Icon name="x" size={15} />
              </button>
            </div>

            <div ref={list} id={`${id}-list`} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
              {error && <p className="px-3 py-6 text-center text-sm text-danger">Search isn’t responding. Try again.</p>}
              {!error && data && flat.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted">{data.q ? `No results for “${data.q}”` : "Nothing here yet."}</p>
              )}
              {groups.map((g) => (
                <div key={g.type} role="group" aria-label={g.label} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
                  {g.items.map((r) => {
                    index++;
                    const i = index;
                    const selected = i === active;
                    return (
                      <div
                        key={`${r.type}:${r.id}`}
                        id={`${id}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => active !== i && setActive(i)}
                        onClick={() => go(r)}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${selected ? "bg-subtle" : ""}`}
                      >
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md border border-line-soft bg-surface text-ink-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {ICONS[r.type]}
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            <Marked text={r.title} q={data?.q ?? ""} />
                          </span>
                          {r.snippet && (
                            <span className="block truncate text-[13px] text-muted">
                              <Marked text={r.snippet} q={data?.q ?? ""} />
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                          {r.platforms.length > 0 && (
                            <span className="flex items-center gap-1">
                              {r.platforms.map((p) => (
                                <PlatformLogo key={p} platform={p} size={16} />
                              ))}
                            </span>
                          )}
                          {r.space && (
                            <span className="hidden items-center gap-1 sm:inline-flex">
                              <span aria-hidden className="size-2 rounded-sm" style={{ background: r.space.color }} />
                              {r.space.name}
                            </span>
                          )}
                          {r.at && data && <time dateTime={r.at}>{shortAgo(r.at, data.now)}</time>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex gap-4 border-t border-line px-4 py-2 text-xs text-muted">
              <span>
                <kbd className="font-sans">↑↓</kbd> to move
              </span>
              <span>
                <kbd className="font-sans">↵</kbd> to open
              </span>
              <span>
                <kbd className="font-sans">Esc</kbd> to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
