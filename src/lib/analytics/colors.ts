import type { Platform } from "@/lib/placements";

// Categorical slots 2, 1, 3 of the validated chart palette; colour follows the
// platform everywhere, never its rank. Text never uses these colours.
export const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "#eb6834",
  facebook: "#2a78d6",
  linkedin: "#1baf7a",
};

// Sequential blue ramp for magnitude (heatmap), light to dark.
export const HEAT_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
export const HEAT_EMPTY = "#f0efec";
