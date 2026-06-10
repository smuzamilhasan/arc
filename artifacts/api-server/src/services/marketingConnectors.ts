// Connector registry for the Marketing OS control plane. Marketing OS does not
// replace the user's marketing stack; it ORCHESTRATES the tools the user already
// owns. Each connector describes one such tool: how it authenticates, which
// funnel stage it serves, and whether the provisioning engine can push the
// blueprint's desired state into it. Everything here is tenant-agnostic metadata
// plus per-tenant credential lookups; no external calls happen at import time.
import { and, eq } from "drizzle-orm";
import { db, marketingConnectionsTable } from "@workspace/db";
import { decryptSecret } from "../lib/crypto";
import { MARKETING_TENANT } from "./marketing";

// How a connector proves identity:
// - managed: Replit-managed connector proxy (no key stored; e.g. Typeform).
// - byokey: a bring-your-own API key, stored encrypted at rest.
// - url: only a public URL is needed (e.g. a Calendly booking link).
export type ConnectorAuthType = "managed" | "byokey" | "url";

export interface ConnectorMeta {
  id: string;
  label: string;
  // Funnel stage from the architecture: capture -> qualify -> convert ->
  // nurture -> reengage. `email` is a cross-cutting delivery utility.
  category: "capture" | "qualify" | "convert" | "nurture" | "reengage" | "email";
  authType: ConnectorAuthType;
  // Whether the provisioning engine has an adapter that can push config in.
  provisionable: boolean;
  description: string;
  // For byokey connectors that also need an account/workspace reference
  // (e.g. Airtable workspace id, Make zone base URL).
  accountRefLabel?: string;
  accountRefRequired?: boolean;
}

export const MARKETING_CONNECTORS: ConnectorMeta[] = [
  {
    id: "typeform",
    label: "Typeform",
    category: "capture",
    authType: "managed",
    provisionable: true,
    description:
      "Capture: pull form submissions in as leads, and provision the intake form itself from your blueprint.",
  },
  {
    id: "make",
    label: "Make.com",
    category: "qualify",
    authType: "byokey",
    provisionable: false,
    description:
      "Qualify: orchestrate scenarios that route captured leads through enrichment and scoring.",
    accountRefLabel: "API base URL (your zone, e.g. https://eu1.make.com/api/v2)",
    accountRefRequired: true,
  },
  {
    id: "instantly",
    label: "Instantly",
    category: "convert",
    authType: "byokey",
    provisionable: false,
    description: "Convert: run cold-outreach sequences against qualified leads.",
  },
  {
    id: "beehiiv",
    label: "Beehiiv",
    category: "nurture",
    authType: "byokey",
    provisionable: false,
    description: "Nurture: sync warm leads into a newsletter audience.",
  },
  {
    id: "calendly",
    label: "Calendly",
    category: "nurture",
    authType: "url",
    provisionable: false,
    description: "Nurture: surface a booking link to high-fit leads.",
  },
  {
    id: "airtable",
    label: "Airtable",
    category: "reengage",
    authType: "byokey",
    provisionable: true,
    description:
      "Re-engage: provision a CRM base of leads and subscribers from your blueprint.",
    accountRefLabel: "Workspace ID (from your Airtable workspace URL)",
    accountRefRequired: true,
  },
  {
    id: "resend",
    label: "Resend",
    category: "email",
    authType: "byokey",
    provisionable: false,
    description: "Email: deliver approved outreach emails.",
  },
];

export function getConnector(id: string): ConnectorMeta | undefined {
  return MARKETING_CONNECTORS.find((c) => c.id === id);
}

// The decrypted BYO API key for a connector, or null when not connected.
// Only valid for byokey connectors; managed/url connectors return null.
export async function getConnectorApiKey(
  provider: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, provider),
      ),
    );
  if (!row?.apiKeyEncrypted) return null;
  return decryptSecret(row.apiKeyEncrypted);
}

// The stored account/workspace reference for a connector, if any.
export async function getConnectorAccountRef(
  provider: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, provider),
      ),
    );
  return row?.accountRef ?? null;
}
