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
  // Bookkeeping for the educational-insight generator, which runs on its own
  // (longer) cadence than the proactive suggestion review and refreshes when the
  // brand state meaningfully changes.
  lastInsightsAt: timestamp("last_insights_at"),
  lastInsightsStateHash: text("last_insights_state_hash").notNull().default(""),
  // When the strategist last posted its once-a-day, fully tailored guidance
  // message into the chat. Gated separately from the (slower) educational
  // insights above and only runs once the full foundation is complete.
  lastDailyInsightAt: timestamp("last_daily_insight_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AssistantReview = typeof assistantReviewsTable.$inferSelect;
