"use client";

import { forwardRef, useImperativeHandle, useState } from "react";

export interface SuggestionItem {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** The pop-up list for "/", "@", "[[" and ":" in notes. Arrow keys move, Enter or Tab picks. */
export const SuggestionList = forwardRef<SuggestionListHandle, { items: SuggestionItem[]; command: (item: SuggestionItem) => void; empty: string }>(function SuggestionList(
  { items, command, empty },
  ref,
) {
  const [selected, setSelected] = useState(0);
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    // A new query: start from the top again.
    setLastItems(items);
    setSelected(0);
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div role="listbox" className="z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 text-sm shadow-xl">
      {items.length === 0 ? (
        <p className="px-3 py-2 text-muted">{empty}</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === selected}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left ${i === selected ? "bg-subtle" : ""}`}
          >
            {item.icon && <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-[13px]">{item.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              {item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}
            </span>
          </button>
        ))
      )}
    </div>
  );
});
