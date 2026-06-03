import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One platform's posting cadence and emphasis, derived by correlating the
// client's blueprint with their chosen Platforms strategy.
export type PlatformCadence = {
  platform: string;
  frequency: string;
  formats: string[];
  focus: string;
};

// A slice of the thought-leadership content mix. `type` is one of the five
// guideline buckets: Educational, Analytical, Opinionated, Story, Community.
export type ContentMixItem = {
  type: string;
  description: string;
  whyForClient: string;
  exampleTopics: string[];
  weight: string;
};

// A repeatable, ownable franchise the client runs on a fixed cadence.
export type SignatureSeries = {
  name: string;
  cadence: string;
  description: string;
};

// A reusable post template/shape the client can fill repeatedly.
export type PostFormat = {
  name: string;
  description: string;
};

const emptyPlatformPlan: PlatformCadence[] = [];
const emptyContentMix: ContentMixItem[] = [];
const emptySignatureSeries: SignatureSeries[] = [];
const emptyPostFormats: PostFormat[] = [];

export const contentStrategiesTable = pgTable("content_strategies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  summary: text("summary").notNull().default(""),
  platformPlan: jsonb("platform_plan")
    .$type<PlatformCadence[]>()
    .notNull()
    .default(emptyPlatformPlan),
  contentMix: jsonb("content_mix")
    .$type<ContentMixItem[]>()
    .notNull()
    .default(emptyContentMix),
  signatureSeries: jsonb("signature_series")
    .$type<SignatureSeries[]>()
    .notNull()
    .default(emptySignatureSeries),
  postFormats: jsonb("post_formats")
    .$type<PostFormat[]>()
    .notNull()
    .default(emptyPostFormats),
  repurposing: text("repurposing").notNull().default(""),
  closing: text("closing").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContentStrategySchema = createInsertSchema(contentStrategiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContentStrategy = z.infer<typeof insertContentStrategySchema>;
export type ContentStrategy = typeof contentStrategiesTable.$inferSelect;
