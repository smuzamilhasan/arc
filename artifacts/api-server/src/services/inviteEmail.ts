// Builds the invite email (subject + branded HTML/text) and resolves the
// public app origin the invite link should point at.
import type { InvitationKind } from "@workspace/db";

// Derive the public origin from the Replit-provided environment rather than
// hard-coding it. REPLIT_DOMAINS is a comma-separated list of production
// domains; REPLIT_DEV_DOMAIN is the development preview host.
export function appOrigin(): string {
  const explicit = process.env.APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const host = domains[0] ?? process.env.REPLIT_DEV_DOMAIN?.trim();
  return host ? `https://${host}` : "http://localhost:5000";
}

export function inviteUrl(token: string): string {
  return `${appOrigin()}/invite/${token}`;
}

export interface InviteEmailParams {
  token: string;
  kind: InvitationKind;
  inviterName: string;
  agencyName: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildInviteEmail(params: InviteEmailParams): BuiltEmail {
  const { token, kind, inviterName, agencyName } = params;
  const url = inviteUrl(token);
  const logoUrl = `${appOrigin()}/email-logo.png`;
  const roleLine =
    kind === "member"
      ? `${inviterName} has invited you to join ${agencyName} as a team member on arc.`
      : `${inviterName} from ${agencyName} has set up a personal-brand profile for you on arc.`;
  const subject =
    kind === "member"
      ? `You're invited to join ${agencyName} on arc`
      : `${inviterName} invited you to arc`;

  const text = [
    roleLine,
    "",
    "arc is a personal-brand strategy tool: it audits how you show up across Google search and AI models, shapes a positioning narrative, and drives your content strategy.",
    "",
    `Accept your invitation: ${url}`,
    "",
    "If you weren't expecting this, you can safely ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <img src="${logoUrl}" alt="arc" width="120" height="47" style="display:block;border:0;outline:none;text-decoration:none;height:47px;width:120px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#27272a;">${escapeHtml(roleLine)}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
                  arc is a personal-brand strategy tool: it audits how you show up across Google search and AI models, shapes a positioning narrative, and drives your content strategy.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#71717a;">Or paste this link into your browser:</p>
                <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:#3f3f46;">${url}</p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">If you weren't expecting this, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
