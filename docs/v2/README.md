# BuildMyArc v2 — engine rebuild

The strategic and technical plan for v2: rebuilding the profile, agents, and eval layer to produce voice-faithful, non-generic output before WhatsApp ships in v3.

## Why v2

v1 shipped a working three-pillar engine (Profile + Distribute + Grow), with a multi-agent Strategist/Planner/Manager system, ~25 surfaces, and 13 migrated production users now paused.

Diagnosis (see [diagnosis.md](./diagnosis.md)) found six **substrate-level** causes of generic output. These cannot be fixed by prompt tuning:

1. **No voice ground truth.** Schema captures `personalityTone` as a string. No structured voice features. No table of the user's actual posts.
2. **Monolithic context.** Every agent receives the same ~8KB profile blob via `buildSystemContext`. No per-agent curation.
3. **Self-reported voice.** No analysis of real artifacts. The ghostwriter writes from adjectives, not patterns.
4. **No comparative anchors.** Prompts say "be specific" but show no foils. Agents have no examples of sharp vs. generic.
5. **No eval gates.** Zero output quality tests. Regressions ship silently.
6. **Thin intake.** Onboarding is 3 form steps, 10 fields, never sees the user's actual writing.

v2 fixes each at the substrate level, in dependency order. WhatsApp is explicitly **v3** — building it on the v1 engine would be putting a chat surface on a generic-output backend.

## Documents

- **[`STATUS.md`](./STATUS.md) — as-built ledger: what is live, partial, or stubbed right now. Start here.**
- **[`roadmap.md`](./roadmap.md) — the plan from here to the WhatsApp employee (v3).**
- [`architecture.md`](./architecture.md) — intended system architecture, dataflow, agent topology
- [`diagnosis.md`](./diagnosis.md) — full diagnostic of v1 engine
- [`prds/profile-schema-v2.md`](./prds/profile-schema-v2.md) — structured profile substrate
- [`prds/comprehensive-profile.md`](./prds/comprehensive-profile.md) — 15-section profile + progressive profiling
- [`prds/agent-contracts.md`](./prds/agent-contracts.md) — typed I/O, role locks, context curator
- [`prds/eval-harness.md`](./prds/eval-harness.md) — fixtures, rubrics, runner, CI gate
- [`prds/apify-ingestion.md`](./prds/apify-ingestion.md) — public footprint ingestion pipeline
- [`prds/voice-extraction.md`](./prds/voice-extraction.md) — structured voice features from real artifacts
- [`prds/conversational-onboarding.md`](./prds/conversational-onboarding.md) — adaptive profile-filling agent

> **Note on progress:** the sequence and stacked-PR tables below are the *original* foundation plan. Steps 1–6 of the substrate are now built and live (see [`STATUS.md`](./STATUS.md)); the document is kept for the rationale and dependency ordering.

## Sequence

Order is set by dependency, not by visibility:

| Step | What | Why this order |
|---|---|---|
| 1 | Profile schema v2 (additive Drizzle migration) | Everything reads from the profile. Schema first or nothing else holds. |
| 2 | Agent contracts framework | Types + role contracts + context curator. Old agents keep running; new agents land alongside. |
| 3 | Eval harness scaffold | Fixtures + rubric + runner. Captures v1 baseline before any rewriting. |
| 4 | Apify ingestion + voice extraction | Independently valuable. Populates voice features. Muzamil is calibration user. |
| 5 | Conversational onboarding | Backed by playbook + structured target + ingestion pre-fill. |
| 6 | Per-agent migration | Move ghostwriter → assistant → narrative → planner → manager → investigator to v2 contracts, one at a time, eval-gated. |
| 7 | UI/UX overhaul | Only after engine output is non-generic at fixture-level. |
| 8 | WhatsApp (v3) | Out of scope for v2. |

## Stacked PRs

Each row below is a draft PR off the `v2/foundation` branch, intended to be reviewed and landed independently. All PRs are foundation — no agent rewrites, no production behavior changes — until the user approves the foundation.

| PR | Branch | Contents |
|---|---|---|
| #1 | `v2/foundation` | Vision docs + this doc + all PRDs + architecture + diagnosis |
| #2 | `v2/profile-schema` | Drizzle migration: structured profile layers, voice samples, voice features, story bank, references, negative space, anti-examples |
| #3 | `v2/agent-contracts` | Typed I/O, role contracts, context curator, base agent, role registry |
| #4 | `v2/eval-harness` | Fixture personas (Muzamil + 3 synthetic), per-agent rubric, runner stub, baseline capture script |
| #5 | `v2/apify-ingestion` | Apify actors integration, footprint ingest pipeline, voice extraction agent |
| #6 | `v2/conversational-onboarding` | Playbook-backed adaptive onboarding agent + UI |

## Guardrails (loop-safe)

- Foundation work is **additive only**. v1 keeps running. Nothing in v2 changes v1 behavior until per-agent migration (step 6).
- All v2 code lives under `*/v2/`, `*/agents-v2/`, `*/eval/` namespaces. No edits to v1 service files in foundation PRs.
- No prod data writes from any v2 code path until eval gates pass on fixtures.
- WhatsApp out of scope. Any PR introducing Twilio is rejected at foundation phase.
