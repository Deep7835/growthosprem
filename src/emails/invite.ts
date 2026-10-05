// Invite email (TM-02). Plain HTML with inline styles so it renders in every mail client.

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ROLE = { admin: "an Admin", manager: "a Manager", editor: "an Editor" } as const;

export function inviteEmail(input: {
  inviterName: string;
  orgName: string;
  role: keyof typeof ROLE;
  spaceNames: string[];
  url: string;
  expiresAt: Date;
}) {
  const spaces = input.role === "admin" ? "all spaces" : input.spaceNames.join(", ");
  const expires = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long" }).format(input.expiresAt);
  const subject = `${input.inviterName} invited you to ${input.orgName} on Growth OS`;
  const text = [
    `${input.inviterName} invited you to join ${input.orgName} on Growth OS as ${ROLE[input.role]} (${spaces}).`,
    "",
    `Accept the invite: ${input.url}`,
    "",
    `The link works until ${expires}. If you weren't expecting this, you can ignore this email.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f4f0;font-family:Arial,Helvetica,sans-serif;color:#17181c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e3dc;border-radius:16px;padding:32px">
        <tr><td style="font-size:16px;font-weight:bold;padding-bottom:24px">Growth OS</td></tr>
        <tr><td style="font-size:22px;font-weight:bold;line-height:1.3;padding-bottom:12px">Join ${escape(input.orgName)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3e4148;padding-bottom:24px">
          ${escape(input.inviterName)} invited you to join <strong>${escape(input.orgName)}</strong> as ${ROLE[input.role]} (${escape(spaces)}).
        </td></tr>
        <tr><td style="padding-bottom:24px">
          <a href="${escape(input.url)}" style="display:inline-block;background:#17181c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">Accept invite</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#5b5e66">
          The link works until ${escape(expires)}. If you weren't expecting this, you can ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html, text };
}
