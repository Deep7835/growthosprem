// Support Center: help articles (searched in the help window and listed at /o/[org]/help) and
// the ticket categories. Keep articles to what Plotline does today.

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  body: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "connect-instagram-facebook",
    title: "Connect Instagram and Facebook",
    summary: "Link a client's accounts so Plotline can publish and bring in their results.",
    body: [
      "Open the space, then Settings › Accounts and choose Connect. You sign in with Meta's own login and pick the Facebook Pages and Instagram business accounts the space should use. Personal Instagram accounts need to be switched to a business or creator account first.",
      "Plotline imports the last 90 days of posts and results, then keeps them up to date every day. Access tokens are stored encrypted.",
      "If Meta asks you to log in again, the account shows Reconnect needed and the right people are notified. Reconnecting keeps everything that was already imported.",
    ],
  },
  {
    slug: "plan-a-month",
    title: "Plan a month of posts",
    summary: "Go from a strategy to a calendar with festivals in place.",
    body: [
      "Start with Brand Brain (in the space's header) so the AI knows the brand's voice, audience and pillars. Then open Strategy to build or update the strategy from Brand Brain and your results.",
      "The 30-day planner turns the strategy into draft posts on the calendar, with India's festivals and moments already marked. Every draft can be edited, moved or deleted before anything is scheduled.",
      "You can also add a post or task straight from the calendar: use the + on a day, or click an empty time in Week or Day view.",
    ],
  },
  {
    slug: "client-approval",
    title: "Get a client's approval",
    summary: "Share posts with a link the client opens without an account.",
    body: [
      "Share for client review in the space's header sends everything in the review status as one link. To share a single post, open it and use Share: choose whether the link can view, comment or approve, and when it expires.",
      "The client adds their name, sees real previews and approves or asks for changes. They never see internal comments, tasks or other clients. When a post changes after approval, the approval is cleared so they see the latest version.",
      "Links can be turned off at any time from the post's Share window.",
    ],
  },
  {
    slug: "autopost-or-reminder",
    title: "Autopost or a reminder to post",
    summary: "How scheduling works, and what happens when a post can't go out.",
    body: [
      "Schedule or post in the post window checks that the post is ready for each platform: media, caption length, connected account and format. Autopost publishes it at the time you choose; a reminder notifies the assignees to post it themselves, with the caption ready to copy.",
      "If publishing fails, Plotline says why in plain words, retries when the problem is temporary, and notifies the assignees and the space's Managers if it can't.",
      "Posts published by hand can be marked as posted, so the calendar and analytics stay right.",
    ],
  },
  {
    slug: "repurpose-posts",
    title: "Repurpose a post for each platform",
    summary: "Split one post into a separate post per platform, linked as a group.",
    body: [
      "When a post goes to several places, for example an Instagram Reel and a Facebook Reel, Repurpose in the post window makes one post per platform. Each keeps the date, status, people, tags and media, and a platform's own caption becomes that post's caption.",
      "The posts stay linked: the window lists the others in the group at the top, and Share can include any of them. Scheduled or published posts can't be split; unschedule first.",
    ],
  },
  {
    slug: "roles",
    title: "Roles and who can do what",
    summary: "Owner, Admin, Manager and Editor, and how spaces keep clients apart.",
    body: [
      "Owners and Admins see every space and manage the organisation. Owners also manage billing. Managers run the spaces they're added to: accounts, settings, members and publishing. Editors create and edit posts and tasks but can't publish or change settings, unless a space lets Editors schedule.",
      "People only see the spaces they've been added to, and each organisation's data is kept apart in the database itself. Invite people from Settings › Members or a space's Members tab.",
    ],
  },
  {
    slug: "billing-gst",
    title: "Plans, billing and GST invoices",
    summary: "Pricing per client space, the free trial and invoices.",
    body: [
      "Plans are priced per active client space each month, with team seats included in each space. Archived spaces aren't billed. Every organisation starts with a 14-day free trial.",
      "Add your GSTIN in Settings › Billing and invoices show CGST and SGST or IGST. When the trial or plan ends, everything stays readable but nothing can be changed or published until a plan is chosen.",
    ],
  },
  {
    slug: "ai-copilot",
    title: "Using the AI Copilot",
    summary: "Ask about your results, plan content and write captions.",
    body: [
      "The AI Copilot reads your own data for the spaces you can see: posts, results, calendar, Brand Brain and ideas. Each answer says whether a claim comes from your data or the AI's judgement.",
      "Anything it would change, such as draft posts or ideas, arrives as a card to approve, and Undo is one tap away. Usage is counted in credits against the organisation's monthly budget, which Owners and Admins set in Settings › AI usage.",
    ],
  },
  {
    slug: "shortcuts",
    title: "Keyboard shortcuts",
    summary: "Search, close and move around quickly.",
    body: [
      "Ctrl/⌘ K or Ctrl/⌘ / opens search from anywhere; arrow keys move through results and Enter opens one.",
      "Esc closes the topmost window or menu: a picker, then the post window, then settings.",
    ],
  },
];

export const TICKET_CATEGORIES = [
  { id: "billing", label: "Account and billing" },
  { id: "publishing", label: "Autoposting and publishing" },
  { id: "ai", label: "AI Copilot" },
  { id: "accounts", label: "Connecting social accounts" },
  { id: "feature", label: "Request a feature" },
  { id: "other", label: "Something else" },
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number]["id"];

/** Articles whose title, summary or text contain every word of the query. */
export function searchHelp(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return HELP_ARTICLES.filter((a) => {
    const text = `${a.title} ${a.summary} ${a.body.join(" ")}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
