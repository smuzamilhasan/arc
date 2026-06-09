import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientProfileTable = pgTable("client_profile", {
  id: serial("id").primaryKey(),
  // Nullable: an agency can prebuild a profile that has no owner yet. When the
  // invited client signs up they "claim" it and userId is set to their Clerk id.
  userId: text("user_id").unique(),
  // Canonical, lowercased Clerk-verified email of the profile owner. Source of
  // truth for matching a personal profile back to its owner even when the same
  // person signs in under a different Clerk identity sharing the same verified
  // email (e.g. Google vs email/password). Nullable for unclaimed/agency-prebuilt
  // profiles and backfilled for legacy rows.
  verifiedEmail: text("verified_email"),
  // The agency that created this profile (if any). Access is granted via the
  // agency_client_access table; this just records origin.
  createdByAgencyId: integer("created_by_agency_id"),
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

  // Personal history
  dateOfBirth: text("date_of_birth"),
  placeOfBirth: text("place_of_birth").notNull().default(""),
  earlyLife: text("early_life").notNull().default(""),
  schooling: text("schooling").notNull().default(""),
  university: text("university").notNull().default(""),
  professionalJourney: text("professional_journey").notNull().default(""),

  // Open-ended intake material used to generate the headline + bio
  signatureAchievements: text("signature_achievements").notNull().default(""),
  awards: text("awards").notNull().default(""),
  quantifiableResults: text("quantifiable_results").notNull().default(""),
  audienceImpact: text("audience_impact").notNull().default(""),

  // Conversational, coach-style material that feeds the narrative synthesis
  passions: text("passions").notNull().default(""),
  beliefs: text("beliefs").notNull().default(""),
  frustrations: text("frustrations").notNull().default(""),
  desiredChange: text("desired_change").notNull().default(""),

  // Blueprint pillar: Identity & Positioning
  positioning: text("positioning").notNull().default(""),
  primaryAudience: text("primary_audience").notNull().default(""),
  secondaryAudience: text("secondary_audience").notNull().default(""),
  geographyCulture: text("geography_culture").notNull().default(""),
  brandValues: text("brand_values").notNull().default(""),
  nonNegotiables: text("non_negotiables").notNull().default(""),
  personalityTone: text("personality_tone").notNull().default(""),
  desiredFeeling: text("desired_feeling").notNull().default(""),

  // Blueprint pillar: Ideas & Worldview
  thesis: text("thesis").notNull().default(""),
  coreBeliefs: text("core_beliefs").notNull().default(""),
  signatureFrameworks: text("signature_frameworks").notNull().default(""),

  // Publicly available info gathered from their links, reviewed/edited by the client
  extractedInfo: text("extracted_info").notNull().default(""),

  website: text("website"),
  newsletter: text("newsletter"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  instagramUrl: text("instagram_url"),
  youtubeUrl: text("youtube_url"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  onboardingStep: integer("onboarding_step").notNull().default(1),

  // Set true once the user dismisses the one-time "foundation consolidated"
  // celebration modal, so it never shows again.
  foundationConsolidatedAck: boolean("foundation_consolidated_ack")
    .notNull()
    .default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientProfileSchema = createInsertSchema(clientProfileTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClientProfile = z.infer<typeof insertClientProfileSchema>;
export type ClientProfile = typeof clientProfileTable.$inferSelect;
