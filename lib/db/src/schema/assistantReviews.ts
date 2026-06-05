import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Bookkeeping for the background proactive-review scheduler. One row per client
// records when the strategist last reviewed their brand foundation and a hash of
// the state it reviewed, so the scheduler can debounce (skip when nothing
// meaningful changed) and respect a per-client cadence.
export const assistantReviewsTable = pgTable("assistant_reviews", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique(),
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastStateHash: text("last_state_hash").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AssistantReview = typeof assistantReviewsTable.$inferSelect;
