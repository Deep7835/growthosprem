"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { uploadFile } from "@/components/media/upload";
import { buttonClass } from "@/components/ui";
import { IDEA_SOURCES, cleanLinks, filterIdeas, groupByPillar, linkLabel, type IdeaSource } from "@/lib/ideas";
import type { IdeaList } from "@/server/ideas";

type Idea = IdeaList["ideas"][number];
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Input = { title?: string; notes?: string; source?: IdeaSource; pillar?: string | null; tags?: string[]; links?: { url: string; title?: string }[]; mediaIds?: string[] };

const SOURCE_TONE: Record<IdeaSource, string> = {
  me: "bg-line-soft text-ink-2",
  ai: "bg-ai-bg text-ai",
  trend: "bg-accent-bg text-accent-ink",
  competitor: "bg-data-bg text-data",
};

interface Props {
  org: string;
  space: string;
  data: IdeaList;
  canEdit: boolean;
  canUseAi: boolean;
  add: (input: Input) => Promise<Result<{ id: string }>>;
  edit: (id: string, input: Input) => Promise<Result>;
  remove: (ids: string[]) => Promise<Result>;
  toContent: (id: string) => Promise<Result<{ contentId: string }>>;
  suggest: () => Promise<Result<{ assignments: { id: string; pillar: string }[] }>>;
  accept: (assignments: { id: string; pillar: string }[]) => Promise<Result>;
  /** ?idea= from search: open that idea straight away. */
  openId?: string | null;
}

