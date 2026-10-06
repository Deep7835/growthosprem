import { notFound } from "next/navigation";
import { PrintableNote } from "@/components/notes/NoteExtras";
import { getNote } from "@/server/notes";
import { getSpaceContext } from "@/server/tenancy";

export const metadata = { title: "Print note" };

/** A note on its own page, for Print or Save as PDF (outside the app frame, so only the note prints). */
export default async function PrintNotePage({ params }: PageProps<"/print/[org]/[space]/note/[id]">) {
  const { org, space, id } = await params;
  const ctx = await getSpaceContext(org, space);
  const note = await getNote(ctx, id);
  if (!note) notFound();
  const updated = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: ctx.space.timezone }).format(note.updatedAt);
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <p className="mb-4 text-xs text-muted">
        {ctx.org.name} · {ctx.space.name} · updated {updated}
      </p>
      <PrintableNote title={note.title} content={note.content} />
    </main>
  );
}
