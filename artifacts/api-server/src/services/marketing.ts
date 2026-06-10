import { openai } from "@workspace/integrations-openai-ai-server";
import type { MarketingLead } from "@workspace/db";
import { parseJsonLoose, clampScore } from "./json";

// All Marketing OS rows are scoped by tenant so the funnel can later be offered
// to multiple orgs. v1 is internal-only, so everything lives under one tenant.
export const MARKETING_TENANT = "arc";

export type FitTier = "high" | "medium" | "low";

export interface LeadQualification {
  fitScore: number;
  fitTier: FitTier;
  rationale: string;
  route: FitTier;
  emailSubject: string;
  emailBody: string;
}

// Map a 0-100 fit score onto a routing tier. High fit gets the booking link and
// the warmest outreach; low fit gets a polite, low-touch reply.
export function tierFromScore(score: number): FitTier {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

interface RawQualification {
  fitScore?: number | string;
  rationale?: string;
  emailSubject?: string;
  emailBody?: string;
}

// Score how good a fit an inbound lead is for arc (a personal-brand strategy
// service for individuals) and draft a routed outreach email. This is a
// proposal only — the email is never sent here; a human reviews, edits, and
// approves it. The booking link is woven into high-fit drafts when available.
export async function qualifyLead(
  lead: MarketingLead,
  bookingUrl: string | null,
): Promise<LeadQualification> {
  const leadFacts = [
    lead.name && `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.company && `Company: ${lead.company}`,
    `Source: ${lead.source}`,
    lead.message && `Their inquiry: ${lead.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are the VP of Marketing for arc, a premium personal-brand strategy service. arc works one-on-one with an individual to audit how they show up across Google search and AI models, synthesize a positioning narrative, and run their content strategy. The best-fit lead is an ambitious individual (founder, executive, investor, creator, professional) who wants to deliberately build their personal brand and can invest in a high-touch service. A poor fit is someone looking for a cheap DIY tool, an unrelated B2B vendor pitching us, a spam/recruiting message, or someone whose goals have nothing to do with personal branding.

Assess this inbound lead and draft a single outreach email.

LEAD:
${leadFacts}

Score the lead's fit for arc from 0 to 100, where:
- 70-100 = strong fit: clearly an individual who wants to build their personal brand and looks able to invest. Warm, specific outreach that invites them to book an intro call.
- 40-69 = medium fit: plausibly relevant but unclear intent, budget, or whether personal branding is really their goal. A helpful reply that qualifies them with one or two light questions before pushing a call.
- 0-39 = low fit: off-topic, spam, a vendor pitch, or clearly not the audience. A brief, polite, low-effort acknowledgement; do not push a call.

${bookingUrl ? `Booking link to include ONLY for strong-fit (70+) drafts: ${bookingUrl}` : "No booking link is configured, so do not invent one."}

Write the email in arc's voice: warm, sharp, concise, no hype, no emojis. Address the person by first name if known, otherwise a neutral greeting. Sign off as "The arc team".

Respond with ONLY a JSON object:
{
  "fitScore": <integer 0-100>,
  "rationale": "<2-3 sentences explaining the score and the recommended approach>",
  "emailSubject": "<subject line>",
  "emailBody": "<plain-text email body, with line breaks>"
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<RawQualification>(
    resp.choices[0]?.message?.content ?? "{}",
  );

  const fitScore = clampScore(parsed.fitScore);
  const fitTier = tierFromScore(fitScore);

  return {
    fitScore,
    fitTier,
    route: fitTier,
    rationale: (parsed.rationale ?? "").trim(),
    emailSubject: (parsed.emailSubject ?? "").trim(),
    emailBody: (parsed.emailBody ?? "").trim(),
  };
}
