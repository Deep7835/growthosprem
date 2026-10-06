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
    id: "2026-10-06-inbox",
    date: "2026-10-06",
    tags: ["new"],
    title: "Inbox (beta): answer comments from Plotline",
    body: "Each space has an Inbox with the comments on its recent Instagram and Facebook posts. Reply without leaving Plotline, mark conversations done, and search them. Direct messages come later, once Meta grants messaging access.",
  },
  {
    id: "2026-10-06-ai-tools",
    date: "2026-10-06",
    tags: ["new"],
    title: "Workflows, a prompt library and your persona",
    body: "AI Copilot can now run workflows on a schedule: weekly ideas into the Idea Bank, a festival planner, analytics and overdue-task digests, and your own prompts. Save prompts you use often, and tell the Copilot how you write in Your persona.",
  },
  {
    id: "2026-10-06-calendar-feed",
    date: "2026-10-06",
    tags: ["new"],
    title: "Your content calendar in Google Calendar",
    body: "Settings › Integrations gives you a private calendar link with every planned post, and tasks due if you like, across your spaces. Subscribe in Google Calendar, Outlook or Apple Calendar. Notes also gain team comments, print and duplicate, support tickets take screenshots, and Autopost has an Instagram first comment default.",
  },
  {
    id: "2026-10-06-analytics-support",
    date: "2026-10-06",
    tags: ["new", "improved"],
    title: "Clearer analytics and a Support Center",
    body: "Analytics has a platform menu, a Reports menu to download posts as a spreadsheet or save a PDF, Insights from the AI Copilot, a donut or bar view of each platform's share, and top posts as cards with their caption and a link to the post. Support Center in the sidebar searches help articles and sends us a ticket.",
  },
  {
    id: "2026-10-06-dashboard",
    date: "2026-10-06",
    tags: ["new", "improved"],
    title: "A dashboard you can arrange",
    body: "Overview is now a set of cards: recent activity, upcoming posts and tasks, what's assigned to you, what's overdue, publishing and every space at a glance. Drag them into your order, make them wider or narrower, hide the ones you don't need, and filter by space and dates. Notifications get filters by type and space, a Summarize button for the AI Copilot, and Delete all for cleared ones.",
  },
  {
    id: "2026-10-06-post-window",
    date: "2026-10-06",
    tags: ["new", "improved"],
    title: "Repurpose, share a post, and add from the calendar",
    body: "Turn a post for several platforms into one post per platform, linked as a group. Share any post with a link that can view, comment or approve and expires when you choose. Change status, assignees, project and tags right in the post window, duplicate, archive or delete from its menu, and add a post or task straight from a day or an empty time on the calendar. Board columns now take their status colour.",
  },
  {
    id: "2026-10-06-settings",
    date: "2026-10-06",
    tags: ["new"],
    title: "All your settings in one window",
    body: "The gear opens Profile, Organisation and every space's settings in one place. Rename your organisation, manage its tags, add your logo and colours to client links, and invite people with a clearer invite window.",
  },
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
