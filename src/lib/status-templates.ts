// Status templates for new spaces (ST-02). Each template covers all four categories (ST-01).

export type StatusCategory = "not_started" | "active" | "completed" | "closed";
export type ReviewRole = "in_review" | "approved" | "changes_requested" | null;
export type StatusSeed = [name: string, color: string, category: StatusCategory, reviewRole: ReviewRole, autopost?: boolean];

export const STATUS_TEMPLATES = {
  default: {
    label: "Default",
    description: "Idea, In progress, Pending, Approved, Closed",
    statuses: [
      ["Idea", "#9CA3AF", "not_started", null],
      ["In progress", "#F2A93B", "active", null],
      ["Pending", "#F472B6", "active", "in_review"],
      ["Approved", "#34D399", "completed", "approved", true],
      ["Closed", "#6B7280", "closed", null],
    ] as StatusSeed[],
  },
  agency: {
    label: "Agency pipeline",
    description: "Brief, internal review, client review and changes requested",
    statuses: [
      ["Idea", "#9CA3AF", "not_started", null],
      ["Brief", "#A78BFA", "not_started", null],
      ["In progress", "#F2A93B", "active", null],
      ["Internal review", "#60A5FA", "active", null],
      ["Client review", "#F472B6", "active", "in_review"],
      ["Changes requested", "#F87171", "active", "changes_requested"],
      ["Approved", "#34D399", "completed", "approved", true],
      ["Closed", "#6B7280", "closed", null],
    ] as StatusSeed[],
  },
  simple: {
    label: "Simple to-do",
    description: "To do, Doing, Done",
    statuses: [
      ["To do", "#9CA3AF", "not_started", null],
      ["Doing", "#F2A93B", "active", null],
      ["Done", "#34D399", "completed", "approved", true],
      ["Archived", "#6B7280", "closed", null],
    ] as StatusSeed[],
  },
} as const;

export type StatusTemplateKey = keyof typeof STATUS_TEMPLATES;
