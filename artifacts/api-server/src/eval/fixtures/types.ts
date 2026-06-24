// Fixture types — a fixture is a fully-populated v2 profile + voice samples +
// stories + references + anti-examples + supporting context. The eval harness
// runs each agent against each fixture and scores outputs.
//
// Fixtures live in code so they're version-controlled and diffable. See
// docs/v2/prds/eval-harness.md.

import type {
  PositioningV2,
  IcpV2,
  VoiceV2,
  WorldviewV2,
  NegativeSpaceV2,
} from "@workspace/db";

export type FixtureVoiceSample = {
  id: number;
  source: string;
  platform: string | null;
  content: string;
  metadata?: { published_at?: string; url?: string; engagement?: { likes?: number } };
};

export type FixtureStoryEntry = {
  id: number;
  summary: string;
  body: string;
  themes: string[];
};

export type FixtureReferenceEntry = {
  id: number;
  kind: "person" | "book" | "framework" | "event" | "company" | "concept";
  label: string;
  context: string;
  citation_count: number;
};

export type FixtureAntiExample = {
  sample_text: string;
  why_not_this_voice: string;
};

export type Fixture = {
  id: string;
  description: string;
  // Identity
  identity: {
    full_name: string;
    headline: string;
    role: string;
    geography: string;
  };
  // Profile v2 layers
  positioning: PositioningV2;
  icp: IcpV2;
  voice: VoiceV2;
  worldview: WorldviewV2;
  negative_space: NegativeSpaceV2;
  // Substrate
  voice_samples: FixtureVoiceSample[];
  stories: FixtureStoryEntry[];
  references: FixtureReferenceEntry[];
  anti_examples: FixtureAntiExample[];
};
