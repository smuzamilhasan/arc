// Type-safe accessors for v2 JSONB layers on client_profile.
//
// v2 agents NEVER touch raw JSONB. They go through these helpers, which:
//   - validate against Zod schemas on read AND write
//   - default to a structured empty layer when null
//   - timestamp updates
//
// This is the "substrate over prompts" principle in code: the layer below the
// agents is typed and validated, so agent errors can't corrupt the substrate.

import { z } from "zod/v4";
import {
  positioningV2Schema,
  icpV2Schema,
  voiceV2Schema,
  worldviewV2Schema,
  negativeSpaceV2Schema,
  type PositioningV2,
  type IcpV2,
  type VoiceV2,
  type WorldviewV2,
  type NegativeSpaceV2,
} from "./profileLayers";
import {
  goalsV2Schema,
  offersV2Schema,
  operatingPrefsV2Schema,
  contentStrategyV2Schema,
  channelsV2Schema,
  marketContextV2Schema,
  reputationV2Schema,
  identityV2Schema,
  type GoalsV2,
  type OffersV2,
  type OperatingPrefsV2,
  type ContentStrategyV2,
  type ChannelsV2,
  type MarketContextV2,
  type ReputationV2,
  type IdentityV2,
} from "./profileLayersExt";

export type ProfileV2LayerKey =
  | "positioning_v2"
  | "icp_v2"
  | "voice_v2"
  | "worldview_v2"
  | "negative_space_v2"
  | "goals_v2"
  | "offers_v2"
  | "operating_prefs_v2"
  | "content_strategy_v2"
  | "channels_v2"
  | "market_context_v2"
  | "reputation_v2"
  | "identity_v2";

const SCHEMA_BY_KEY = {
  positioning_v2: positioningV2Schema,
  icp_v2: icpV2Schema,
  voice_v2: voiceV2Schema,
  worldview_v2: worldviewV2Schema,
  negative_space_v2: negativeSpaceV2Schema,
  goals_v2: goalsV2Schema,
  offers_v2: offersV2Schema,
  operating_prefs_v2: operatingPrefsV2Schema,
  content_strategy_v2: contentStrategyV2Schema,
  channels_v2: channelsV2Schema,
  market_context_v2: marketContextV2Schema,
  reputation_v2: reputationV2Schema,
  identity_v2: identityV2Schema,
} as const;

export type LayerValueByKey = {
  positioning_v2: PositioningV2;
  icp_v2: IcpV2;
  voice_v2: VoiceV2;
  worldview_v2: WorldviewV2;
  negative_space_v2: NegativeSpaceV2;
  goals_v2: GoalsV2;
  offers_v2: OffersV2;
  operating_prefs_v2: OperatingPrefsV2;
  content_strategy_v2: ContentStrategyV2;
  channels_v2: ChannelsV2;
  market_context_v2: MarketContextV2;
  reputation_v2: ReputationV2;
  identity_v2: IdentityV2;
};

/**
 * Read a v2 layer from a raw JSONB blob (Drizzle-returned `unknown` value).
 * Returns null if the layer was never written; throws on schema mismatch so
 * corruption is loud.
 */
export function readLayer<K extends ProfileV2LayerKey>(
  key: K,
  raw: unknown
): LayerValueByKey[K] | null {
  if (raw === null || raw === undefined) return null;
  const schema = SCHEMA_BY_KEY[key] as unknown as z.ZodSchema<LayerValueByKey[K]>;
  return schema.parse(raw);
}

/**
 * Validate a layer value before write. Stamps `last_updated` if the schema
 * supports it. Throws on validation failure.
 */
export function prepareLayerWrite<K extends ProfileV2LayerKey>(
  key: K,
  value: LayerValueByKey[K]
): LayerValueByKey[K] {
  const schema = SCHEMA_BY_KEY[key] as unknown as z.ZodSchema<LayerValueByKey[K]>;
  const stamped = {
    ...value,
    last_updated: new Date().toISOString(),
  } as LayerValueByKey[K];
  return schema.parse(stamped);
}

/**
 * Patch a layer: shallow-merge `patch` into the existing layer (or an empty
 * default) and validate. Use this from agents producing `ProfilePatch`es.
 */
export function patchLayer<K extends ProfileV2LayerKey>(
  key: K,
  existing: LayerValueByKey[K] | null,
  patch: Partial<LayerValueByKey[K]>
): LayerValueByKey[K] {
  const base = existing ?? (defaultLayer(key) as LayerValueByKey[K]);
  return prepareLayerWrite(key, { ...base, ...patch });
}

function defaultLayer(key: ProfileV2LayerKey): unknown {
  switch (key) {
    case "positioning_v2":
      return { claim: "", defensibility: "", adjacent_claims_rejected: [], proof_points: [], confidence: 0 };
    case "icp_v2":
      return { archetypes: [], disqualifications: [], confidence: 0 };
    case "voice_v2":
      return { signature_moves: [], confidence: 0, sample_count: 0 };
    case "worldview_v2":
      return { beliefs: [] };
    case "negative_space_v2":
      return { refused_topics: [], refused_words: [], refused_takes: [], refused_formats: [] };
    case "goals_v2":
      return { brand_goals: [], business_goals: [], success_metrics: [], confidence: 0 };
    case "offers_v2":
      return { offerings: [], lead_magnets: [], preferred_ctas: [], confidence: 0 };
    case "operating_prefs_v2":
      return { confidence: 0 };
    case "content_strategy_v2":
      return { pillars: [], formats: [], recurring_series: [], confidence: 0 };
    case "channels_v2":
      return { channels: [], confidence: 0 };
    case "market_context_v2":
      return { competitors: [], trends: [], white_space: [], confidence: 0 };
    case "reputation_v2":
      return { followings: [], confidence: 0 };
    case "identity_v2":
      return { geography_market: [], languages: [], credentials: [], confidence: 0 };
  }
}
