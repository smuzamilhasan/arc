// Reusable transactional email helper. Wraps Resend through the Replit
// connector proxy (integration: resend) so no API key is hard-coded — the SDK
// handles identity, token refresh, and auth headers automatically.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

const connectors = new ReplitConnectors();

// Resend's shared onboarding/test domain. It works without verifying a custom
// domain, but can only deliver to the Resend account owner's own address until
// a custom sending domain is verified for production.
const DEFAULT_FROM = "arc <onboarding@resend.dev>";

export function emailFromAddress(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
}

export function usingDefaultSender(): boolean {
  return !process.env.RESEND_FROM?.trim();
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  // When provided, the email is sent directly via the Resend API using this
  // (caller-decrypted) BYO key instead of the shared Replit connector proxy.
  apiKey?: string;
}

// Sends a single transactional email. Returns true on success, false on
// failure (the error is logged, never thrown) so callers can degrade
// gracefully instead of failing the surrounding operation.
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const from = input.from ?? emailFromAddress();
  if (usingDefaultSender()) {
    logger.warn(
      { to: input.to },
      "Sending email via Resend's shared onboarding domain; set RESEND_FROM with a verified custom domain for production delivery to arbitrary recipients",
    );
  }
  const payload = JSON.stringify({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
  });
  try {
    const response = input.apiKey
      ? await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: payload,
        })
      : await connectors.proxy("resend", "/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error(
        { to: input.to, status: response.status, detail },
        "Resend email send failed",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, to: input.to }, "Resend email send threw");
    return false;
  }
}
