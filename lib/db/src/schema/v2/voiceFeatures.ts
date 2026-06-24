// voice_features — point-in-time snapshots of computed voice features.
//
// We snapshot rather than overwrite so we can diff over time and detect drift.
// The "current" features for a user live on `client_profile.voice_v2` (JSONB).
// This table is the audit trail.

import { pgTable, serial, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import type { VoiceV2 } from "./profileLayers";

export const voiceFeaturesTable = pgTable(
  "voice_features",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
    features: jsonb("features").$type<VoiceV2>().notNull(),
    sampleCount: integer("sample_count").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    // SHA-256 of the sample-id set this was computed over, for cache invalidation
    inputDigest: jsonb("input_digest").$type<{ sample_ids: number[]; hash: string }>().notNull(),
  },
  (t) => ({
    clientIdx: index("voice_features_client_idx").on(t.clientId, t.computedAt),
  })
);

export type VoiceFeatureRow = typeof voiceFeaturesTable.$inferSelect;
export type InsertVoiceFeatureRow = typeof voiceFeaturesTable.$inferInsert;
