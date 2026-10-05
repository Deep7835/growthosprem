"use client";

import { useState, useTransition } from "react";
import type { SpaceResult } from "@/app/o/[org]/settings/spaces/actions";

/** SP-05: an archived space is read-only; Owners and Admins can restore it from here. */
export function ArchivedBanner({ name, restore }: { name: string; restore: (() => Promise<SpaceResult<{ paused: number }>>) | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-6 py-2.5 text-sm">
      <strong>{name} is archived.</strong> You can look around, but nothing can be changed or published until it’s restored.
      {restore && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await restore();
              if (!r.ok) setError(r.error);
            })
          }
          className="font-semibold underline"
        >
          {pending ? "Restoring…" : "Restore space"}
        </button>
      )}
      {error && <span className="text-danger">{error}</span>}
    </p>
  );
}
