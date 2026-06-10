import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One provisioning run: a planned (and possibly applied) set of changes pushed
// into an external tool to reconcile it toward a blueprint. Marketing OS NEVER
// writes to an external tool without an explicit human confirm, so a run is
// first persisted as `planned` (the preview), then transitions to `applied` or
// `failed` only when the operator confirms. Tenant-scoped like every Marketing
// OS table. `planned`/`result` hold provider-agnostic JSON describing the diff.
// `applying` is a transient claim state: apply atomically flips planned->applying
// (one row only) before any external write, so two concurrent confirm requests
// can never both write to the external tool. It then settles to applied/failed.
export type ProvisionStatus = "planned" | "applying" | "applied" | "failed";

// A single proposed change, e.g. { op: "create_form", ... }. Provider adapters
// own the exact shape; the engine treats them as an opaque, displayable list.
export interface ProvisionChange {
  op: string;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface ProvisionPlan {
  provider: string;
  // Human-readable one-line summary of what applying this run will do.
  summary: string;
  // Empty when the tool already matches the blueprint (nothing to do).
  changes: ProvisionChange[];
}

export interface ProvisionResult {
  // Provider-specific identifiers/links produced by applying (e.g. formId, url,
  // baseId), surfaced back to the operator.
  applied: ProvisionChange[];
  outputs?: Record<string, unknown>;
}

export const marketingProvisionRunsTable = pgTable("marketing_provision_runs", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull().default("arc"),
  blueprintId: integer("blueprint_id"),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("planned"),
  plan: jsonb("plan").$type<ProvisionPlan>().notNull(),
  result: jsonb("result").$type<ProvisionResult>(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  appliedAt: timestamp("applied_at"),
});

export const insertMarketingProvisionRunSchema = createInsertSchema(
  marketingProvisionRunsTable,
).omit({ id: true, createdAt: true, appliedAt: true });
export type InsertMarketingProvisionRun = z.infer<
  typeof insertMarketingProvisionRunSchema
>;
export type MarketingProvisionRun =
  typeof marketingProvisionRunsTable.$inferSelect;
