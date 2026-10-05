"use client";

import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { AvatarStack, PlacementChip, PublishState, StatusDot } from "@/components/ui";
import { formatSchedule } from "@/lib/format";
import type { CardItem } from "@/server/content";

interface BoardStatus {
  id: string;
  name: string;
  color: string;
}

export function Board({
  statuses,
  cards,
  timezone,
  basePath,
  canEdit,
  moveAction,
  createAction,
}: {
  statuses: BoardStatus[];
  cards: CardItem[];
  timezone: string;
  basePath: string;
  canEdit: boolean;
  moveAction: (contentId: string, statusId: string) => Promise<void>;
  createAction: (statusId: string) => Promise<void>;
}) {
  const [optimisticCards, applyMove] = useOptimistic(cards, (state, move: { id: string; statusId: string }) =>
    state.map((c) => (c.id === move.id ? { ...c, statusId: move.statusId } : c)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function drop(statusId: string, contentId: string) {
    setDragOver(null);
    startTransition(async () => {
      applyMove({ id: contentId, statusId });
      try {
        setError(null);
        await moveAction(contentId, statusId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not move the post.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => {
          const column = optimisticCards.filter((c) => c.statusId === status.id);
          return (
            <section
              key={status.id}
              aria-label={status.name}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOver(status.id);
              }}
              onDragLeave={() => setDragOver((s) => (s === status.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/content-id");
                if (id) drop(status.id, id);
              }}
              className={`flex w-[272px] shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors ${
                dragOver === status.id ? "bg-line" : "bg-line-soft"
              }`}
            >
              <header className="flex items-center gap-2 px-1.5 py-1 text-sm font-semibold">
                <StatusDot color={status.color} />
                {status.name}
                <span className="font-normal text-muted">{column.length}</span>
              </header>
              {column.map((card) => (
                <Link
                  key={card.id}
                  href={`${basePath}/board?content=${card.id}`}
                  scroll={false}
                  draggable={canEdit}
                  onDragStart={(e) => e.dataTransfer.setData("text/content-id", card.id)}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(23,24,28,0.05)] hover:border-ink-2/40"
                >
                  {card.coverId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/${basePath.slice(1)}/media/${card.coverId}?v=thumb`} alt="" loading="lazy" draggable={false} className="-mx-3 -mt-3 mb-1 aspect-[16/10] w-[calc(100%+1.5rem)] max-w-none rounded-t-lg object-cover" />
                  )}
                  <span className="text-[15px] font-semibold leading-snug">{card.title}</span>
                  {card.kinds.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {card.kinds.map((k) => (
                        <PlacementChip key={k} kind={k} />
                      ))}
                    </span>
                  )}
                  <span className="text-[13px] text-muted">
                    {formatSchedule(card.scheduledAt, timezone) ?? "Unscheduled"}
                    {card.projectName ? ` · ${card.projectName}` : ""}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {card.publishState !== "not_scheduled" && <PublishState state={card.publishState} />}
                      {card.tasksTotal > 0 && (
                        <span className="text-xs text-muted">
                          Tasks {card.tasksDone}/{card.tasksTotal}
                        </span>
                      )}
                    </span>
                    <AvatarStack people={card.assignees} />
                  </span>
                </Link>
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => startTransition(() => createAction(status.id))}
                  className="rounded-lg px-2 py-2 text-left text-sm text-muted hover:bg-surface hover:text-ink"
                >
                  + Create content
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
