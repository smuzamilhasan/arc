import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientProfileTable = pgTable("client_profile", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  location: text("location").notNull().default(""),
  headline: text("headline").notNull().default(""),
  currentRole: text("current_role").notNull().default(""),
  company: text("company").notNull().default(""),
  industry: text("industry").notNull().default(""),
  yearsExperience: integer("years_experience").notNull().default(0),
  achievements: text("achievements").array().notNull().default([]),
  goals: text("goals").notNull().default(""),
  bio: text("bio").notNull().default(""),
  website: text("website"),
  newsletter: text("newsletter"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  instagramUrl: text("instagram_url"),
  youtubeUrl: text("youtube_url"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientProfileSchema = createInsertSchema(clientProfileTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClientProfile = z.infer<typeof insertClientProfileSchema>;
export type ClientProfile = typeof clientProfileTable.$inferSelect;
