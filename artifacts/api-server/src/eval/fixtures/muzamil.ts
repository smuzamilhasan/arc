// Calibration fixture — Muzamil Hasan (real).
//
// This is the gold-standard fixture. Voice samples land here from real Apify
// ingest runs (LinkedIn / X / podcast transcripts). Voice extraction runs
// against this fixture set the calibration baseline.
//
// As of foundation PR: SKELETON. Samples + stories + references will be
// populated by the first real Apify ingest run. Layers are seeded from the
// vision and landing-page content so the fixture is loadable end-to-end.

import type { Fixture } from "./types";

export const muzamilFixture: Fixture = {
  id: "muzamil-real",
  description:
    "Real founder calibration fixture. Voice samples populated from Apify ingest. Gold standard for voice fidelity scoring.",
  identity: {
    full_name: "Muzamil Hasan",
    headline: "Building arc. — the calm OS for the AI shift",
    role: "Founder",
    geography: "US · Gulf · Pakistan",
  },
  positioning: {
    claim:
      "As AI commoditizes software, narrative becomes the moat — and arc. is the system for building yours.",
    defensibility:
      "15 years and 500+ Thought Behind Things interviews on how people become known for what they know.",
    adjacent_claims_rejected: [
      "Generic 'personal brand coaching'",
      "AI ghostwriting tools without taste",
      "Growth-hacking / engagement-bait systems",
    ],
    proof_points: [
      { kind: "talk", label: "Thought Behind Things — flagship podcast" },
      { kind: "outcome", label: "arc. — productizing the method" },
    ],
    confidence: 0.7,
  },
  icp: {
    archetypes: [
      {
        label: "Founders building through the AI shift",
        jobs_to_be_done: ["turn conviction into pull for talent/capital/customers"],
        watering_holes: ["LinkedIn", "X", "founder Slacks", "select podcasts"],
        what_they_read: ["First Round Review", "Stratechery", "Ben Thompson", "Pieter Levels"],
        where_they_get_stuck: ["being known", "narrative discipline", "consistency"],
        priority: 1,
      },
      {
        label: "Operators with earned expertise",
        jobs_to_be_done: ["make the work they've done visible without it eating the week"],
        watering_holes: ["LinkedIn", "industry Slacks"],
        what_they_read: ["industry newsletters", "Lenny's"],
        where_they_get_stuck: ["staying consistent", "voice on platform"],
        priority: 2,
      },
    ],
    disqualifications: ["anonymous brand-builders", "engagement-bait creators", "outbound DM operators"],
    confidence: 0.7,
  },
  voice: {
    signature_moves: [],
    confidence: 0.0,
    sample_count: 0,
    description:
      "Pending Apify ingest. Initial impression: short declarative sentences, contrarian framings, em-dashes, sentence-case eyebrows, no hype words.",
  },
  worldview: {
    beliefs: [
      {
        claim: "Narrative is the moat as software commoditizes.",
        why_held: "Watched the dot-com curve play out; AI follows the same shape.",
        where_it_shows_up: ["every essay", "every talk", "every product decision"],
        confidence: 0.9,
        evidence_sample_ids: [],
      },
      {
        claim: "Build in silence; arrive loud.",
        why_held: "Public iteration without substance produces brand drag, not lift.",
        where_it_shows_up: ["product cadence", "the launch posture for v2"],
        confidence: 0.9,
        evidence_sample_ids: [],
      },
    ],
  },
  negative_space: {
    refused_topics: ["personal political takes", "competitor trashing"],
    refused_words: ["leverage (verb)", "10x", "crush", "guru", "hack", "explode"],
    refused_takes: ["AI will replace creators wholesale", "humans are obsolete"],
    refused_formats: ["engagement-bait hooks", "countdown urgency", "fake-vulnerability openers"],
  },
  voice_samples: [],
  stories: [],
  references: [
    { id: 1, kind: "person", label: "Ben Thompson", context: "Stratechery — narrative-as-moat thesis foundation", citation_count: 0 },
    { id: 2, kind: "concept", label: "YouTubeification of software", context: "Muzamil's own framing", citation_count: 0 },
  ],
  anti_examples: [
    {
      sample_text:
        "🚀 Just shipped! Massive thanks to the incredible team. We're not just building a product — we're building a movement. LFG! 🔥",
      why_not_this_voice: "Hype words, emoji-spam, fake urgency — direct opposites of the brand.",
    },
  ],
};
