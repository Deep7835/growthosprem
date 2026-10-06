// Support Center tickets (sidebar › Support Center): saved, files kept in storage, and emailed to
// SUPPORT_EMAIL with the person as reply-to when that and email sending are set up.
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { supportTickets } from "@/db/schema";
import { escapeHtml } from "@/lib/email";
import { TICKET_CATEGORIES } from "@/lib/help";
import { sendEmail } from "@/server/email";
import { getStorage } from "@/storage";
import { listVisibleSpaces, type OrgContext } from "@/server/tenancy";

export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TYPES = /^(image\/(png|jpe?g|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/pdf)$/;

export const TicketInput = z.object({
  category: z.enum(TICKET_CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  message: z.string().trim().min(10, "Tell us a little more, at least a sentence.").max(5000),
  space: z.string().max(80).nullable(),
});

/** Checks the files before anything is saved; returns why one can't be attached. */
export function checkFiles(files: File[]) {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  for (const f of files) {
    if (!TYPES.test(f.type)) return `“${f.name}” isn’t an image, video or PDF.`;
    if (f.size > MAX_FILE_BYTES) return `“${f.name}” is over 10 MB.`;
  }
  return null;
}

const safeName = (name: string) => name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^[^a-z0-9]+/i, "").slice(0, 80) || "file";

export async function createTicket(ctx: OrgContext, orgSlug: string, input: z.infer<typeof TicketInput>, files: File[]) {
  const spaces = await listVisibleSpaces(orgSlug);
  const space = input.space ? spaces.find((s) => s.slug === input.space) : undefined;
  const category = TICKET_CATEGORIES.find((c) => c.id === input.category)!.label;
  const [ticket] = await withOrg(ctx.org.id, (tx) =>
    tx.insert(supportTickets).values({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: space?.id ?? null, category: input.category, message: input.message, email: ctx.user.email }).returning(),
  );

  const storage = getStorage();
  const stored: { name: string; key: string; size: number; type: string; body: Buffer }[] = [];
  for (const [i, f] of files.entries()) {
    const body = Buffer.from(await f.arrayBuffer());
    const key = `support/${ctx.org.id}/${ticket.id}/${i + 1}-${safeName(f.name)}`;
    await storage.putBuffer(key, body);
    stored.push({ name: f.name, key, size: f.size, type: f.type, body });
  }
  if (stored.length) {
    await withOrg(ctx.org.id, (tx) => tx.update(supportTickets).set({ attachments: stored.map((x) => ({ name: x.name, key: x.key, size: x.size, type: x.type })) }).where(eq(supportTickets.id, ticket.id)));
  }

  const to = process.env.SUPPORT_EMAIL;
  let emailed = false;
  if (to) {
    const lines = [`From: ${ctx.user.name} <${ctx.user.email}>`, `Organisation: ${ctx.org.name} (${ctx.org.slug})`, `Space: ${space?.name ?? "Not chosen"}`, `Topic: ${category}`];
    if (stored.length) lines.push(`Attached: ${stored.map((x) => x.name).join(", ")}`);
    lines.push("", input.message);
    const sent = await sendEmail({
      to,
      replyTo: ctx.user.email,
      subject: `[Plotline support] ${category} · ${ctx.org.name}`,
      text: lines.join("\n"),
      html: lines.map((l) => `<p>${escapeHtml(l) || "&nbsp;"}</p>`).join(""),
      idempotencyKey: `ticket-${ticket.id}`,
      attachments: stored.map((s) => ({ filename: s.name, content: s.body })),
    });
    emailed = sent.sent;
    if (emailed) await withOrg(ctx.org.id, (tx) => tx.update(supportTickets).set({ emailed: true }).where(eq(supportTickets.id, ticket.id)));
  }
  return { id: ticket.id, emailed, files: stored.length };
}
