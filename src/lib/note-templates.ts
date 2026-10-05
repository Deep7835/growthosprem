// Starting points for new notes (VW-06: briefs and meeting notes).
import type { DocNode } from "./notes";

const h = (level: number, text: string): DocNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const p = (text = ""): DocNode => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
const todo = (...items: string[]): DocNode => ({
  type: "taskList",
  content: items.map((t) => ({ type: "taskItem", attrs: { checked: false }, content: [p(t)] })),
});
const bullets = (...items: string[]): DocNode => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) });

export const NOTE_TEMPLATES = {
  blank: { label: "Blank note", title: "", doc: { type: "doc", content: [p()] } as DocNode },
  brief: {
    label: "Campaign brief",
    title: "Campaign brief",
    doc: {
      type: "doc",
      content: [
        h(2, "Goal"),
        p("What should this campaign achieve, and how will we know?"),
        h(2, "Audience"),
        p("Who is it for? Where are they, and what do they care about?"),
        h(2, "Key message"),
        p("One sentence the audience should remember."),
        h(2, "Deliverables"),
        todo("Reel", "Carousel", "Stories", "Captions in English and Hinglish"),
        h(2, "Timeline"),
        bullets("Brief approved:", "Content ready:", "Client review:", "Go live:"),
        h(2, "References"),
        p("Links, past posts that worked (type [[ to link a post), competitor examples."),
      ],
    } as DocNode,
  },
  meeting: {
    label: "Meeting notes",
    title: "Meeting notes",
    doc: {
      type: "doc",
      content: [h(2, "Attendees"), p("Type @ to add people."), h(2, "Agenda"), bullets(""), h(2, "Decisions"), bullets(""), h(2, "Action items"), todo("")],
    } as DocNode,
  },
  monthly: {
    label: "Monthly check-in",
    title: "Monthly check-in",
    doc: {
      type: "doc",
      content: [
        h(2, "What worked"),
        bullets(""),
        h(2, "What didn’t"),
        bullets(""),
        h(2, "Next month’s focus"),
        bullets(""),
        h(2, "Asks from the client"),
        todo(""),
      ],
    } as DocNode,
  },
} as const;

export type NoteTemplate = keyof typeof NOTE_TEMPLATES;
