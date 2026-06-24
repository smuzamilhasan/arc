// ContextCurator — deterministic per-agent context shaping.
//
// One of the substrate-level fixes diagnosed in docs/v2/diagnosis.md was that
// every v1 agent received the same ~8KB profile blob. v2 reverses this:
// every agent declares what it needs via `context_requirements`, and this
// curator produces only that slice.
//
// Why deterministic (no LLM): when output is generic, you can debug by
// inspecting the exact context blob. LLM-built context is a debugging black
// hole.

import type { ContextKey, ContextRequirement } from "../contracts/types";
import type {
  PositioningV2,
  IcpV2,
  VoiceV2,
  WorldviewV2,
  NegativeSpaceV2,
} from "../../../../../lib/db/src/schema/v2/profileLayers";

// Curated context — sparse shape. Only requested keys are present.
export type CuratedContext = Partial<{
  identity: { full_name: string; headline: string; role: string; geography: string };
  positioning: PositioningV2;
  icp: IcpV2;
  voice: Omit<VoiceV2, "description"> & { description?: string };
  voice_samples: Array<{ sample_id: number; platform: string | null; excerpt: string }>;
  narrative: { core_narrative: string; point_of_view: string; themes: string[] } | null;
  worldview: WorldviewV2;
  stories: Array<{ story_id: number; summary: string; themes: string[]; last_used_at: string | null }>;
  references: Array<{ reference_id: number; kind: string; label: string; citation_count: number }>;
  negative_space: NegativeSpaceV2;
  anti_examples: Array<{ sample_text: string; why_not_this_voice: string }>;
  audit: unknown;
  industry_overview: unknown;
  platforms: unknown;
  content_strategy: unknown;
  recent_drafts: Array<{ id: number; platform: string; status: string; title: string }>;
  calendar_window: Array<{ id: number; platform: string; scheduledAt: string; title: string }>;
}>;

// Fetcher interface. Implemented in services that wrap the DB. The curator
// itself is data-agnostic — pass it a `Loader` and it composes the shape.
export interface CuratorLoader {
  identity(clientId: number): Promise<CuratedContext["identity"]>;
  positioning(clientId: number): Promise<CuratedContext["positioning"]>;
  icp(clientId: number): Promise<CuratedContext["icp"]>;
  voice(clientId: number): Promise<CuratedContext["voice"]>;
  voice_samples(clientId: number, limit: number): Promise<CuratedContext["voice_samples"]>;
  narrative(clientId: number): Promise<CuratedContext["narrative"]>;
  worldview(clientId: number): Promise<CuratedContext["worldview"]>;
  stories(clientId: number, limit: number): Promise<CuratedContext["stories"]>;
  references(clientId: number, limit: number): Promise<CuratedContext["references"]>;
  negative_space(clientId: number): Promise<CuratedContext["negative_space"]>;
  anti_examples(clientId: number, limit: number): Promise<CuratedContext["anti_examples"]>;
  audit(clientId: number): Promise<CuratedContext["audit"]>;
  industry_overview(clientId: number): Promise<CuratedContext["industry_overview"]>;
  platforms(clientId: number): Promise<CuratedContext["platforms"]>;
  content_strategy(clientId: number): Promise<CuratedContext["content_strategy"]>;
  recent_drafts(clientId: number, limit: number): Promise<CuratedContext["recent_drafts"]>;
  calendar_window(clientId: number, days: number): Promise<CuratedContext["calendar_window"]>;
}

export type CurateOptions = {
  voice_samples_limit?: number;
  stories_limit?: number;
  references_limit?: number;
  anti_examples_limit?: number;
  recent_drafts_limit?: number;
  calendar_window_days?: number;
};

const DEFAULT_LIMITS: Required<CurateOptions> = {
  voice_samples_limit: 20,
  stories_limit: 10,
  references_limit: 15,
  anti_examples_limit: 3,
  recent_drafts_limit: 10,
  calendar_window_days: 14,
};

export async function curate(
  clientId: number,
  requirements: ContextRequirement[],
  loader: CuratorLoader,
  options: CurateOptions = {}
): Promise<CuratedContext> {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const out: CuratedContext = {};

  const tasks: Array<[ContextKey, Promise<unknown>]> = [];

  for (const req of requirements) {
    const key = req.key;
    switch (key) {
      case "identity":
        tasks.push([key, loader.identity(clientId)]);
        break;
      case "positioning":
        tasks.push([key, loader.positioning(clientId)]);
        break;
      case "icp":
        tasks.push([key, loader.icp(clientId)]);
        break;
      case "voice":
        tasks.push([key, loader.voice(clientId)]);
        break;
      case "voice_samples":
        tasks.push([key, loader.voice_samples(clientId, limits.voice_samples_limit)]);
        break;
      case "narrative":
        tasks.push([key, loader.narrative(clientId)]);
        break;
      case "worldview":
        tasks.push([key, loader.worldview(clientId)]);
        break;
      case "stories":
        tasks.push([key, loader.stories(clientId, limits.stories_limit)]);
        break;
      case "references":
        tasks.push([key, loader.references(clientId, limits.references_limit)]);
        break;
      case "negative_space":
        tasks.push([key, loader.negative_space(clientId)]);
        break;
      case "anti_examples":
        tasks.push([key, loader.anti_examples(clientId, limits.anti_examples_limit)]);
        break;
      case "audit":
        tasks.push([key, loader.audit(clientId)]);
        break;
      case "industry_overview":
        tasks.push([key, loader.industry_overview(clientId)]);
        break;
      case "platforms":
        tasks.push([key, loader.platforms(clientId)]);
        break;
      case "content_strategy":
        tasks.push([key, loader.content_strategy(clientId)]);
        break;
      case "recent_drafts":
        tasks.push([key, loader.recent_drafts(clientId, limits.recent_drafts_limit)]);
        break;
      case "calendar_window":
        tasks.push([key, loader.calendar_window(clientId, limits.calendar_window_days)]);
        break;
    }
  }

  const results = await Promise.all(tasks.map(([, p]) => p));
  for (let i = 0; i < tasks.length; i++) {
    const [key] = tasks[i];
    const value = results[i];
    if (value !== null && value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    } else {
      const req = requirements.find((r) => r.key === key);
      if (req?.required) {
        throw new ContextRequirementUnmetError(key);
      }
    }
  }

  return out;
}

export class ContextRequirementUnmetError extends Error {
  constructor(public key: ContextKey) {
    super(`Required context key not present in profile: ${key}`);
    this.name = "ContextRequirementUnmetError";
  }
}
