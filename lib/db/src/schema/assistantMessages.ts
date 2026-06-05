import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type AssistantRole = "user" | "assistant";

export type AssistantActionStatus = "proposed" | "applied" | "rejected";

// The set of system entities the macro strategist is allowed to propose edits
// to. Operational content work (posts, scheduling, ideas) is intentionally NOT
// here — those belong to the specialist agents, not the brand strategist.
export type AssistantActionKind =
  | "update_profile"
  | "update_narrative"
  | "regenerate_narrative"
  | "update_content_strategy"
  | "update_platforms";

// A single field-level before -> after change, surfaced on the proposal card.
export type AssistantDiffItem = {
  label: string;
  before: string;
  after: string;
};

// A concrete edit the assistant proposes. It is only ever persisted to the
// underlying system after the client confirms it (status flips to "applied").
export type AssistantAction = {
  id: string;
  kind: AssistantActionKind;
  title: string;
  rationale: string;
  status: AssistantActionStatus;
  rejectionComment: string | null;
  diff: AssistantDiffItem[];
  payload: Record<string, unknown> | null;
};

const emptyActions: AssistantAction[] = [];

export const assistantMessagesTable = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull().default(""),
  actions: jsonb("actions").$type<AssistantAction[]>().notNull().default(emptyActions),
  // Whether the client has seen this message. Normal replies are inserted as
  // seen; background proactive suggestions are inserted unseen so the launcher
  // can surface an unread indicator until the panel is opened.
  seen: boolean("seen").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssistantMessageSchema = createInsertSchema(assistantMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAssistantMessage = z.infer<typeof insertAssistantMessageSchema>;
export type AssistantMessage = typeof assistantMessagesTable.$inferSelect;
