import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
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
  // Where the lead came from: webhook | form | manual.
  source: text("source").notNull().default("manual"),
  // AI-assessed fit (0-100) and tier, populated by the qualifier.
  fitScore: integer("fit_score"),
  fitTier: text("fit_tier"),
  // Lifecycle: new | qualified | contacted | booked | archived.
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMarketingLeadSchema = createInsertSchema(
  marketingLeadsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingLead = z.infer<typeof insertMarketingLeadSchema>;
export type MarketingLead = typeof marketingLeadsTable.$inferSelect;
