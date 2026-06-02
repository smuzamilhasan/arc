import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brandProfileTable = pgTable("brand_profile", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  mission: text("mission").notNull(),
  values: text("values").array().notNull().default([]),
  targetAudience: text("target_audience").notNull(),
  toneOfVoice: text("tone_of_voice").notNull(),
  bio: text("bio").notNull(),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  instagramUrl: text("instagram_url"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandProfileSchema = createInsertSchema(brandProfileTable).omit({ id: true, updatedAt: true });
export type InsertBrandProfile = z.infer<typeof insertBrandProfileSchema>;
export type BrandProfile = typeof brandProfileTable.$inferSelect;
