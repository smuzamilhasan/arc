import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// An append-only Marketing OS activity log: lead captured, qualified, email
// approved/sent, action rejected, etc. Surfaced as the funnel's activity feed.
// Tenant-scoped like every Marketing OS table; leadId is nullable for events
// that are not tied to one lead.
export const marketingActivityTable = pgTable("marketing_activity", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull().default("arc"),
  leadId: integer("lead_id"),
  // A short machine-readable event kind (e.g. lead_captured, lead_qualified,
  // email_sent, action_rejected).
  kind: text("kind").notNull(),
  // A human-readable one-line summary of the event.
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarketingActivitySchema = createInsertSchema(
  marketingActivityTable,
).omit({ id: true, createdAt: true });
export type InsertMarketingActivity = z.infer<
  typeof insertMarketingActivitySchema
>;
export type MarketingActivity = typeof marketingActivityTable.$inferSelect;
