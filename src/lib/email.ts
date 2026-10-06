// Shared by the web server and the job worker, so no Next.js imports.
import { Resend } from "resend";

export type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * Transactional email through Resend. Without RESEND_API_KEY nothing is sent and the
 * caller shows the link to copy instead, so local development works without email.
 */
export async function sendEmail(message: { to: string; subject: string; html: string; text: string; idempotencyKey?: string; replyTo?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email isn’t set up yet." };
  const from = process.env.EMAIL_FROM ?? "Plotline <onboarding@resend.dev>";
  try {
    const { error } = await new Resend(key).emails.send(
      { from, to: message.to, subject: message.subject, html: message.html, text: message.text, ...(message.replyTo ? { replyTo: message.replyTo } : {}) },
      message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
    );
    if (error) {
      console.error(`Email to ${message.to} failed: ${error.name}: ${error.message}`);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    console.error(`Email to ${message.to} failed`, e);
    return { sent: false, reason: "The email service could not be reached." };
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
