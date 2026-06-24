# PRD — Eval harness

## Problem

Zero output quality tests. Prompt changes ship blind. No way to know if v2 actually beats v1 except vibes.

## Outcome

A reproducible harness that runs fixture personas through every agent, scores outputs against a per-agent rubric, and produces a JSON report. Baseline captured on v1. CI gate blocks regressions in v2.

## Fixtures

Four personas:

1. **`muzamil-real`** — actual Muzamil profile, ingested LinkedIn / X / podcasts. Gold standard for voice fidelity.
2. **`founder-archetype`** — synthetic: Series A SaaS founder, technical, 18 months in
3. **`operator-archetype`** — synthetic: senior IC at a public company, 10+ yrs, expertise-driven
4. **`creator-archetype`** — synthetic: existing YouTube + newsletter, looking for the strategic layer

Each fixture is a fully-populated v2 profile (all layers) + 10-20 voice samples + 5 anti-examples + 5 story bank entries + reference library.

Fixtures live in code (`eval/fixtures/`) so they're version-controlled and diffable.

## Rubrics (per agent)

Each rubric has 3-5 dimensions, each scored 0..1, with explicit "what counts as 1.0" / "what counts as 0.0" anchors.

### Ghostwriter

- **Voice fidelity** — sentence stats within tolerance of voice features? lexicon matches? signature moves present?
- **Non-genericness** — would this read as "any AI" or as "this specific person"?
- **Story-anchored** — is there a story_bank reference or proof point cited?
- **Honors negative space** — no refused words / topics / takes?
- **Confidence calibration** — refuses when context is thin?

### Strategist

- **Alignment to profile** — proposal flows from positioning / ICP / worldview?
- **Evidence cited** — every claim grounded in a profile slot or artifact?
- **Non-genericness** — specific to this user, not a template?
- **Refuses on low signal** — emits `refuses: true` when profile is sparse?

### Narrative

- **Specificity** — concrete, not aspirational
- **Differentiation** — visible foil to a generic narrative
- **Voice coherence** — written *as* the user

### Planner

- **Respects cadence** — within voice cadence preferences
- **No double-booking** — no calendar conflicts
- **Platform fit** — content type matches platform

### Onboarder

- **Coverage** — fills required profile slots
- **Adaptivity** — drills into vague answers
- **Honors stop condition** — knows when enough is enough

## Scoring

Two scorers per dimension:

1. **Deterministic checks** (where possible) — regex / stats / DB lookups
2. **Evaluator agent** — a separate agent with its own contract, given fixture + output + rubric anchors, emits `RubricScore`

Two-source scoring catches blind spots in either path.

## Runner

```
pnpm eval                  # all fixtures × all agents
pnpm eval --agent ghostwriter
pnpm eval --fixture muzamil-real --agent ghostwriter
pnpm eval --baseline       # writes current scores as new baseline
```

Output: `eval-report-<timestamp>.json` + a markdown summary.

## CI gate

PR check:
- Run eval on changed agents
- Compare to baseline
- Fail if any rubric dimension drops > 5%
- Pass with caveat if drop 2-5% (review required)
- Always pass if improvement

## Acceptance

- 4 fixture personas defined and loadable
- Per-agent rubric definitions in code
- `pnpm eval` works end-to-end on one agent (Ghostwriter)
- Baseline captured for v1 Ghostwriter
- One PR demonstrates the gate (intentional regression caught)

## Out of scope

- Eval for v2 agents that don't exist yet (those get rubrics when they land)
- Human eval UI (terminal report is enough for v2 foundation)
