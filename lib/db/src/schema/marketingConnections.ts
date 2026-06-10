import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A Marketing OS connection to one third-party service. v1 supports Resend
// (transactional email; stores an API key encrypted at rest) and Calendly
// (stores only a booking URL, no key). One connection per (tenant, provider).
// The raw API key never leaves the server.
export const marketingConnectionsTable = pgTable(
  "marketing_connections",
  {
    id: serial("id").primaryKey(),
    tenant: text("tenant").notNull().default("arc"),
    provider: text("provider").notNull(),
    // The service API key, encrypted with the app-level key (AES-256-GCM).
    // Nullable because some providers (Calendly) need only a booking URL.
    apiKeyEncrypted: text("api_key_encrypted"),
    // Optional account / workspace label shown back so the operator can confirm
    // the right account is linked.
    accountRef: text("account_ref"),
    // Calendly booking URL surfaced to high-fit leads.
    bookingUrl: text("booking_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("marketing_connections_tenant_provider_unique").on(
      t.tenant,
      t.provider,
    ),
  ],
);

export const insertMarketingConnectionSchema = createInsertSchema(
  marketingConnectionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingConnection = z.infer<
  typeof insertMarketingConnectionSchema
>;
export type MarketingConnection = typeof marketingConnectionsTable.$inferSelect;
