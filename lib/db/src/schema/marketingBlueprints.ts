import { pgTable, serial, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The desired-state definition of a marketing funnel. Marketing OS is a control
// plane: the blueprint describes WHAT the funnel should look like across the
// user's own tools, and the provisioning engine reconciles each connected tool
// toward this definition (e.g. create the intake form in Typeform, create the
// CRM base in Airtable). The blueprint itself never touches an external service.
export type BlueprintFieldType = "short_text" | "long_text" | "email" | "number";

export interface BlueprintIntakeField {
  // Stable key tying a form field to a lead attribute. Standard keys
  // (name, email, company, message) map onto lead columns; others are extra.
  key: string;
  label: string;
  type: BlueprintFieldType;
  required: boolean;
}

export interface BlueprintCrmField {
  name: string;
  type: BlueprintFieldType;
}

export interface BlueprintCrmTable {
  name: string;
  description?: string;
  fields: BlueprintCrmField[];
}

export interface BlueprintDefinition {
  // Capture stage: the intake form pushed into a form tool (Typeform).
  intakeForm: {
    title: string;
    fields: BlueprintIntakeField[];
  };
  // Re-engage stage: the CRM base/tables pushed into a CRM tool (Airtable).
  crm: {
    baseName: string;
    tables: BlueprintCrmTable[];
  };
}

// A funnel blueprint, scoped per tenant like every other Marketing OS table.
// v1 is single-blueprint-per-tenant (named "default"), but the (tenant, name)
// unique key leaves room for multiple named blueprints later.
export const marketingBlueprintsTable = pgTable(
  "marketing_blueprints",
  {
    id: serial("id").primaryKey(),
    tenant: text("tenant").notNull().default("arc"),
    name: text("name").notNull().default("default"),
    definition: jsonb("definition").$type<BlueprintDefinition>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("marketing_blueprints_tenant_name_unique").on(t.tenant, t.name)],
);

export const insertMarketingBlueprintSchema = createInsertSchema(
  marketingBlueprintsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingBlueprint = z.infer<
  typeof insertMarketingBlueprintSchema
>;
export type MarketingBlueprint = typeof marketingBlueprintsTable.$inferSelect;
