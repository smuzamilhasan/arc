import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// An AI-proposed action for a lead, awaiting human review. v1 only proposes an
// outreach email. The proposal holds the fit assessment plus an editable draft
// email; nothing is sent until a human approves it (propose-and-approve for ALL
// external actions). Tenant-scoped like every Marketing OS table.
export const marketingActionsTable = pgTable("marketing_actions", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull().default("arc"),
  leadId: integer("lead_id").notNull(),
  // The kind of action proposed. v1: outreach_email.
  kind: text("kind").notNull().default("outreach_email"),
  fitScore: integer("fit_score"),
  fitTier: text("fit_tier"),
  // Why the lead was scored and routed this way.
  rationale: text("rationale"),
  // Recommended routing track based on fit: high | medium | low.
  route: text("route"),
  // The drafted outreach email; editable by the operator before approval.
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  // Calendly booking link surfaced for high-fit leads (snapshot at draft time).
  bookingUrl: text("booking_url"),
  // pending | approved | rejected. Only pending actions can be edited/approved.
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMarketingActionSchema = createInsertSchema(
  marketingActionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingAction = z.infer<typeof insertMarketingActionSchema>;
export type MarketingAction = typeof marketingActionsTable.$inferSelect;
