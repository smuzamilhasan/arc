# v2 eval harness

The substrate-level fix for "no quality gates" from the v1 diagnosis. See `docs/v2/prds/eval-harness.md`.

## Structure

```
eval/
├── fixtures/
│   ├── types.ts           # Fixture shape
│   ├── muzamil.ts         # Real calibration fixture (gold standard)
│   ├── synthetic.ts       # 3 archetype stress-test fixtures
│   └── index.ts
├── rubrics/
│   └── index.ts           # Per-agent rubric definitions
├── runner/
│   └── runEval.ts         # Matrix runner + baseline diff
└── index.ts
```

## Fixtures

Four fixtures shipped at foundation:

1. **`muzamil-real`** — actual Muzamil. Voice samples populate from Apify ingest. Gold standard for voice fidelity.
2. **`founder-archetype`** — sparse, low-signal. Tests refusal-on-low-signal behavior.
3. **`operator-archetype`** — rich, expert. Tests voice fidelity at scale.
4. **`creator-archetype`** — existing audience. Tests cadence respect + style transfer.

Synthetic fixtures are intentionally stress-tests, not realistic users. They probe specific failure modes.

## Rubrics

Six rubrics at foundation: `ghostwriter`, `strategist`, `narrative`, `planner`, `onboarder`, `voice_extractor`. Each declares 3-5 dimensions with:

- `description` — what we're scoring
- `anchor_0` — what 0.0 looks like
- `anchor_1` — what 1.0 looks like
- `weight` — contribution to overall (sums to ~1.0)
- `deterministic` — optional code-only scorer
- `llm_prompt_fragment` — optional evaluator-agent prompt

Wherever both a deterministic and an LLM scorer exist for a dimension, they cross-check each other.

## Runner

`runEval()` assembles the (fixture × agent) matrix and produces an `EvalReport`. Foundation ships the matrix + report shape + baseline-diff math; per-cell execution wires in as each agent migrates.

CLI surface (added when wired to package.json):

```
pnpm eval                                # full matrix
pnpm eval --agent ghostwriter            # one agent
pnpm eval --fixture muzamil-real         # one fixture
pnpm eval --baseline                     # write run as baseline
```

## CI gate

`compareToBaseline(report, baseline, thresholdPct)` returns per-cell deltas. PR check: fail if any dimension regresses more than `thresholdPct`. Default 5%.

## When fixtures get real samples

`muzamil-real.voice_samples` is empty in the foundation PR. The Apify ingest PR populates it from real LinkedIn / X / podcast pulls. Synthetic fixtures get hand-curated sample sets that exhibit the archetype they're stress-testing.
