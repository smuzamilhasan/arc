// reference_library — people, books, frameworks, events the user cites.
//
// Recurring references are a strong non-genericness signal. The Ghostwriter is
// encouraged to weave them in (sparingly) when contextually appropriate.

import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const REFERENCE_KINDS = ["person", "book", "framework", "event", "company", "concept"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const referenceLibraryTable = pgTable(
  "reference_library",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    kind: text("kind").notNull(), // ReferenceKind
    label: text("label").notNull(),
    context: text("context").notNull().default(""), // how the user typically uses this reference
    citationCount: integer("citation_count").notNull().default(0),
    lastCitedAt: timestamp("last_cited_at"),
    sourceSampleIds: integer("source_sample_ids").array().notNull().default([]),
    status: text("status").notNull().default("candidate"), // 'candidate' | 'confirmed' | 'archived'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    clientIdx: index("reference_library_client_idx").on(t.clientId, t.status),
    kindIdx: index("reference_library_kind_idx").on(t.clientId, t.kind),
  })
);

export type ReferenceLibraryEntry = typeof referenceLibraryTable.$inferSelect;
export type InsertReferenceLibraryEntry = typeof referenceLibraryTable.$inferInsert;
