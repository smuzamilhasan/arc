# VoiceExtractor agent

First concrete `RoleContract` on the v2 framework. Distills structured voice features, story candidates, reference candidates, and worldview hypotheses from `voice_samples`.

See `docs/v2/prds/voice-extraction.md` for the design rationale.

## Pipeline (5 passes)

| Pass | Method | What it produces |
|---|---|---|
| 0 | Deterministic (no LLM) | Sentence stats, lexicon (top-N IDF-ish), punctuation signature |
| 1 | LLM (structured) | Signature moves, formality (0..1), voice description |
| 2 | LLM (structured) | Story bank candidates (with `source_sample_ids`) |
| 3 | LLM (structured) | Reference library candidates (with `source_sample_ids`) |
| 4 | LLM (structured) | Worldview hypotheses (with `evidence_sample_ids`) |

Pass 0 is the load-bearing one. It's cheap, reproducible, and cannot hallucinate. The LLM passes refine and add what stats can't see.

## Role-lock

| Allowed | Forbidden |
|---|---|
| Emit `voice_patch` with structured features | Decide positioning, ICP, strategic direction |
| Emit `story_append` candidates (cite samples) | Draft user-facing content |
| Emit `reference_append` candidates (cite samples) | Modify the calendar |
| Emit worldview hypotheses (cite samples) | Invent stories/references without evidence |
| Refuse on thin samples | Emit confidence > 0.7 with < 10 samples |

Escalates to: `strategist`.

## Refusal behavior

Refuses cleanly when:

- `samples.length < 10`
- Median sample length < 50 words
- Sample variance suggests ghostwriting from multiple authors
- Negative space conflicts with prevalent lexicon

Refusal is not failure. The contract's `assert_no_violations` also enforces:

- Every `story_append` / `reference_append` cites ≥1 source sample
- Confidence ≤ 0.5 when sample count < 10

## File map

```
voiceExtractor/
├── contract.ts            # RoleContract<Input, Output> + role lock + refusal
├── deterministicPass.ts   # Pass 0: stats over the corpus
├── pipeline.ts            # Orchestrates passes 1-4 and merges into ProfilePatch
├── index.ts               # Registers contract with the role registry
└── README.md
```

## Invocation

```ts
import { runVoiceExtractor } from "./agents-v2/roles/voiceExtractor";

const result = await runVoiceExtractor(
  { client_id, samples, deterministic_features: {} /* recomputed inside */ },
  { llm: yourStructuredLLMClient }
);

if (result.refuses) { /* not enough signal */ }
else { /* apply result.profile_patch via accessors */ }
```

## Calibration

Muzamil is the calibration user. Round-trip metric: feed extracted features back into Ghostwriter, rate output 1-5 on "sounds like me." Target: ≥ 4.0 within 3 iterations on a populated `muzamil-real` fixture.

If round-trip < 4.0 after 3 iterations, the issue is in the PROMPTS or PASS ORDER, not in the model. Substrate is correct.

## Confidence calibration

Each LLM pass returns a per-pass confidence. The aggregate `output.confidence` is the average across the three confidence-producing passes (voice features, stories, references). The worldview pass omits aggregate confidence because beliefs are evaluated individually.

Confidence floor: `min(0.5, voice_features.confidence)` when `sample_count < 10`. This is enforced by `assert_no_violations`.

## Wiring (follow-up PR)

This PR ships the contract + pipeline. Wiring into a real LLM client + subscribing to `ingestNotifier` so extraction runs automatically after each ingest lands in:

- `v2/llm-adapter` — `StructuredLLMClient` implementation against OpenAI / Anthropic
- `v2/voice-extractor-route` — POST `/api/v2/voice-extractor/:clientId` + subscription to `ingestNotifier`