export function IdeaBank(props: Props) {
  const { data, org, space, canEdit } = props;
  const router = useRouter();
  const [view, setView] = useState<"cards" | "pillars">("cards");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [pillar, setPillar] = useState("");
  const [tag, setTag] = useState("");
  const linked = props.openId ? (data.ideas.find((i) => i.id === props.openId) ?? null) : null;
  const [used, setUsed] = useState<"hide" | "show">(linked?.contentItemId ? "show" : "hide");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<Idea | "new" | null>(linked);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; pillar: string; keep: boolean }[] | null>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);

  const shown = filterIdeas(data.ideas, { q, source, pillar, tag, used });
  const tags = [...new Set(data.ideas.flatMap((i) => i.tags))].sort();
  const run = <T,>(fn: () => Promise<Result<T>>, then?: (r: { ok: true } & T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        then?.(r);
      }
    });

  const turn = (idea: Idea) => run(() => props.toContent(idea.id), (r) => router.push(`/o/${org}/s/${space}/board?content=${r.contentId}`));

  const card = (idea: Idea) => (
    <article
      key={idea.id}
      draggable={canEdit && view === "pillars"}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", idea.id);
        setDragging(idea.id);
      }}
      onDragEnd={() => setDragging(null)}
      className={`flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 ${dragging === idea.id ? "opacity-40" : ""} ${idea.contentItemId ? "opacity-75" : ""}`}
    >
      <button type="button" onClick={() => setOpen(idea)} className="flex flex-col gap-1.5 text-left">
        <span className="flex items-start justify-between gap-2">
          <strong className="text-[15px] leading-snug">{idea.title}</strong>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[idea.source]}`}>{IDEA_SOURCES[idea.source]}</span>
        </span>
        {idea.notes && <span className="line-clamp-3 whitespace-pre-line text-[13px] text-ink-2">{idea.notes}</span>}
      </button>
      {idea.mediaIds.length > 0 && (
        <span className="flex gap-1">
          {idea.mediaIds.slice(0, 3).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m} src={`/api/o/${org}/s/${space}/media/${m}?v=thumb`} alt="" className="size-14 rounded-md object-cover" />
          ))}
          {idea.mediaIds.length > 3 && <span className="grid size-14 place-items-center rounded-md bg-line-soft text-xs text-muted">+{idea.mediaIds.length - 3}</span>}
        </span>
      )}
      {(idea.pillar || idea.tags.length > 0 || idea.links.length > 0) && (
        <span className="flex flex-wrap gap-1 text-[11px]">
          {idea.pillar && view === "cards" && <span className="rounded-full border border-line px-2 py-0.5 font-semibold">{idea.pillar}</span>}
          {idea.tags.map((t) => (
            <span key={t} className="rounded-full bg-line-soft px-2 py-0.5">
              {t}
            </span>
          ))}
          {idea.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full bg-data-bg px-2 py-0.5 text-data hover:underline">
              ↗ {linkLabel(l)}
            </a>
          ))}
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
        {idea.contentItemId ? (
          <Link href={`/o/${org}/s/${space}/board?content=${idea.contentItemId}`} className="font-semibold text-success-ink hover:underline">
            ✓ Became a post{idea.contentTitle ? `: ${idea.contentTitle}` : ""}
          </Link>
        ) : canEdit ? (
          <button type="button" disabled={pending} onClick={() => turn(idea)} className={buttonClass("secondary", "sm")}>
            Turn into content
          </button>
        ) : (
          <span />
        )}
      </span>
    </article>
  );

  const groups = groupByPillar(shown);
  const dropOn = (target: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (dragging) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const ideaId = e.dataTransfer.getData("text/plain");
      setDragging(null);
      const idea = data.ideas.find((i) => i.id === ideaId);
      if (idea && (idea.pillar ?? null) !== target) run(() => props.edit(ideaId, { pillar: target }));
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold">Idea Bank</h2>
        <span className="text-sm text-muted">
          {data.ideas.filter((i) => !i.contentItemId).length} open · {data.ideas.filter((i) => i.contentItemId).length} turned into posts
        </span>
        <span className="flex-1" />
        {props.canUseAi && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => props.suggest(), (r) => setSuggestions(r.assignments.map((a) => ({ ...a, keep: true }))))}
            className={buttonClass("secondary", "sm")}
          >
            ✦ Sort into pillars with AI
          </button>
        )}
        <nav aria-label="Idea view" className="flex gap-0.5 rounded-lg bg-line-soft p-[3px]">
          {(["cards", "pillars"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-[13px] font-semibold ${view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {v === "cards" ? "Cards" : "By pillar"}
            </button>
          ))}
        </nav>
      </div>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const title = draft.trim();
            if (!title) return;
            setDraft("");
            run(() => props.add({ title, source: "me", pillar: pillar && pillar !== "none" ? pillar : null }));
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Got an idea? Type it and press Enter"
            aria-label="New idea"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-[15px]"
          />
          <button type="button" onClick={() => setOpen("new")} className={buttonClass("secondary")}>
            Add with details
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" className="h-9 w-56 rounded-lg border border-line bg-surface px-3" />
        <span className="flex gap-1">
          {[["", "All sources"], ...Object.entries(IDEA_SOURCES)].map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={source === k}
              onClick={() => setSource(k)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${source === k ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2"}`}
            >
              {l}
            </button>
          ))}
        </span>
        <select value={pillar} onChange={(e) => setPillar(e.target.value)} aria-label="Pillar" className="h-9 rounded-lg border border-line bg-surface px-2">
          <option value="">All pillars</option>
          <option value="none">No pillar</option>
          {data.pillars.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {tags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className="h-9 rounded-lg border border-line bg-surface px-2">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <input type="checkbox" checked={used === "show"} onChange={(e) => setUsed(e.target.checked ? "show" : "hide")} className="accent-ink" />
          Include ideas already turned into posts
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {suggestions && (
        <section aria-label="Suggested pillars" className="flex flex-col gap-3 rounded-2xl border border-ai bg-ai-bg/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Suggested pillars</h3>
            <span className="rounded-full bg-ai-bg px-2 py-0.5 text-[11px] font-semibold text-ai">AI suggestion</span>
            <span className="text-[13px] text-muted">Nothing changes until you apply. Edit any pillar first.</span>
          </div>
          <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-surface">
            {suggestions.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={s.keep} onChange={(e) => setSuggestions(suggestions.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} className="accent-ink" aria-label="Apply this one" />
                <span className="min-w-0 flex-1 truncate">{data.ideas.find((d) => d.id === s.id)?.title}</span>
                <input
                  value={s.pillar}
                  list="pillar-names"
                  onChange={(e) => setSuggestions(suggestions.map((x, j) => (j === i ? { ...x, pillar: e.target.value } : x)))}
                  aria-label="Pillar"
                  className="h-8 w-44 rounded-lg border border-line px-2"
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !suggestions.some((s) => s.keep && s.pillar.trim())}
              onClick={() => run(() => props.accept(suggestions.filter((s) => s.keep && s.pillar.trim()).map(({ id, pillar }) => ({ id, pillar }))), () => setSuggestions(null))}
              className={buttonClass("primary", "sm")}
            >
              Apply {suggestions.filter((s) => s.keep).length} pillar{suggestions.filter((s) => s.keep).length === 1 ? "" : "s"}
            </button>
            <button type="button" onClick={() => setSuggestions(null)} className={buttonClass("ghost", "sm")}>
              Discard
            </button>
          </div>
        </section>
      )}
      <datalist id="pillar-names">
        {data.pillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-muted">
          {data.ideas.length === 0 ? "No ideas yet. Jot down anything worth posting about: a trend, a competitor’s post, a question customers ask." : "No ideas match these filters."}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start gap-3">{shown.map(card)}</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {[...groups, ...(groups.some((g) => g.pillar === null) ? [] : [{ pillar: null, ideas: [] }])].map((g) => (
            <section
              key={g.pillar ?? "none"}
              aria-label={g.pillar ?? "No pillar"}
              {...(canEdit ? dropOn(g.pillar) : {})}
              className={`flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-line-soft/60 p-2.5 ${dragging ? "outline-2 outline-dashed outline-line" : ""}`}
            >
              <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
                {g.pillar ?? "No pillar"}
                <span className="font-normal text-muted">{g.ideas.length}</span>
              </h3>
              {g.ideas.map(card)}
              {canEdit && g.ideas.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Drag ideas here</p>}
            </section>
          ))}
        </div>
      )}

      {open && (
        <IdeaDialog
          key={open === "new" ? "new" : open.id}
          org={org}
          space={space}
          idea={open === "new" ? null : open}
          pillars={data.pillars}
          library={data.library}
          canEdit={canEdit}
          close={() => setOpen(null)}
          save={async (input) => {
            const r = open === "new" ? await props.add(input) : await props.edit(open.id, input);
            if (r.ok) setOpen(null);
            return r;
          }}
          remove={
            open === "new"
              ? undefined
              : async () => {
                  const r = await props.remove([open.id]);
                  if (r.ok) setOpen(null);
                  return r;
                }
          }
          turn={open === "new" || open.contentItemId ? undefined : () => turn(open)}
        />
      )}
    </div>
  );
}

