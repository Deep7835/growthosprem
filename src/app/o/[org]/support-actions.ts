"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { supportTickets } from "@/db/schema";
import { escapeHtml } from "@/lib/email";
import { TICKET_CATEGORIES } from "@/lib/help";
import { sendEmail } from "@/server/email";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";

const Ticket = z.object({
  category: z.enum(TICKET_CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  message: z.string().trim().min(10, "Tell us a little more, at least a sentence.").max(5000),
  space: z.string().max(80).nullable(),
});

/**
 * Support Center › Submit a ticket. Always saved; emailed to SUPPORT_EMAIL (reply goes to the
 * person) when that and email sending are set up.
 */
export async function submitTicket(org: string, raw: unknown): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  try {
    const ctx = await getOrgContext(org);
    const input = Ticket.parse(raw);
    const spaces = await listVisibleSpaces(org);
    const space = input.space ? spaces.find((s) => s.slug === input.space) : undefined;
    const category = TICKET_CATEGORIES.find((c) => c.id === input.category)!.label;
    const [ticket] = await withOrg(ctx.org.id, (tx) =>
      tx.insert(supportTickets).values({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: space?.id ?? null, category: input.category, message: input.message, email: ctx.user.email }).returning(),
    );
    const to = process.env.SUPPORT_EMAIL;
    let emailed = false;
    if (to) {
      const lines = [`From: ${ctx.user.name} <${ctx.user.email}>`, `Organisation: ${ctx.org.name} (${ctx.org.slug})`, `Space: ${space?.name ?? "Not chosen"}`, `Topic: ${category}`, "", input.message];
      const sent = await sendEmail({
        to,
        replyTo: ctx.user.email,
        subject: `[Plotline support] ${category} · ${ctx.org.name}`,
        text: lines.join("\n"),
        html: lines.map((l) => `<p>${escapeHtml(l) || "&nbsp;"}</p>`).join(""),
        idempotencyKey: `ticket-${ticket.id}`,
      });
      emailed = sent.sent;
      if (emailed) await withOrg(ctx.org.id, (tx) => tx.update(supportTickets).set({ emailed: true }).where(eq(supportTickets.id, ticket.id)));
    }
    return { ok: true, emailed };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form.") : e instanceof Error ? e.message : "Couldn’t send it." };
  }
}
