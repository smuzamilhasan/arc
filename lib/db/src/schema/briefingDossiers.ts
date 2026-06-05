import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type Competitor = {
  name: string;
  description: string;
  positioning: string;
  differentiation: string;
};

export type DossierSource = {
  title: string;
  url: string;
};

export const briefingDossiersTable = pgTable("briefing_dossiers", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  footprintSummary: text("footprint_summary").notNull().default(""),
  competitors: jsonb("competitors").$type<Competitor[]>().notNull().default([]),
  sources: jsonb("sources").$type<DossierSource[]>().notNull().default([]),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBriefingDossierSchema = createInsertSchema(briefingDossiersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBriefingDossier = z.infer<typeof insertBriefingDossierSchema>;
export type BriefingDossier = typeof briefingDossiersTable.$inferSelect;
