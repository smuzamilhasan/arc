# Ghostwriter v1 — baseline adapter

The eval-harness adapter that lets us score `services/ghostwriter.ts` (the v1 implementation) against the same rubric as Ghostwriter v2. Without this adapter, the "v2 must beat v1 by ≥20% before flag flip" gate has no v1 baseline to compare against.

## Why an adapter, not a copy

v1 lives in `services/ghostwriter.ts` and is the only thing serving production today. We never modify it. This adapter is a thin wrapper that:

1. Accepts the **same input shape** as v2 Ghostwriter (`GhostwriterInput`) so fixtures feed both
2. Projects to v1's flat-string `ClientProfile` + `NarrativeProfile` model
3. Calls `draftContent(client, narrative, input)` — the unchanged v1 service
4. Translates the v1 free-text draft back into the v2 `ContentDraft` shape, with **empty `voice_evidence`** (truthful — v1 can't cite samples it never sees)

The empty voice_evidence is intentional. The rubric's deterministic `story_anchored` check correctly scores it 0. That's the gap we want measured, not hidden.

## How it lands in the eval harness

The eval runner matrix is `(fixture × agent_role × rubric)`. With this adapter:

| Fixture | Agent | Rubric | Outcome |
|---|---|---|---|
| `muzamil-real` | `ghostwriter` (v2) | ghostwriter | v2 numbers |
| `muzamil-real` | `ghostwriter_v1` (baseline) | ghostwriter | v1 numbers |
| ... | ... | ... | ... |

Both run against the same rubric. The delta is the v2 win (or, if anything regresses, the signal to fix prompts before flipping the flag).

## File map

```
ghostwriterV1Adapter/
├── contract.ts    # RoleContract<I, O> for "ghostwriter_v1" — same I/O shape as v2
├── pipeline.ts    # Translates v2 input → v1 ClientProfile/NarrativeProfile,
│                  # calls v1 draftContent, reshapes output to ContentDraft
├── index.ts       # Registers contract on import
└── README.md
```

## What this adapter does NOT do

- **Touch v1 code**. v1 stays in production verbatim.
- **Add a route**. There is no v1 ghostwriter route exposed via v2; the UI continues to call the existing v1 routes for now.
- **Get called by `services/ghostwriterV2Service.ts`**. v2 service ignores this adapter completely.
- **Run automatically**. It only runs when the eval harness invokes it for baseline measurement.

## Expected scoring outcome (a priori)

Even before running, we can predict the rubric outcome qualitatively:

| Dimension | v1 expected | v2 expected | Why |
|---|---|---|---|
| `voice_fidelity` | Low–medium | High | v1 has no structured voice; v2 cites real samples |
| `non_genericness` | Medium | High | v2 has anti-examples + signature_moves as foils |
| `story_anchored` | 0 (deterministic) | ≥0.6 | v1 cannot cite story_bank |
| `honors_negative_space` | Unknown | High | v2 has hard scan; v1 has no enforcement |
| `confidence_calibration` | 0.5 (flat) | Variable | v1 doesn't refuse; v2 does |

If v2 doesn't beat v1 by ≥20% aggregate after this baseline runs, that's the signal to iterate on v2 prompts before any production flag flip — not to ship v2 anyway.

## When the eval runner wires this in

`src/eval/runner/runEval.ts` already accepts agents from the registry. After this PR, calling `runEval()` will produce v1 + v2 results for every Ghostwriter rubric dimension. Per-cell execution is still stubbed (foundation), but the matrix shape is correct.

The first real eval run requires:
- Concrete `StructuredLLMClient` (✅ landed in #13)
- v2 ghostwriter contract (✅ landed in #15)
- v1 baseline adapter (✅ this PR)
- Per-cell `runCell` implementation in `runEval.ts` (next; small follow-up once Apify ingest is done and Muzamil's fixture is populated)