function IdeaDialog({
  org,
  space,
  idea,
  pillars,
  library,
  canEdit,
  close,
  save,
  remove,
  turn,
}: {
  org: string;
  space: string;
  idea: Idea | null;
  pillars: string[];
  library: { id: string; filename: string }[];
  canEdit: boolean;
  close: () => void;
  save: (input: Input) => Promise<Result>;
  remove?: () => Promise<Result>;
  turn?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(idea?.title ?? "");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [source, setSource] = useState<IdeaSource>(idea?.source ?? "me");
  const [pillar, setPillar] = useState(idea?.pillar ?? "");
  const [tags, setTags] = useState((idea?.tags ?? []).join(", "));
  const [links, setLinks] = useState(idea?.links ?? []);
  const [newLink, setNewLink] = useState("");
  const [media, setMedia] = useState<string[]>(idea?.mediaIds ?? []);
  const [extra, setExtra] = useState<{ id: string; filename: string }[]>([]);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = () =>
    start(async () => {
      const pendingLink = newLink.trim() ? [{ url: newLink.trim() }] : [];
      const r = await save({
        title,
        notes,
        source,
        pillar: pillar.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        links: [...links, ...pendingLink],
        mediaIds: media,
      });
      if (!r.ok) setError(r.error);
    });

  const addLink = () => {
    if (!newLink.trim()) return;
    const next = cleanLinks([...links, { url: newLink }]);
    if (next.length === links.length) setError("That doesn’t look like a web link (https://…).");
    else {
      setError(null);
      setLinks(next);
      setNewLink("");
    }
  };

  const allImages = [...extra, ...library.filter((l) => !extra.some((e) => e.id === l.id))];

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="idea-title"
      className="m-auto w-[min(640px,94vw)] rounded-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit) submit();
        }}
        className="flex max-h-[88vh] flex-col gap-4 overflow-y-auto p-5"
      >
        <h2 id="idea-title" className="font-display text-xl font-bold">
          {idea ? (canEdit ? "Edit idea" : "Idea") : "New idea"}
        </h2>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Title
          <input autoFocus required value={title} readOnly={!canEdit} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-lg border border-line px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Notes
          <textarea value={notes} readOnly={!canEdit} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="The hook, the angle, what to show…" className="rounded-lg border border-line p-3 font-normal" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Source
            <select value={source} disabled={!canEdit} onChange={(e) => setSource(e.target.value as IdeaSource)} className="h-10 rounded-lg border border-line bg-surface px-2 font-normal">
              {Object.entries(IDEA_SOURCES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Pillar
            <input value={pillar} readOnly={!canEdit} list="pillar-names" onChange={(e) => setPillar(e.target.value)} placeholder={pillars[0] ?? "Education"} className="h-10 rounded-lg border border-line px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Tags
            <input value={tags} readOnly={!canEdit} onChange={(e) => setTags(e.target.value)} placeholder="diwali, reel" className="h-10 rounded-lg border border-line px-3 font-normal" />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Reference links</legend>
          {links.map((l, i) => (
            <span key={l.url} className="flex items-center gap-2 text-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate text-data hover:underline">
                {l.url}
              </a>
              {canEdit && (
                <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Remove ${l.url}`} className={buttonClass("ghost", "sm")}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <span className="flex gap-2">
              <input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://www.instagram.com/p/… (a competitor post, a trend)"
                aria-label="Add a link"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm"
              />
              <button
                type="button"
                onClick={addLink}
                className={buttonClass("secondary", "sm")}
              >
                Add link
              </button>
            </span>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Reference images</legend>
          <span className="flex flex-wrap gap-2">
            {media.map((m) => (
              <span key={m} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/o/${org}/s/${space}/media/${m}?v=thumb`} alt="" className="size-20 rounded-lg object-cover" />
                {canEdit && (
                  <button type="button" onClick={() => setMedia(media.filter((x) => x !== m))} aria-label="Remove image" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">
                    ✕
                  </button>
                )}
              </span>
            ))}
            {canEdit && (
              <>
                <button type="button" onClick={() => setPicking(!picking)} className="grid size-20 place-items-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-ink-2">
                  From library
                </button>
                <label className="grid size-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-xs text-muted hover:border-ink-2">
                  {uploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploading(true);
                      try {
                        const asset = await uploadFile(org, space, file);
                        setExtra((x) => [{ id: asset.id, filename: asset.filename }, ...x]);
                        setMedia((m) => [...m, asset.id]);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Upload failed.");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              </>
            )}
          </span>
          {picking && (
            <div className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
              {allImages.length === 0 && <span className="col-span-full text-xs text-muted">No images in this space’s media library yet.</span>}
              {allImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  title={img.filename}
                  aria-pressed={media.includes(img.id)}
                  onClick={() => setMedia(media.includes(img.id) ? media.filter((m) => m !== img.id) : [...media, img.id])}
                  className={`overflow-hidden rounded-md ring-2 ${media.includes(img.id) ? "ring-ink" : "ring-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/o/${org}/s/${space}/media/${img.id}?v=thumb`} alt={img.filename} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          {canEdit && (
            <button type="submit" disabled={pending || !title.trim()} className={buttonClass("primary")}>
              {pending ? "Saving…" : idea ? "Save idea" : "Add idea"}
            </button>
          )}
          {turn && canEdit && (
            <button type="button" onClick={turn} className={buttonClass("secondary")}>
              Turn into content
            </button>
          )}
          <button type="button" onClick={() => ref.current?.close()} className={buttonClass("ghost")}>
            {canEdit ? "Cancel" : "Close"}
          </button>
          <span className="flex-1" />
          {remove &&
            canEdit &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this idea?
                <button type="button" onClick={() => start(async () => void (await remove()))} className={`${buttonClass("primary", "sm")} bg-danger hover:bg-danger`}>
                  Delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass("ghost", "sm")}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("ghost", "sm")}>
                Delete
              </button>
            ))}
        </div>
      </form>
    </dialog>
  );
}
