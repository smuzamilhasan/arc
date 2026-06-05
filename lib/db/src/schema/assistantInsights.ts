import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

// The five messaging pillars every piece of arc's educational copy threads
// through. An insight is anchored to exactly one so the surface can colour it
// and so the strategist keeps the guidance balanced across all five.
export type InsightPillar =
  | "patience"
  | "authentic_input"
  | "ai_augments"
  | "creative_thought"
  | "brand_reflects_life";

export const INSIGHT_PILLARS: InsightPillar[] = [
  "patience",
  "authentic_input",
  "ai_augments",
  "creative_thought",
  "brand_reflects_life",
];

// Where an insight is allowed to surface as a contextual card. "general" means
// it is welcome anywhere; the others map to specific pages. The strategist
// panel always shows the full active set regardless of context.
export type InsightContext =
  | "general"
  | "dashboard"
  | "blueprint"
  | "audit"
  | "narrative"
  | "platforms"
  | "content";

export const INSIGHT_CONTEXTS: InsightContext[] = [
  "general",
  "dashboard",
  "blueprint",
  "audit",
  "narrative",
  "platforms",
  "content",
];

const emptyContexts: InsightContext[] = [];

// A short, journey-aware educational/encouraging note the strategist generates
// on its own initiative. Distinct from AssistantAction proposals: an insight is
// never applied to the system — it only teaches and encourages. Persisted so it
// can be surfaced across pages, rotated over time, and dismissed by the client.
export const assistantInsightsTable = pgTable("assistant_insights", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  pillar: text("pillar").$type<InsightPillar>().notNull(),
  contexts: jsonb("contexts").$type<InsightContext[]>().notNull().default(emptyContexts),
  // The journey stage this note was written for, for transparency/debugging.
  stage: text("stage"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AssistantInsight = typeof assistantInsightsTable.$inferSelect;
