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

export type ProfileV2LayerKey =
  | "positioning_v2"
  | "icp_v2"
  | "voice_v2"
  | "worldview_v2"
  | "negative_space_v2";

const SCHEMA_BY_KEY = {
  positioning_v2: positioningV2Schema,
  icp_v2: icpV2Schema,
  voice_v2: voiceV2Schema,
  worldview_v2: worldviewV2Schema,
  negative_space_v2: negativeSpaceV2Schema,
} as const;

export type LayerValueByKey = {
  positioning_v2: PositioningV2;
  icp_v2: IcpV2;
  voice_v2: VoiceV2;
  worldview_v2: WorldviewV2;
  negative_space_v2: NegativeSpaceV2;
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
  }
}
