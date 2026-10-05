"use client";

import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass("secondary", "sm")} print:hidden`}>
      Print or save as PDF
    </button>
  );
}
