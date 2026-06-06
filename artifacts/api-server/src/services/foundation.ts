import { desc, eq } from "drizzle-orm";
import {
  db,
  auditResultsTable,
  narrativeProfilesTable,
  platformStrategiesTable,
  industryOverviewTable,
  type ClientProfile,
} from "@workspace/db";
import { isBlueprintComplete } from "./platforms";

// True once the core foundation is in place: a complete Blueprint plus an audit,
// a narrative (with a synthesized core narrative), and a platform strategy.
// Mirrors isFoundationComplete in the web app's src/lib/blueprint.ts. This is the
// gate the Industry Overview capstone unlocks behind.
export async function isFoundationComplete(client: ClientProfile): Promise<boolean> {
  if (!isBlueprintComplete(client)) return false;
  const [audit] = await db
    .select({ id: auditResultsTable.id })
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, client.id))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  if (!audit) return false;
  const [narrative] = await db
    .select({ coreNarrative: narrativeProfilesTable.coreNarrative })
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);
  if (!narrative || !narrative.coreNarrative) return false;
  const [platforms] = await db
    .select({ id: platformStrategiesTable.id })
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  if (!platforms) return false;
  return true;
}

// True once the ENTIRE foundation is in place: everything isFoundationComplete
// checks PLUS a generated Industry Overview (the capstone). This is the bar that
// unlocks every agent and starts the daily strategist guidance — the agents only
// reason well once the client has supplied and confirmed their full foundation.
export async function areAgentsUnlocked(client: ClientProfile): Promise<boolean> {
  if (!(await isFoundationComplete(client))) return false;
  const [overview] = await db
    .select({ id: industryOverviewTable.id })
    .from(industryOverviewTable)
    .where(eq(industryOverviewTable.clientId, client.id))
    .orderBy(desc(industryOverviewTable.id))
    .limit(1);
  return Boolean(overview);
}

// The single user-facing message every agent surface returns when locked, so the
// server-side 403 copy matches the client-side LockedPanel everywhere.
export const AGENTS_LOCKED_MESSAGE =
  "Complete your full foundation — Blueprint, Audit, Narrative, Platforms, and Industry Overview — to unlock the agents.";

// Convenience for route handlers: returns the lock message when the agents are
// not yet available, or null when they are unlocked.
export async function agentsGateError(client: ClientProfile): Promise<string | null> {
  return (await areAgentsUnlocked(client)) ? null : AGENTS_LOCKED_MESSAGE;
}
