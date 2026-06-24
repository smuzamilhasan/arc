// anti_examples — sample texts the user says sounds nothing like them.
//
// Captured during onboarding ("show me 3 posts that sound nothing like you").
// Negative training signal: the Ghostwriter uses these as foils.

import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const antiExamplesTable = pgTable(
  "anti_examples",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    sampleText: text("sample_text").notNull(),
    whyNotThisVoice: text("why_not_this_voice").notNull().default(""),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    clientIdx: index("anti_examples_client_idx").on(t.clientId),
  })
);

export type AntiExample = typeof antiExamplesTable.$inferSelect;
export type InsertAntiExample = typeof antiExamplesTable.$inferInsert;
