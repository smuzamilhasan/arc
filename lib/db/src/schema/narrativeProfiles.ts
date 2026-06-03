import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type NarrativeTheme = {
  title: string;
  description: string;
};

export type PlatformRecommendation = {
  platform: string;
  reason: string;
  priority: "high" | "medium" | "low";
};

export type IndustryAnswer = {
  question: string;
  answer: string;
};

export const narrativeProfilesTable = pgTable("narrative_profiles", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  industryAnswers: jsonb("industry_answers").$type<IndustryAnswer[]>().notNull().default([]),
  coreNarrative: text("core_narrative").notNull().default(""),
  pointOfView: text("point_of_view").notNull().default(""),
  themes: jsonb("themes").$type<NarrativeTheme[]>().notNull().default([]),
  recommendedPlatforms: jsonb("recommended_platforms").$type<PlatformRecommendation[]>().notNull().default([]),
  contentHooks: text("content_hooks").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNarrativeProfileSchema = createInsertSchema(narrativeProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNarrativeProfile = z.infer<typeof insertNarrativeProfileSchema>;
export type NarrativeProfile = typeof narrativeProfilesTable.$inferSelect;
