import {
  pgTable,
  serial,
  text,
  jsonb,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Maps our internal lead fields to a connected form's field identifiers. Each
// value is the source form field's ref/id (Typeform `field.ref`), or null when
// that lead attribute is not mapped. `email` is required for a usable source.
export type FormFieldMapping = {
  email: string | null;
  name: string | null;
  company: string | null;
  message: string | null;
};

const emptyMapping: FormFieldMapping = {
  email: null,
  name: null,
  company: null,
  message: null,
};

// A configured external form whose submissions are pulled into the funnel as
// leads (one-way: read only). v1 supports Typeform via the Replit managed
// connector. Tenant-scoped like every Marketing OS table; the raw provider
// token is never stored here (the managed connector proxy serves it).
export const marketingFormSourcesTable = pgTable(
  "marketing_form_sources",
  {
    id: serial("id").primaryKey(),
    tenant: text("tenant").notNull().default("arc"),
    // Source provider. v1: typeform.
    provider: text("provider").notNull().default("typeform"),
    // The provider's form identifier (Typeform form id).
    formId: text("form_id").notNull(),
    formTitle: text("form_title"),
    // Which source field maps to each lead attribute.
    fieldMapping: jsonb("field_mapping")
      .$type<FormFieldMapping>()
      .notNull()
      .default(emptyMapping),
    // When false, the poller and manual sync skip this source.
    enabled: boolean("enabled").notNull().default(true),
    // Reflects the actual outcome of the last Typeform webhook registration so
    // the UI can show whether a form captures instantly or relies on polling:
    //   "registered" → webhook is live (instant capture)
    //   "failed"     → registration was attempted but failed (needs a retry)
    //   "none"       → no webhook (e.g. no secret configured) → polling only
    webhookStatus: text("webhook_status").notNull().default("none"),
    // Incremental cursor: the submitted_at timestamp of the newest response
    // ingested so far, used as the `since` bound on the next sync.
    lastResponseToken: text("last_response_token"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("marketing_form_sources_tenant_provider_form_unique").on(
      t.tenant,
      t.provider,
      t.formId,
    ),
  ],
);

export const insertMarketingFormSourceSchema = createInsertSchema(
  marketingFormSourcesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingFormSource = z.infer<
  typeof insertMarketingFormSourceSchema
>;
export type MarketingFormSource =
  typeof marketingFormSourcesTable.$inferSelect;
