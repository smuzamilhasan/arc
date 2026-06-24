// Synthetic fixtures — three personas across ICP archetypes.
//
// Synthetic personas are NOT meant to be realistic users. They are
// stress-test profiles that probe specific failure modes:
//
//   founderArchetype  — sparse profile, low voice signal → tests refusal behavior
//   operatorArchetype — rich profile, strong voice → tests voice fidelity at scale
//   creatorArchetype  — existing creator with measurable voice, tests style transfer
//
// These are seeded enough to be loadable. Real eval-quality samples are added
// when the Apify ingest PRD lands.

import type { Fixture } from "./types";

export const founderArchetypeFixture: Fixture = {
  id: "founder-archetype",
  description:
    "Series A SaaS founder, 18 months in, technical, sparse public footprint. Tests refusal-on-low-signal behavior.",
  identity: {
    full_name: "Test Founder",
    headline: "Building developer tools",
    role: "Founder & CEO",
    geography: "US",
  },
  positioning: {
    claim: "Developer tools that respect taste.",
    defensibility: "10 years shipping infrastructure.",
    adjacent_claims_rejected: ["AI-everything", "no-code-everything"],
    proof_points: [],
    confidence: 0.4,
  },
  icp: {
    archetypes: [
      {
        label: "Staff+ engineers at fast-growing startups",
        jobs_to_be_done: ["ship faster without sacrificing maintainability"],
        watering_holes: ["HN", "X", "developer Discords"],
        what_they_read: ["company engineering blogs", "ACM Queue"],
        where_they_get_stuck: ["tooling sprawl", "build-vs-buy decisions"],
        priority: 1,
      },
    ],
    disqualifications: ["non-technical buyers", "enterprise procurement-led purchases"],
    confidence: 0.5,
  },
  voice: { signature_moves: [], confidence: 0.1, sample_count: 0 }, // Sparse — tests refusal
  worldview: { beliefs: [] },
  negative_space: { refused_topics: [], refused_words: [], refused_takes: [], refused_formats: [] },
  voice_samples: [],
  stories: [],
  references: [],
  anti_examples: [],
};

export const operatorArchetypeFixture: Fixture = {
  id: "operator-archetype",
  description:
    "Senior IC at a public company, 12+ years, expertise-driven. Rich profile + 30 voice samples. Tests fidelity at scale.",
  identity: {
    full_name: "Test Operator",
    headline: "Distributed systems @ FAANG",
    role: "Staff Engineer",
    geography: "US",
  },
  positioning: {
    claim:
      "Production-grade lessons from a decade of distributed systems — without the war-stories grandstanding.",
    defensibility: "12 years of operational war room logs, public design docs.",
    adjacent_claims_rejected: [
      "Generic distributed-systems thought leadership",
      "Vendor-aligned takes",
    ],
    proof_points: [
      { kind: "talk", label: "QCon SF 2024 — distributed systems retrospective" },
      { kind: "artifact", label: "Public design doc archive on personal site" },
    ],
    confidence: 0.85,
  },
  icp: {
    archetypes: [
      {
        label: "Mid-senior engineers in growing infra teams",
        jobs_to_be_done: ["avoid the operational potholes that cost the last team a quarter"],
        watering_holes: ["LinkedIn", "industry SREcons"],
        what_they_read: ["Increment", "engineering Substacks"],
        where_they_get_stuck: ["org-level operational design", "post-incident actionability"],
        priority: 1,
      },
    ],
    disqualifications: ["executive ICs", "non-engineering audiences"],
    confidence: 0.8,
  },
  voice: {
    signature_moves: [],
    confidence: 0.0,
    sample_count: 0,
    description: "Pending sample population.",
  },
  worldview: {
    beliefs: [
      {
        claim: "Most distributed systems failures are organizational, not technical.",
        why_held: "12 years of post-incident reviews across two FAANGs.",
        where_it_shows_up: ["every post-mortem write-up", "every architecture review"],
        confidence: 0.95,
        evidence_sample_ids: [],
      },
    ],
  },
  negative_space: {
    refused_topics: ["employer specifics", "individual blame"],
    refused_words: ["unprecedented", "10x", "rockstar"],
    refused_takes: ["monolith vs micro is settled"],
    refused_formats: ["hot takes", "engagement bait"],
  },
  voice_samples: [],
  stories: [],
  references: [],
  anti_examples: [],
};

export const creatorArchetypeFixture: Fixture = {
  id: "creator-archetype",
  description:
    "Existing creator (YouTube + newsletter, ~20k subs) seeking the strategic layer. Tests style transfer + cadence respect.",
  identity: {
    full_name: "Test Creator",
    headline: "Operating systems for founders",
    role: "Creator & Advisor",
    geography: "EU",
  },
  positioning: {
    claim: "Calm operating systems for founders in chaotic markets.",
    defensibility: "5 years of compounding YouTube + newsletter audience.",
    adjacent_claims_rejected: ["productivity hacks", "founder-life-flexing"],
    proof_points: [
      { kind: "outcome", label: "20k newsletter subs, 50% open rate" },
      { kind: "outcome", label: "YouTube avg watch >9 min" },
    ],
    confidence: 0.75,
  },
  icp: {
    archetypes: [
      {
        label: "Solo & small-team founders",
        jobs_to_be_done: ["run the business calmly while still growing it"],
        watering_holes: ["YouTube", "newsletter inbox", "X"],
        what_they_read: ["IndieHackers", "founder Substacks"],
        where_they_get_stuck: ["systems vs. willpower", "saying no"],
        priority: 1,
      },
    ],
    disqualifications: ["VC-track founders only", "non-English audiences"],
    confidence: 0.8,
  },
  voice: {
    signature_moves: [],
    confidence: 0.0,
    sample_count: 0,
    description: "Pending sample population from creator's RSS / YouTube channel.",
  },
  worldview: {
    beliefs: [
      {
        claim: "Calm is a competitive advantage, not a luxury.",
        why_held: "Burnt out twice; rebuilt around constraints.",
        where_it_shows_up: ["every system framework", "every cadence post"],
        confidence: 0.95,
        evidence_sample_ids: [],
      },
    ],
  },
  negative_space: {
    refused_topics: ["VC bashing as content", "imposter syndrome confessionals"],
    refused_words: ["grind", "hustle", "rise & grind"],
    refused_takes: ["sleep is for losers"],
    refused_formats: ["YouTube clickbait thumbnails", "fake-urgency newsletter subjects"],
  },
  voice_samples: [],
  stories: [],
  references: [],
  anti_examples: [],
};
