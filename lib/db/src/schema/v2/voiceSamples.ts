// voice_samples — real artifacts ingested from the user's public footprint or
// pasted in. The Ghostwriter cites these as voice evidence.

import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const voiceSampleSourceSchema = z.enum([
  "linkedin",
  "x",
  "youtube_transcript",
  "podcast_transcript",
  "blog",
  "newsletter",
  "manual_paste",
]);
export type VoiceSampleSource = z.infer<typeof voiceSampleSourceSchema>;

export const voiceSampleMetadataSchema = z.object({
  url: z.string().url().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  engagement: z.object({
    likes: z.number().int().nonnegative().nullable().optional(),
    comments: z.number().int().nonnegative().nullable().optional(),
    shares: z.number().int().nonnegative().nullable().optional(),
  }).nullable().optional(),
  apify_run_id: z.string().nullable().optional(),
  word_count: z.number().int().nonnegative().nullable().optional(),
}).passthrough();
export type VoiceSampleMetadata = z.infer<typeof voiceSampleMetadataSchema>;

export const voiceSamplesTable = pgTable(
  "voice_samples",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    source: text("source").notNull(),
    platform: text("platform"),
    content: text("content").notNull(),
    // SHA-256 of normalized content for dedupe across re-ingest runs
    contentHash: text("content_hash").notNull(),
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
    metadata: jsonb("metadata").$type<VoiceSampleMetadata>(),
  },
  (t) => ({
    clientIdx: index("voice_samples_client_idx").on(t.clientId),
    hashIdx: index("voice_samples_hash_idx").on(t.clientId, t.contentHash),
  })
);

export type VoiceSample = typeof voiceSamplesTable.$inferSelect;
export type InsertVoiceSample = typeof voiceSamplesTable.$inferInsert;
