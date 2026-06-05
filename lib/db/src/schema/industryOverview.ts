import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A notable person (or organization) in the client's industry — used for both
// "competitors to watch" and "thought leaders to learn from".
export type IndustryPlayer = {
  name: string;
  description: string;
  positioning: string;
};

// One move in the industry-specific personal-branding playbook.
export type PlaybookMove = {
  title: string;
  detail: string;
};

// A grounded web source the overview was built from.
export type IndustrySource = {
  title: string;
  url: string;
};

export const industryOverviewTable = pgTable("industry_overview", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  industry: text("industry").notNull().default(""),
  geographyFocus: text("geography_focus").notNull().default(""),
  landscapeContext: text("landscape_context").notNull().default(""),
  competitors: jsonb("competitors").$type<IndustryPlayer[]>().notNull().default([]),
  thoughtLeaders: jsonb("thought_leaders").$type<IndustryPlayer[]>().notNull().default([]),
  playbook: jsonb("playbook").$type<PlaybookMove[]>().notNull().default([]),
  sources: jsonb("sources").$type<IndustrySource[]>().notNull().default([]),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIndustryOverviewSchema = createInsertSchema(industryOverviewTable).omit({
  id: true,
  createdAt: true,
});
export type InsertIndustryOverview = z.infer<typeof insertIndustryOverviewSchema>;
export type IndustryOverview = typeof industryOverviewTable.$inferSelect;
