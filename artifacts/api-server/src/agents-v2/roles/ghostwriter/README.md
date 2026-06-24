# Ghostwriter v2

The agent that directly fixes the v1 "generic output" diagnosis. v1 ghostwriter (`src/services/ghostwriter.ts`) is untouched and remains in production until v2 beats it on the eval harness.

## The fix, in one sentence

v1 builds drafts from self-reported adjectives (`personalityTone`) and **never sees the user's actual writing**. v2 builds drafts from real voice samples and **must cite them as evidence**.

## What changed (vs v1)

| v1 ghostwriter | v2 ghostwriter |
|---|---|
| Voice = `personalityTone` (one string) | Voice = `voice_v2` (structured features) + real samples |
| No sample access | Min 1 sample required as input; cite ≥1 as evidence |
| Free-text output | Typed `ContentDraft` with `voice_evidence` |
| Honors negative space "if it remembers" | `assert_no_violations` scans body for `refused_words` + `banned_phrases` |
| Drafts at any voice confidence | Refuses below platform-specific floor |
| Same context blob as Strategist/Planner | Curated slice: identity, voice, samples, stories, references, negative_space, anti_examples |

## Role lock

| Allowed | Forbidden |
|---|---|
| Emit `ContentDraft` with body cited to ≥1 `voice_sample` | Use any `banned_phrases` or `refused_words` |
| Cite `story_anchor` when grounding in a confirmed story | Address a `refused_topic` |
| Cite `reference_anchors` when weaving in a name | Take a `refused_take` |
| Refuse with `refusal_reason` when signal is thin | Use a `refused_format` (e.g. engagement-bait hook) |
| | Invent achievements, dates, quotes, names |
| | Update profile / calendar / strategy |
| | Output anything other than `ContentDraft` |

## Hard enforcement (`assert_no_violations`)

The contract verifies **after** the model emits:

1. `style_anchors` contains ≥1 `voice_sample` reference, and every cited `sample_id` exists in `input.voice_samples`
2. `story_anchor` (if present) references a real `story_id` in `input.stories`
3. `reference_anchors` reference real `reference_id`s in `input.references`
4. Body length ≤ platform cap (LinkedIn 3000, X 280, Newsletter 8000, …)
5. Body contains no `negative_space.refused_words`
6. Body contains no `voice.lexicon.banned_phrases`
7. If `voice.confidence < platform_floor` but `output.confidence > 0.5` → violation (the model claimed high confidence when it shouldn't)

Violations route to `AgentResult { kind: "contract_violation" }`. The caller decides whether to retry, surface, or fall back to v1.

## Refusal behavior

The agent is encouraged to refuse with `refusal_reason` when:

- `voice.confidence` below platform floor
- < 3 voice samples for the requested platform
- Brief conflicts with `negative_space.refused_topics`
- Cannot honor negative space while addressing the brief

Refusal is a first-class outcome. Better a clean "I don't have enough signal" than a confident-sounding generic draft.

## File map

```
ghostwriter/
├── contract.ts    # RoleContract<I, O> + input schema + system_prompt + assert_no_violations
├── index.ts       # Registers with role registry on import
└── README.md
```

Pipeline (`services/ghostwriterV2Service.ts`):

```
draftWithGhostwriterV2(req)
   │
   ▼
ContextCurator.curate(clientId, ghostwriterContract.context_requirements)
   │
   ▼
build GhostwriterInput (typed slice — no monolithic blob)
   │
   ▼
AgentRunner.run(ghostwriterContract, input)  ──► validates I/O, calls LLM,
   │                                              runs assert_no_violations,
   ▼                                              handles refusals
DraftResult: { ok | refused | violation }
```

Route: `POST /api/v2/ghostwriter/draft` (mounted behind requireAuth + activeClient).

## Smoke tests

`artifacts/api-server/test/agents-v2/contractEnforcement.test.ts` covers:

1. Well-formed draft → `ok`
2. Refusal → `refused`
3. Style anchor cites non-existent sample_id → `contract_violation`
4. Body contains refused word → `contract_violation`
5. Body contains banned phrase → `contract_violation`
6. Body exceeds platform char cap → `contract_violation`
7. High confidence under voice floor → `contract_violation`
8. Malformed input → `contract_violation`
9. Malformed LLM output → `contract_violation`

These tests use a scripted `StructuredLLMClient` so they verify the FRAMEWORK, not the model. Run with `pnpm test` — they pass without any external API calls.

## Migration plan (vs v1)

Per the architecture doc, the migration sequence is:

1. v2 ghostwriter lands behind a feature flag (this PR — flag wiring deferred to route handler)
2. Eval harness scores v1 + v2 across Muzamil + 3 synthetic fixtures
3. v2 must beat v1 on the Ghostwriter rubric (voice fidelity + non-genericness + story-anchored + honors-negative-space + confidence calibration) by ≥ 20%
4. Flip flag for Muzamil only → verify quality
5. Flip flag for the 13 paused users when they come back online
6. Delete v1 ghostwriter after 30 days of v2 stability

The eval beat-by-20% gate is the single safeguard preventing a regression from shipping. It's wired in the eval harness from the foundation PR; the v1 baseline runs as soon as v1 ghostwriter is registered with the v2 framework (a tiny adapter — not part of this PR).
