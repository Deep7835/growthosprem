import { z } from "zod";
import { checkFiles, createTicket, TicketInput } from "@/server/support";
import { orgContextForRoute } from "@/server/tenancy";

/** Support Center › Submit a ticket, with up to three screenshots or recordings (multipart form). */
export async function POST(request: Request, { params }: RouteContext<"/api/o/[org]/support">) {
  const { org } = await params;
  const { ctx, status } = await orgContextForRoute(org);
  if (!ctx) return Response.json({ error: "Not allowed" }, { status });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That upload didn’t arrive. Try again." }, { status: 400 });
  }
  const input = TicketInput.safeParse({ category: form.get("category"), message: form.get("message"), space: form.get("space") || null });
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const problem = checkFiles(files);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  try {
    const r = await createTicket(ctx, org, input.data, files);
    return Response.json({ ok: true, emailed: r.emailed });
  } catch (e) {
    return Response.json({ error: e instanceof z.ZodError ? "Check the form." : "Couldn’t send it. Try again in a moment." }, { status: 500 });
  }
}
