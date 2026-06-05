import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export type PortraitSection = {
  title: string;
  body: string;
};

export const profilePortraitsTable = pgTable("profile_portraits", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  headline: text("headline").notNull().default(""),
  summary: text("summary").notNull().default(""),
  sections: jsonb("sections").$type<PortraitSection[]>().notNull().default([]),
  sourceHash: text("source_hash").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProfilePortrait = typeof profilePortraitsTable.$inferSelect;
