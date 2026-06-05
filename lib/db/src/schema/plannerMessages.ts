import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { AssistantDiffItem } from "./assistantMessages";

export type PlannerRole = "user" | "assistant";

export type PlannerActionStatus = "proposed" | "applied" | "rejected";

// The set of calendar/scheduling operations the conversational Planner is
// allowed to propose. The Planner is the SOLE owner of these: generating a
// calendar, scheduling existing posts, rescheduling, deleting, and shifting
// posts in time. Strategy/profile edits belong to the Strategist, not here.
export type PlannerActionKind =
  | "generate_calendar"
  | "schedule_posts"
  | "reschedule_posts"
  | "delete_posts"
  | "shift_posts";

// A single before -> after change, surfaced on the proposal card. Reuses the
// same shape as the Strategist's diff so the frontend renders both identically.
export type PlannerDiffItem = AssistantDiffItem;

// A concrete calendar change the Planner proposes. It is only ever applied to
// the underlying posts/ideas after the client confirms it (status -> "applied").
export type PlannerAction = {
  id: string;
  kind: PlannerActionKind;
  title: string;
  rationale: string;
  status: PlannerActionStatus;
  rejectionComment: string | null;
  diff: PlannerDiffItem[];
  payload: Record<string, unknown> | null;
};

const emptyActions: PlannerAction[] = [];

export const plannerMessagesTable = pgTable("planner_messages", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull().default(""),
  actions: jsonb("actions").$type<PlannerAction[]>().notNull().default(emptyActions),
  // Whether the client has seen this message. Interactive replies are inserted
  // seen; Manager hand-offs are inserted unseen so the Planner can surface an
  // unread indicator until the client opens it.
  seen: boolean("seen").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlannerMessageSchema = createInsertSchema(plannerMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPlannerMessage = z.infer<typeof insertPlannerMessageSchema>;
export type PlannerMessage = typeof plannerMessagesTable.$inferSelect;
