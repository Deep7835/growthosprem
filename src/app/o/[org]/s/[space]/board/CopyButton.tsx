"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
