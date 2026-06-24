// ingest_runs — audit trail of Apify ingest invocations per user per source.

import { pgTable, serial, integer, text, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";

export const INGEST_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const ingestRunsTable = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    source: text("source").notNull(),
    actorId: text("actor_id").notNull(),
    apifyRunId: text("apify_run_id"),
    status: text("status").notNull().default("queued"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    samplesIngested: integer("samples_ingested").notNull().default(0),
    samplesDeduped: integer("samples_deduped").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => ({
    clientIdx: index("ingest_runs_client_idx").on(t.clientId, t.startedAt),
    statusIdx: index("ingest_runs_status_idx").on(t.status),
  })
);

export type IngestRun = typeof ingestRunsTable.$inferSelect;
export type InsertIngestRun = typeof ingestRunsTable.$inferInsert;
