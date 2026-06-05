import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A single client's connection to one third-party scheduling tool (e.g.
// Typefully). The client pastes their OWN API key; arc stores it encrypted at
// rest and uses it to push planned posts into that tool. One connection per
// (client, provider) pair. The raw key never leaves the server.
export const schedulerConnectionsTable = pgTable(
  "scheduler_connections",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    provider: text("provider").notNull(),
    // The client's API key, encrypted with the app-level key (AES-256-GCM).
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    // Optional account / workspace label the provider returned at verify time,
    // shown back to the client so they can confirm the right account is linked.
    accountRef: text("account_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("scheduler_connections_client_provider_unique").on(t.clientId, t.provider)],
);

export const insertSchedulerConnectionSchema = createInsertSchema(schedulerConnectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSchedulerConnection = z.infer<typeof insertSchedulerConnectionSchema>;
export type SchedulerConnection = typeof schedulerConnectionsTable.$inferSelect;
