// Marketing OS data helpers: lead capture, AI qualification persistence,
// activity logging, and per-tenant cleanup. Marketing OS tables are keyed by
// `tenant`, NOT by clientId, so they are intentionally NOT part of
// deleteClientData; this module owns their lifecycle instead.
import {
  db,
  marketingLeadsTable,
  marketingActionsTable,
  marketingConnectionsTable,
  marketingActivityTable,
  marketingFormSourcesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { decryptSecret } from "../lib/crypto";
import { MARKETING_TENANT, qualifyLead } from "./marketing";
import type { FitTier } from "./marketing";

type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CaptureLeadInput {
  name?: string | null;
  email: string;
  company?: string | null;
  message?: string | null;
  source: string;
  // For leads ingested from an external provider (e.g. Typeform), the provider
  // key and the source record id, used to dedupe re-syncs.
  externalSource?: string | null;
  externalId?: string | null;
}

// Append an entry to the Marketing OS activity feed. Never throws — a failed
// log line must not break the surrounding operation.
export async function logMarketingActivity(
  kind: string,
  summary: string,
  leadId: number | null,
): Promise<void> {
  try {
    await db.insert(marketingActivityTable).values({
      tenant: MARKETING_TENANT,
      leadId,
      kind,
      summary,
    });
  } catch (err) {
    logger.error({ err, kind }, "Failed to log marketing activity");
  }
}

// Persist a newly captured lead and log the capture event.
export async function captureLead(input: CaptureLeadInput) {
  const [lead] = await db
    .insert(marketingLeadsTable)
    .values({
      tenant: MARKETING_TENANT,
      name: input.name ?? null,
      email: input.email,
      company: input.company ?? null,
      message: input.message ?? null,
      source: input.source,
      externalSource: input.externalSource ?? null,
      externalId: input.externalId ?? null,
    })
    .returning();
  await logMarketingActivity(
    "lead_captured",
    `Lead captured from ${lead.source}: ${lead.name ?? lead.email}`,
    lead.id,
  );
  return lead;
}

// The Calendly booking URL, if one is connected. Surfaced to high-fit leads.
export async function getBookingUrl(): Promise<string | null> {
  const [calendly] = await db
    .select()
    .from(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, "calendly"),
      ),
    );
  return calendly?.bookingUrl ?? null;
}

// The tenant's BYO Resend API key (decrypted), if a Resend connection is
// configured. Used as the source of truth for sending approved outreach so the
// stored connection actually drives delivery; null falls back to the shared
// connector proxy.
export async function getResendApiKey(): Promise<string | null> {
  const [resend] = await db
    .select()
    .from(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, "resend"),
      ),
    );
  if (!resend?.apiKeyEncrypted) return null;
  return decryptSecret(resend.apiKeyEncrypted);
}

// Run the AI qualifier for a lead and persist the result: upsert a single
// pending outreach_email action and stamp the lead's fit score/tier/status.
// Returns the saved action, or null if the lead no longer exists.
export async function runQualification(leadId: number) {
  const [lead] = await db
    .select()
    .from(marketingLeadsTable)
    .where(
      and(
        eq(marketingLeadsTable.id, leadId),
        eq(marketingLeadsTable.tenant, MARKETING_TENANT),
      ),
    );
  if (!lead) return null;

  const bookingUrl = await getBookingUrl();
  const result = await qualifyLead(lead, bookingUrl);
  const includeBooking = result.fitTier === "high" ? bookingUrl : null;
  const now = new Date();

  // Replace any prior pending proposal so re-qualifying never stacks duplicates.
  await db
    .delete(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
        eq(marketingActionsTable.leadId, leadId),
        eq(marketingActionsTable.status, "pending"),
      ),
    );

  // The qualification produces TWO independent proposals, each approved or
  // rejected on its own: a route decision (which funnel track to advance the
  // lead into) and the drafted outreach email. Nothing is executed here.
  await db.insert(marketingActionsTable).values({
    tenant: MARKETING_TENANT,
    leadId,
    kind: "route_decision",
    fitScore: result.fitScore,
    fitTier: result.fitTier,
    rationale: result.rationale,
    route: result.route,
    bookingUrl: includeBooking,
    status: "pending",
  });

  const [action] = await db
    .insert(marketingActionsTable)
    .values({
      tenant: MARKETING_TENANT,
      leadId,
      kind: "outreach_email",
      fitScore: result.fitScore,
      fitTier: result.fitTier,
      rationale: result.rationale,
      route: result.route,
      emailSubject: result.emailSubject,
      emailBody: result.emailBody,
      bookingUrl: includeBooking,
      status: "pending",
    })
    .returning();

  await db
    .update(marketingLeadsTable)
    .set({
      fitScore: result.fitScore,
      fitTier: result.fitTier,
      status: lead.status === "new" ? "qualified" : lead.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(marketingLeadsTable.id, leadId),
        eq(marketingLeadsTable.tenant, MARKETING_TENANT),
      ),
    );

  await logMarketingActivity(
    "lead_qualified",
    `Lead scored ${result.fitScore}/100 (${result.fitTier} fit): ${lead.name ?? lead.email}`,
    leadId,
  );

  return action;
}

// Fire-and-forget qualification used by the public capture endpoints so the
// caller gets a fast 201 while scoring happens in the background.
export function qualifyInBackground(leadId: number): void {
  runQualification(leadId).catch((err) => {
    logger.error({ err, leadId }, "Background lead qualification failed");
  });
}

// Remove every Marketing OS row for a tenant. Mirrors deleteClientData but keyed
// by tenant. Any new Marketing OS table must be added here.
export async function deleteTenantMarketingData(
  tenant: string,
  tx?: TxExecutor,
): Promise<void> {
  const run = async (t: TxExecutor) => {
    await t
      .delete(marketingActivityTable)
      .where(eq(marketingActivityTable.tenant, tenant));
    await t
      .delete(marketingActionsTable)
      .where(eq(marketingActionsTable.tenant, tenant));
    await t
      .delete(marketingConnectionsTable)
      .where(eq(marketingConnectionsTable.tenant, tenant));
    await t
      .delete(marketingFormSourcesTable)
      .where(eq(marketingFormSourcesTable.tenant, tenant));
    await t
      .delete(marketingLeadsTable)
      .where(eq(marketingLeadsTable.tenant, tenant));
  };
  if (tx) {
    await run(tx);
    return;
  }
  await db.transaction(run);
}
