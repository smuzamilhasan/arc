// Funnel Blueprint service: the desired-state model the control plane reconciles
// the user's tools toward. The blueprint is plain config persisted per tenant;
// it never touches an external service. Provisioning adapters read it and push
// the corresponding config into each connected tool.
import { and, eq } from "drizzle-orm";
import {
  db,
  marketingBlueprintsTable,
  type BlueprintDefinition,
  type MarketingBlueprint,
} from "@workspace/db";
import { MARKETING_TENANT } from "./marketing";

export const DEFAULT_BLUEPRINT_NAME = "default";

// The starting funnel: a capture form whose fields map onto our lead columns,
// and a CRM with a Leads table (mirrors the qualified-lead record) plus a
// Subscribers table for the nurture audience. The user edits this to taste.
export function defaultBlueprintDefinition(): BlueprintDefinition {
  return {
    intakeForm: {
      title: "Work with us",
      fields: [
        { key: "name", label: "Your name", type: "short_text", required: true },
        { key: "email", label: "Email address", type: "email", required: true },
        { key: "company", label: "Company", type: "short_text", required: false },
        {
          key: "message",
          label: "What are you looking for?",
          type: "long_text",
          required: false,
        },
      ],
    },
    crm: {
      baseName: "Marketing CRM",
      tables: [
        {
          name: "Leads",
          description: "Inbound leads captured and qualified by Marketing OS.",
          fields: [
            { name: "Name", type: "short_text" },
            { name: "Email", type: "email" },
            { name: "Company", type: "short_text" },
            { name: "Message", type: "long_text" },
            { name: "Fit Score", type: "number" },
            { name: "Fit Tier", type: "short_text" },
            { name: "Status", type: "short_text" },
            { name: "Source", type: "short_text" },
          ],
        },
        {
          name: "Subscribers",
          description: "Warm leads nurtured via newsletter.",
          fields: [
            { name: "Name", type: "short_text" },
            { name: "Email", type: "email" },
            { name: "Status", type: "short_text" },
          ],
        },
      ],
    },
  };
}

// Fetch the tenant's default blueprint, lazily creating it on first access so
// the Build page always has something to edit.
export async function getOrCreateBlueprint(): Promise<MarketingBlueprint> {
  const [existing] = await db
    .select()
    .from(marketingBlueprintsTable)
    .where(
      and(
        eq(marketingBlueprintsTable.tenant, MARKETING_TENANT),
        eq(marketingBlueprintsTable.name, DEFAULT_BLUEPRINT_NAME),
      ),
    );
  if (existing) return existing;

  const [created] = await db
    .insert(marketingBlueprintsTable)
    .values({
      tenant: MARKETING_TENANT,
      name: DEFAULT_BLUEPRINT_NAME,
      definition: defaultBlueprintDefinition(),
    })
    .onConflictDoUpdate({
      target: [marketingBlueprintsTable.tenant, marketingBlueprintsTable.name],
      set: { updatedAt: new Date() },
    })
    .returning();
  return created;
}

export async function updateBlueprint(
  definition: BlueprintDefinition,
): Promise<MarketingBlueprint> {
  // Ensure the row exists first, then update it.
  await getOrCreateBlueprint();
  const [updated] = await db
    .update(marketingBlueprintsTable)
    .set({ definition, updatedAt: new Date() })
    .where(
      and(
        eq(marketingBlueprintsTable.tenant, MARKETING_TENANT),
        eq(marketingBlueprintsTable.name, DEFAULT_BLUEPRINT_NAME),
      ),
    )
    .returning();
  return updated;
}
