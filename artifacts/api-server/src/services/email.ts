// Reusable transactional email helper. Sends via the Resend REST API using
// the RESEND_API_KEY environment variable. Per-call apiKey overrides the
// default for callers that supply their own BYO key.
import { logger } from "../lib/logger";

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
  // When provided, overrides RESEND_API_KEY for callers supplying a per-client BYO key.
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
  const apiKey = input.apiKey ?? process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logger.error(
      { to: input.to },
      "RESEND_API_KEY is not set; cannot send email — add it to your environment variables",
    );
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
