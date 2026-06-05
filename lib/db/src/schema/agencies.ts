import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agenciesTable = pgTable("agencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgencySchema = createInsertSchema(agenciesTable).omit({
  id: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agenciesTable.$inferSelect;
