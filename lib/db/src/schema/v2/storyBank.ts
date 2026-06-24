// story_bank — redeployable anecdotes the Ghostwriter can anchor drafts to.
//
// Stories arrive from voice extraction (as candidates) and are confirmed during
// conversational onboarding. Each redeployment updates `last_used_at` so the
// Ghostwriter avoids over-using the same story across a short window.

import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const audienceResonanceSchema = z.object({
  archetypes: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
}).passthrough();
export type AudienceResonance = z.infer<typeof audienceResonanceSchema>;

export const storyBankTable = pgTable(
  "story_bank",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    themes: text("themes").array().notNull().default([]),
    sourceSampleIds: integer("source_sample_ids").array().notNull().default([]),
    audienceResonance: jsonb("audience_resonance").$type<AudienceResonance>(),
    status: text("status").notNull().default("candidate"), // 'candidate' | 'confirmed' | 'archived'
    confidence: integer("confidence").notNull().default(0), // 0-100
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    clientIdx: index("story_bank_client_idx").on(t.clientId, t.status),
  })
);

export type StoryBankEntry = typeof storyBankTable.$inferSelect;
export type InsertStoryBankEntry = typeof storyBankTable.$inferInsert;
