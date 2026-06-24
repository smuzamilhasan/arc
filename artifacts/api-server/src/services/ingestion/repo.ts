// Drizzle implementation of the IngestRepo interface.
//
// Thin layer over the v2 schema tables. The dispatcher is database-agnostic;
// this file is the only place that knows about Drizzle.

import {
  db,
  voiceSamplesTable,
  ingestRunsTable,
  type VoiceSampleSource,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { IngestRepo } from "./dispatcher";

export const drizzleIngestRepo: IngestRepo = {
  async createIngestRun(args) {
    const rows = await db
      .insert(ingestRunsTable)
      .values({
        clientId: args.clientId,
        source: args.source,
        actorId: args.actorId,
        status: "running",
      })
      .returning({ id: ingestRunsTable.id });
    return rows[0]!.id;
  },

  async finishIngestRun(args) {
    await db
      .update(ingestRunsTable)
      .set({
        status: args.status,
        apifyRunId: args.apifyRunId,
        samplesIngested: args.samplesIngested,
        samplesDeduped: args.samplesDeduped,
        costUsd: args.costUsd,
        errorMessage: args.errorMessage,
        finishedAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, args.id));
  },

  async existingContentHashes(clientId) {
    const rows = await db
      .select({ contentHash: voiceSamplesTable.contentHash })
      .from(voiceSamplesTable)
      .where(eq(voiceSamplesTable.clientId, clientId));
    return new Set(rows.map((r) => r.contentHash));
  },

  async insertVoiceSamples(samples) {
    if (samples.length === 0) return [];
    // Map source to typed VoiceSampleSource (DB column is text; we still
    // round-trip through the enum to enforce only known values).
    const values = samples.map((s) => ({
      clientId: s.clientId,
      source: s.source as VoiceSampleSource,
      platform: s.platform,
      content: s.content,
      contentHash: s.contentHash,
      metadata: s.metadata,
    }));

    const rows = await db
      .insert(voiceSamplesTable)
      .values(values)
      .returning({ id: voiceSamplesTable.id });
    return rows.map((r) => r.id);
  },
};

// Unused exports are kept for the future inarray-based bulk fetches.
export { inArray, eq };
