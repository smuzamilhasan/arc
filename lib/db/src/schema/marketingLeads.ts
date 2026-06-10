import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// An inbound marketing lead captured into the funnel (from a webhook, a public
// form, or manual entry). Every Marketing OS table carries a `tenant` column so
// the funnel can later be offered to multiple orgs; for v1 every row defaults to
// the internal 'arc' tenant. All reads/writes scope by tenant.
export const marketingLeadsTable = pgTable("marketing_leads", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull().default("arc"),
  name: text("name"),
  email: text("email").notNull(),
  company: text("company"),
  // The lead's own inbound inquiry text, used to assess fit.
  message: text("message"),
  // Where the lead came from: webhook | form | manual | typeform.
  source: text("source").notNull().default("manual"),
  // For leads pulled from an external source (e.g. a Typeform submission),
  // the provider key and the source's own record id, used to dedupe so the
  // same submission is never ingested twice. Null for non-external leads.
  externalSource: text("external_source"),
  externalId: text("external_id"),
  // AI-assessed fit (0-100) and tier, populated by the qualifier.
  fitScore: integer("fit_score"),
  fitTier: text("fit_tier"),
  // Lifecycle: new | qualified | contacted | booked | archived.
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  // Race-safe dedup for externally ingested leads: a given provider record can
  // only ever produce one lead per tenant. Partial so manual leads (null
  // external fields) are never constrained.
  uniqueIndex("marketing_leads_external_unique")
    .on(t.tenant, t.externalSource, t.externalId)
    .where(sql`${t.externalId} is not null`),
]);

export const insertMarketingLeadSchema = createInsertSchema(
  marketingLeadsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingLead = z.infer<typeof insertMarketingLeadSchema>;
export type MarketingLead = typeof marketingLeadsTable.$inferSelect;
