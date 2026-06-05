import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

// kind: "member" (join the agency as a teammate) | "client" (link/claim a
// client profile the agency prebuilt for them).
// status: "pending" | "accepted" | "revoked"
export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull(),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  // For client invites: the prebuilt (unclaimed) client profile to be claimed.
  clientId: integer("client_id"),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: text("invited_by_user_id").notNull(),
  acceptedByUserId: text("accepted_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export type Invitation = typeof invitationsTable.$inferSelect;
export const invitationKindSchema = z.enum(["member", "client"]);
export type InvitationKind = z.infer<typeof invitationKindSchema>;
