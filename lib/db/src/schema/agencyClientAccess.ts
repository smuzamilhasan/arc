import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

// Grant linking an agency to a client profile it may manage.
export const agencyClientAccessTable = pgTable(
  "agency_client_access",
  {
    id: serial("id").primaryKey(),
    agencyId: integer("agency_id").notNull(),
    clientId: integer("client_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("agency_client_access_unique").on(t.agencyId, t.clientId)],
);

export type AgencyClientAccess = typeof agencyClientAccessTable.$inferSelect;
