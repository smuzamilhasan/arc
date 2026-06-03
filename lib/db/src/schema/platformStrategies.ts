import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type PlatformPick = {
  platform: string;
  reason: string;
};

export type OnlineChannel = {
  recommendation: string;
  platforms: string[];
};

export type WebsitePlan = {
  recommendation: string;
  elements: string[];
};

export type OnlinePresence = {
  primary: PlatformPick[];
  mirror: string[];
  longForm: OnlineChannel;
  shortForm: OnlineChannel;
  website: WebsitePlan;
  newsletter: string;
};

export type OfflinePresence = {
  intro: string;
  speaking: string;
  workshops: string;
  associations: string;
  teaching: string;
};

const emptyOnline: OnlinePresence = {
  primary: [],
  mirror: [],
  longForm: { recommendation: "", platforms: [] },
  shortForm: { recommendation: "", platforms: [] },
  website: { recommendation: "", elements: [] },
  newsletter: "",
};

const emptyOffline: OfflinePresence = {
  intro: "",
  speaking: "",
  workshops: "",
  associations: "",
  teaching: "",
};

export const platformStrategiesTable = pgTable("platform_strategies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  summary: text("summary").notNull().default(""),
  online: jsonb("online").$type<OnlinePresence>().notNull().default(emptyOnline),
  offline: jsonb("offline").$type<OfflinePresence>().notNull().default(emptyOffline),
  closing: text("closing").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformStrategySchema = createInsertSchema(platformStrategiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlatformStrategy = z.infer<typeof insertPlatformStrategySchema>;
export type PlatformStrategy = typeof platformStrategiesTable.$inferSelect;
