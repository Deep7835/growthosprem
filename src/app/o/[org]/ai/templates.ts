// Built-in prompt templates (AI-09): starting points for common jobs. The chat home shows the
// first few; AI › Prompts shows them all, grouped.
export const PROMPT_LIBRARY: { group: string; prompts: { title: string; body: string }[] }[] = [
  {
    group: "Planning",
    prompts: [
      { title: "Plan next week", body: "Plan next week’s posts based on what works for us: formats, days and times, with a working title for each." },
      { title: "Fill the gaps in the calendar", body: "Look at the calendar for the next two weeks and suggest posts for the days with nothing planned." },
      { title: "A festival week", body: "Plan a Diwali week: a teaser, an offer post and a follow-up, with captions in our voice." },
      { title: "Ideas from what works", body: "Brainstorm 8 post ideas from what works for us and add them to the Idea Bank." },
    ],
  },
  {
    group: "Writing",
    prompts: [
      { title: "Captions for review", body: "Write captions for the posts waiting for client review, in our brand voice." },
      { title: "Hinglish versions", body: "Rewrite the captions of next week’s posts in Hinglish, keeping the hook and the call to action." },
      { title: "Five hooks", body: "Give me five opening lines for a Reel about our best-selling product, each a different hook type." },
    ],
  },
  {
    group: "Analysis",
    prompts: [
      { title: "Last 30 days", body: "How did we do in the last 30 days, and what should we change?" },
      { title: "Best and worst posts", body: "Compare our three best and three worst posts this month. What made the difference?" },
      { title: "Best time to post", body: "When does our audience engage most? Suggest the best days and times for each format." },
    ],
  },
  {
    group: "Across clients",
    prompts: [
      { title: "Who needs attention", body: "Which client needs attention this week?" },
      { title: "One line per space", body: "Summarise every space’s last 30 days in one line each." },
      { title: "Waiting on clients", body: "What’s waiting for client approval?" },
      { title: "My notifications", body: "Summarize my recent notifications and tell me if there are any actions I need to take." },
    ],
  },
];

export const SPACE_TEMPLATES = [
  "How did we do in the last 30 days, and what should we change?",
  "Plan next week’s posts based on what works for us.",
  "Write captions for the posts waiting for client review.",
  "Plan a Diwali week: teaser, offer and follow-up posts.",
  "Brainstorm 8 post ideas from what works for us and add them to the Idea Bank.",
];

export const ORG_TEMPLATES = ["Which client needs attention this week?", "Summarise every space’s last 30 days in one line each.", "What’s waiting for client approval?"];
