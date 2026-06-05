import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  tags: text("tags").array().notNull().default([]),
  // Hand-off state: set once the post is pushed into the client's own
  // third-party scheduler. Independent of `status` (arc's internal lifecycle) —
  // the scheduler owns publishing from here. `handoffRef` holds the provider's
  // draft id/url for reference.
  handoffProvider: text("handoff_provider"),
  handoffAt: timestamp("handoff_at"),
  handoffRef: text("handoff_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, clientId: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
