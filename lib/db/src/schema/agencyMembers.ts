import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

// role: "owner" | "member"
export const agencyMembersTable = pgTable(
  "agency_members",
  {
    id: serial("id").primaryKey(),
    agencyId: integer("agency_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("agency_members_agency_user_unique").on(t.agencyId, t.userId)],
);

export type AgencyMember = typeof agencyMembersTable.$inferSelect;
export const agencyRoleSchema = z.enum(["owner", "member"]);
export type AgencyRole = z.infer<typeof agencyRoleSchema>;
