"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useTransition } from "react";
import { buttonClass } from "@/components/ui";

const TABS = [
  ["board", "Board"],
  ["table", "Table"],
  ["calendar", "Calendar"],
  ["previews", "Previews"],
  ["inbox", "Inbox"],
  ["notes", "Notes"],
] as const;

export interface HeaderProject {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

/** The project in the URL, if any: /o/:org/s/:space/p/:project/… */
function useProject(base: string, projects: HeaderProject[]) {
  const pathname = usePathname();
  const id = pathname.startsWith(`${base}/p/`) ? pathname.slice(base.length + 3).split("/")[0] : null;
  return { pathname, project: projects.find((p) => p.id === id) ?? null };
}

/** UI2-02: the breadcrumb, space or space › project. */
export function SpaceTitle({ base, name, color, projects }: { base: string; name: string; color: string; projects: HeaderProject[] }) {
  const { project } = useProject(base, projects);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold" style={{ background: color }}>
        {name[0]}
      </span>
      {project ? (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-display text-xl font-bold">
          <Link href={`${base}/board`} className="text-muted hover:text-ink">
            {name}
          </Link>
          <span aria-hidden className="text-faint">
            ›
          </span>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: project.color ?? "#9CA3AF" }} />
          <h1 className="truncate">{project.name}</h1>
          {project.archived && <span className="rounded-full bg-subtle px-2 py-0.5 font-sans text-xs font-semibold text-muted">Archived</span>}
        </nav>
      ) : (
        <h1 className="font-display text-xl font-bold">{name}</h1>
      )}
    </div>
  );
}

/** UI2-03, UI2-04: view tabs (for the space or the project), Statuses and the Create menu. */
export function SpaceTabs({
  base,
  projects = [],
  canManage = false,
  canEdit = false,
  aiHref,
  create,
}: {
  base: string;
  projects?: HeaderProject[];
  canManage?: boolean;
  canEdit?: boolean;
  aiHref?: string | null;
  create?: (projectId: string | null, kind: string) => Promise<void>;
}) {
  const { pathname, project } = useProject(base, projects);
  const root = project ? `${base}/p/${project.id}` : base;
  const menu = useRef<HTMLDetailsElement>(null);
  const [pending, start] = useTransition();
  const make = (kind: string) => {
    if (menu.current) menu.current.open = false;
    start(() => create!(project?.id ?? null, kind));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Views" className="flex gap-1 overflow-x-auto">
        {TABS.map(([slug, label]) => {
          // The Inbox is the space's, not a project's.
          const target = slug === "inbox" ? `${base}/inbox` : `${root}/${slug}`;
          const active = pathname === target;
          return (
            <Link
              key={slug}
              href={target}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
              {slug === "inbox" && <sup className="ml-0.5 text-[9px] font-bold uppercase text-accent-ink">Beta</sup>}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 pb-1.5">
        {canManage && (
          <Link href={`${base}/settings/statuses`} className={buttonClass("ghost", "sm")}>
            Statuses
          </Link>
        )}
        {canEdit && create && (
          <details ref={menu} className="relative">
            <summary className={`${buttonClass("primary", "sm")} cursor-pointer list-none`} aria-label={project ? `Create in ${project.name}` : "Create"}>
              {pending ? "Creating…" : "+ Create"}
            </summary>
            <div role="menu" className="absolute right-0 z-30 mt-1.5 flex w-56 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-lg">
              {project && <p className="px-2.5 pb-1 pt-0.5 text-xs text-muted">In {project.name}</p>}
              {(
                [
                  ["content", "Content", "A post for the Board"],
                  ["task", "Task", "Something to do, with a due date"],
                  ["note", "Note", "A brief or meeting notes"],
                ] as const
              ).map(([kind, label, hint]) => (
                <button key={kind} type="button" role="menuitem" disabled={pending} onClick={() => make(kind)} className="flex flex-col rounded-lg px-2.5 py-2 text-left hover:bg-subtle">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-muted">{hint}</span>
                </button>
              ))}
              {aiHref && (
                <Link role="menuitem" href={aiHref} onClick={() => menu.current && (menu.current.open = false)} className="flex flex-col rounded-lg px-2.5 py-2 hover:bg-subtle">
                  <span className="text-sm font-semibold">Generate with AI</span>
                  <span className="text-xs text-muted">Ask AI Copilot to draft posts</span>
                </Link>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
