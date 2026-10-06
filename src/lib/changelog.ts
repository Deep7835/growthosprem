// Product updates shown from the sidebar (Product Updates) and on /o/[org]/updates. Newest first.
// Add an entry when a release changes something people will notice.

export type ChangeTag = "new" | "improved" | "fixed";

export interface Change {
  /** Stable id; the "New" badge compares the newest id with the last one a person opened. */
  id: string;
  date: string;
  tags: ChangeTag[];
  title: string;
  body: string;
}

export const CHANGELOG: Change[] = [
  {
    id: "2026-10-06-shell",
    date: "2026-10-06",
    tags: ["new", "improved", "fixed"],
    title: "A new home for navigation",
    body: "The sidebar now runs the full height with your organisation at the top. Search your spaces, open and close them, see each space's projects with a count, and create a project right from the list. Settings sit behind the gear. Search opens with ⌘K or ⌘/, and errors now appear as a short message in the corner. Search no longer shows an error while you type quickly.",
  },
  {
    id: "2026-10-06-tagging",
    date: "2026-10-06",
    tags: ["new"],
    title: "AI tags for every post",
    body: "Posts are tagged with a content pillar, topic and hook type. Analytics gains Topic and Hook breakdowns, so you can see which ideas and openings work, and you can correct any tag by hand.",
  },
  {
    id: "2026-10-06-billing",
    date: "2026-10-06",
    tags: ["new"],
    title: "Plans per client space and GST invoices",
    body: "Pick a plan per active space with team seats included. Invoices show CGST and SGST or IGST, and archived spaces aren't billed.",
  },
  {
    id: "2026-10-06-spaces",
    date: "2026-10-06",
    tags: ["new"],
    title: "Create, archive and restore spaces",
    body: "A new dialog creates a space with its statuses and members. Archived spaces become read-only, and deleted spaces can be restored for 30 days.",
  },
  {
    id: "2026-10-06-projects",
    date: "2026-10-06",
    tags: ["new"],
    title: "Projects and the Create menu",
    body: "Group work into projects such as a Diwali campaign, each with its own Board, Table, Calendar, Previews and Notes. Manage statuses per space, and create content, tasks or notes from one menu.",
  },
  {
    id: "2026-10-06-tasks",
    date: "2026-10-06",
    tags: ["new"],
    title: "Tasks and browser notifications",
    body: "Plan the work around each post with tasks and templates per format, switch between Content and Tasks on every view, and get notified in the browser even when Plotline isn't open.",
  },
  {
    id: "2026-10-06-search",
    date: "2026-10-06",
    tags: ["new", "improved"],
    title: "Search everything, captions per platform",
    body: "Find posts, captions, tasks, notes and ideas from anywhere. Choose which notifications you get and how, and write a different caption for Instagram and Facebook.",
  },
  {
    id: "2026-10-05-strategy",
    date: "2026-10-05",
    tags: ["new"],
    title: "Strategy wizard and 30-day planner",
    body: "Build a strategy from Brand Brain and your results, share it with a link, and turn it into a month of posts with India's festivals in place.",
  },
];

export const TAG_LABEL: Record<ChangeTag, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
