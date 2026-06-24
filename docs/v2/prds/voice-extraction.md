# PRD — Voice extraction agent

## Problem

Even with `voice_samples` ingested, raw text is not directly usable by the Ghostwriter. We need structured voice features extracted from the samples — sentence stats, lexicon, signature moves, recurring references, story candidates, worldview hypotheses.

## Outcome

A v2 agent that ingests N samples for a user and emits a `VoiceFeaturesPatch` covering:
- Quantitative stats (deterministic, not LLM)
- Qualitative patterns (LLM, structured output)
- Story candidates (LLM, structured)
- Reference library candidates
- Worldview hypotheses

Patches are written to `voice_features` (with confidence) and `voice_v2` JSONB layer on profile. Story / reference / worldview candidates land as **proposed** rows that the user confirms during onboarding.

## Inputs

```ts
type VoiceExtractorInput = {
  client_id: number;
  samples: VoiceSample[];           // N most-recent + a stratified pull across time
  existing_voice_features?: VoiceFeatures;  // for incremental updates
  existing_negative_space?: NegativeSpace;  // honored during extraction
};
```

## Outputs

```ts
type VoiceExtractorOutput = {
  features: VoiceFeaturesPatch;     // structured voice features with confidence
  story_candidates: StoryCandidate[];
  reference_candidates: ReferenceCandidate[];
  worldview_hypotheses: WorldviewHypothesis[];
  refuses?: boolean;                // sample count too low
  refusal_reason?: string;
};
```

Every output field carries a `confidence` and `evidence_sample_ids` so downstream agents can trace claims.

## Pipeline

```
samples in
  │
  ├─► deterministic pass (no LLM):
  │     - sentence_stats (lengths, ratios)
  │     - punctuation_signature
  │     - lexicon frequencies
  │     - signature_words = top-N IDF-weighted terms
  │
  ├─► structured LLM pass 1 — voice features (signature moves, formality, voice description)
  │     prompt receives: stats + 20 stratified samples
  │     output: structured features schema
  │
  ├─► structured LLM pass 2 — story bank candidates
  │     prompt receives: samples flagged as story-shaped
  │     output: list of {summary, body_ref, themes, suggested_redeployment}
  │
  ├─► structured LLM pass 3 — reference library
  │     prompt receives: samples with named-entity dense passages
  │     output: list of {kind, label, context, citation_count}
  │
  └─► structured LLM pass 4 — worldview hypotheses
        prompt receives: samples + existing positioning
        output: list of {claim, evidence_sample_ids, confidence}
```

Each LLM pass uses structured output enforcement. No free-text.

## Calibration

Muzamil's profile is the calibration user. Extraction quality is measured by:
- Round-trip test: Ghostwriter using extracted features produces drafts. Muzamil rates "sounds like me" 1-5. Track over time.
- Spot-check the 10 highest-frequency `signature_words` — are they recognizably his?
- Story bank candidates: how many would he actually redeploy?

If round-trip < 4.0 on Muzamil after 3 iterations, the extraction prompt is wrong. Substrate is right.

## Confidence

Per-field confidence is critical. Ghostwriter must refuse to draft when voice confidence is below threshold for the platform / format. Confidence flows from:
- Sample count for the platform
- Variance across samples
- LLM self-reported confidence (with calibration check)

## Acceptance

- Agent runnable via `pnpm run extract -- --client <id>`
- On Muzamil real profile (with ingested samples), populates `voice_v2` + `voice_features` + ≥5 story candidates + ≥5 references
- Confidence values land in `[0, 1]` and are not all 1.0
- Refuses cleanly when given < 10 samples

## Out of scope

- Continuous extraction (re-run on every new sample) — batched cadence is fine for v2
- Multi-language voice — English only for v2
