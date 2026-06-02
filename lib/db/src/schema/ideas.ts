import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ideasTable = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  platform: text("platform"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIdeaSchema = createInsertSchema(ideasTable).omit({ id: true, createdAt: true });
export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type Idea = typeof ideasTable.$inferSelect;
