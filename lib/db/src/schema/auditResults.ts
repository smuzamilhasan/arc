import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type SeoFinding = {
  title: string;
  url: string;
  type: "owned" | "social" | "press" | "directory" | "other";
  snippet: string;
};

export type SeoFindings = {
  resultCount: number;
  results: SeoFinding[];
  ownedPresence: boolean;
  summary: string;
};

export type GeoModelResult = {
  model: string;
  label: string;
  mentioned: boolean;
  accuracy: "accurate" | "partial" | "none" | "incorrect";
  response: string;
  notes: string;
};

export type GeoSource = {
  title: string;
  url: string;
};

export type GeoFindings = {
  models: GeoModelResult[];
  summary: string;
  sources?: GeoSource[];
};

export const auditResultsTable = pgTable("audit_results", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  seoScore: integer("seo_score").notNull().default(0),
  geoScore: integer("geo_score").notNull().default(0),
  seoFindings: jsonb("seo_findings").$type<SeoFindings>(),
  geoFindings: jsonb("geo_findings").$type<GeoFindings>(),
  recommendations: text("recommendations").array().notNull().default([]),
  status: text("status").notNull().default("complete"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditResultSchema = createInsertSchema(auditResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditResult = z.infer<typeof insertAuditResultSchema>;
export type AuditResult = typeof auditResultsTable.$inferSelect;
