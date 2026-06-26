// Profile v2 — EXTENDED layers (the comprehensive operating profile).
//
// These complete the personal-brand profile beyond voice/positioning/worldview:
// the INTENT layers (goals, offers, operating prefs) and the STRATEGY/CONTEXT
// layers (content strategy, channels, market context, reputation, identity).
//
// Same pattern as profileLayers.ts: each is a JSONB column on client_profile,
// Zod-validated via accessors. Additive — v1 untouched.
//
// See docs/v2/prds/comprehensive-profile.md.

import { z } from "zod/v4";

// ---------- Goals & objectives (why they're doing this) ----------

export const goalsV2Schema = z.object({
  // What the brand itself should achieve.
  brand_goals: z.array(z.string()).default([]), // e.g. "be the name in AI-narrative strategy"
  // What business outcome the brand serves.
  business_goals: z.array(z.string()).default([]), // e.g. "inbound advisory clients", "hiring"
  // Metrics the user actually cares about (not vanity).
  success_metrics: z.array(z.string()).default([]),
  time_horizon: z.string().nullable().optional(), // e.g. "12 months", "this quarter"
  current_state: z.string().nullable().optional(),
  desired_state: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type GoalsV2 = z.infer<typeof goalsV2Schema>;

// ---------- Offers & monetization (what they sell / drive toward) ----------

export const offeringSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["product", "service", "advisory", "course", "community", "saas", "other"]),
  description: z.string().default(""),
  price_note: z.string().nullable().optional(),
});
export type Offering = z.infer<typeof offeringSchema>;

export const offersV2Schema = z.object({
  offerings: z.array(offeringSchema).default([]),
  lead_magnets: z.array(z.string()).default([]),
  promoting_now: z.string().nullable().optional(), // the current push
  preferred_ctas: z.array(z.string()).default([]), // "book a call", "get the dispatch"
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type OffersV2 = z.infer<typeof offersV2Schema>;

// ---------- Operating preferences (how they want to work) ----------

export const operatingPrefsV2Schema = z.object({
  // Rough hours/week the user can give to content.
  content_time_per_week: z.string().nullable().optional(),
  // Gates the proactive employee: how much it can do without sign-off.
  approval_style: z
    .enum(["review_all", "trust_high_confidence", "autonomous"])
    .nullable()
    .optional(),
  // 0 = play it safe, 1 = happy to be edgy/contrarian.
  risk_tolerance: z.number().min(0).max(1).nullable().optional(),
  // Preferred cadence the user is comfortable sustaining.
  sustainable_cadence: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type OperatingPrefsV2 = z.infer<typeof operatingPrefsV2Schema>;

// ---------- Content strategy (what they publish) ----------

export const contentPillarSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});
export type ContentPillar = z.infer<typeof contentPillarSchema>;

export const contentStrategyV2Schema = z.object({
  pillars: z.array(contentPillarSchema).default([]), // 3-5 themes
  formats: z.array(z.string()).default([]), // "long-form post", "thread", "video", "carousel"
  recurring_series: z.array(z.string()).default([]),
  content_mix: z
    .object({
      educational: z.number().min(0).max(1).default(0),
      personal: z.number().min(0).max(1).default(0),
      promotional: z.number().min(0).max(1).default(0),
    })
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type ContentStrategyV2 = z.infer<typeof contentStrategyV2Schema>;

// ---------- Channels & distribution (where they show up) ----------

export const channelSchema = z.object({
  platform: z.enum([
    "linkedin",
    "x",
    "youtube",
    "newsletter",
    "instagram",
    "tiktok",
    "podcast",
    "blog",
    "other",
  ]),
  handle: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  is_primary: z.boolean().default(false),
  audience_size: z.number().int().nullable().optional(),
  cadence: z.string().nullable().optional(),
  voice_note: z.string().nullable().optional(), // how voice adapts here
});
export type Channel = z.infer<typeof channelSchema>;

export const channelsV2Schema = z.object({
  channels: z.array(channelSchema).default([]),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type ChannelsV2 = z.infer<typeof channelsV2Schema>;

// ---------- Market & competitive context (the landscape) — research-sourced ----------

export const marketCompetitorSchema = z.object({
  name: z.string().min(1),
  note: z.string().default(""), // how the user differs / relates
  url: z.string().nullable().optional(),
});
export type MarketCompetitor = z.infer<typeof marketCompetitorSchema>;

export const marketContextV2Schema = z.object({
  competitors: z.array(marketCompetitorSchema).default([]),
  trends: z.array(z.string()).default([]), // industry trends they ride
  white_space: z.array(z.string()).default([]), // unclaimed angles
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type MarketContextV2 = z.infer<typeof marketContextV2Schema>;

// ---------- Reputation & footprint (current state) — research-sourced ----------

export const reputationV2Schema = z.object({
  followings: z
    .array(z.object({ platform: z.string(), count: z.number().int() }))
    .default([]),
  current_perception: z.string().nullable().optional(), // how they're seen now
  desired_perception: z.string().nullable().optional(), // how they want to be seen
  perception_gap: z.string().nullable().optional(),
  search_presence_note: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type ReputationV2 = z.infer<typeof reputationV2Schema>;

// ---------- Identity (structured) ----------

export const identityV2Schema = z.object({
  geography_base: z.string().nullable().optional(), // where they live
  geography_market: z.array(z.string()).default([]), // where their audience/market is
  languages: z.array(z.string()).default([]), // content languages
  content_script: z.string().nullable().optional(), // "latin", "roman_urdu", "devanagari", ...
  credentials: z.array(z.string()).default([]),
  career_arc: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type IdentityV2 = z.infer<typeof identityV2Schema>;

// ---------- Aggregate ----------

export const profileV2ExtLayersSchema = z.object({
  goals_v2: goalsV2Schema.nullable().optional(),
  offers_v2: offersV2Schema.nullable().optional(),
  operating_prefs_v2: operatingPrefsV2Schema.nullable().optional(),
  content_strategy_v2: contentStrategyV2Schema.nullable().optional(),
  channels_v2: channelsV2Schema.nullable().optional(),
  market_context_v2: marketContextV2Schema.nullable().optional(),
  reputation_v2: reputationV2Schema.nullable().optional(),
  identity_v2: identityV2Schema.nullable().optional(),
});
export type ProfileV2ExtLayers = z.infer<typeof profileV2ExtLayersSchema>;
