// onboarding_sessions — persist multi-turn Onboarder conversations.
//
// One row per session per client. A client typically has one active session at
// a time but may have many historical ones (re-onboarding, agency reset). The
// session is the unit of state the Onboarder agent reads + writes per turn.

import { pgTable, serial, integer, text, timestamp, jsonb, index, real } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const ONBOARDING_SESSION_STATUSES = ["active", "wrapped", "paused", "abandoned"] as const;
export type OnboardingSessionStatus = (typeof ONBOARDING_SESSION_STATUSES)[number];

// Onboarder conversation turn shape, persisted to the log. Mirrors the runtime
// OnboarderTurn output schema but with timestamps + author tagging.
export const onboardingLogEntrySchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("agent"),
    at: z.string().datetime(),
    kind: z.enum(["question", "patch", "wrap"]),
    target_slot: z.string().optional(),
    question_type: z.enum(["confirm", "drill", "probe", "verify"]).optional(),
    prompt_text: z.string().optional(),
    patch_summary: z.string().optional(),
    wrap_reason: z.enum(["coverage_complete", "perseveration", "user_paused"]).optional(),
  }),
  z.object({
    role: z.literal("user"),
    at: z.string().datetime(),
    text: z.string(),
  }),
]);
export type OnboardingLogEntry = z.infer<typeof onboardingLogEntrySchema>;

// Confidence per slot — used by the playbook to decide what to ask next and
// when to stop. Updated by the service after each agent patch.
export const slotCoverageSchema = z.record(
  z.string(),
  z.object({
    confidence: z.number().min(0).max(1),
    turns_spent: z.number().int().nonnegative(),
    last_touched_at: z.string().datetime(),
  })
);
export type SlotCoverage = z.infer<typeof slotCoverageSchema>;

export const onboardingSessionsTable = pgTable(
  "onboarding_sessions",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastTurnAt: timestamp("last_turn_at").notNull().defaultNow(),
    wrappedAt: timestamp("wrapped_at"),
    wrapReason: text("wrap_reason"), // "coverage_complete" | "perseveration" | "user_paused"
    log: jsonb("log").$type<OnboardingLogEntry[]>().notNull().default([]),
    slotCoverage: jsonb("slot_coverage").$type<SlotCoverage>().notNull().default({}),
    // Snapshot of profile state at session start — for "diff what changed in this session"
    profileSnapshotAtStart: jsonb("profile_snapshot_at_start").$type<Record<string, unknown>>(),
    // Aggregate confidence at last turn. Surfaced in UI as a progress meter.
    aggregateConfidence: real("aggregate_confidence").notNull().default(0),
    turnCount: integer("turn_count").notNull().default(0),
  },
  (t) => ({
    clientIdx: index("onboarding_sessions_client_idx").on(t.clientId, t.status),
    activeIdx: index("onboarding_sessions_active_idx").on(t.clientId, t.startedAt),
  })
);

export type OnboardingSession = typeof onboardingSessionsTable.$inferSelect;
export type InsertOnboardingSession = typeof onboardingSessionsTable.$inferInsert;
