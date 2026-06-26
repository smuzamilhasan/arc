# PRD — comprehensive profile + progressive profiling

**Status:** built & live (2026-06-26). See [`../STATUS.md`](../STATUS.md) §6.

## Problem

v1 onboarding was 3 form steps / ~10 fields and never saw the user's real writing. The result was generic output, because the engine was reasoning from adjectives, not from a complete picture of *who the person is, who they're for, what they sell, how they sound, and what they refuse to say*. A personal-brand employee needs the same context a great human ghostwriter builds over months.

Two failures to fix:
1. **Coverage** — the profile didn't model enough of the brand (no ICP depth, no offers, no goals, no market context, no reputation, no operating preferences).
2. **Collection** — even a complete schema fails if you ask for it all in one giant form. Nobody fills a 49-field form. It has to fill *progressively*, across many small touchpoints over time.

## The spec — 15 sections

The comprehensive model (49 tracked fields) maps to 13 JSONB layers:

| # | Section | Layer | Source |
|---|---|---|---|
| 1 | Identity | `identity_v2` | extract + onboard |
| 2 | Positioning | `positioning_v2` | extract + onboard |
| 3 | ICP / audience | `icp_v2` | onboard + research |
| 4 | Voice | `voice_v2` | **extract** (voice pipeline) |
| 5 | Worldview | `worldview_v2` | extract + onboard |
| 6 | Negative space / boundaries | `negative_space_v2` | onboard |
| 7 | Goals & objectives | `goals_v2` | onboard |
| 8 | Offers & monetization | `offers_v2` | onboard |
| 9 | Operating preferences | `operating_prefs_v2` | onboard |
| 10 | Content strategy | `content_strategy_v2` | extract + onboard |
| 11 | Channels & distribution | `channels_v2` | extract + onboard |
| 12 | Market & competitive context | `market_context_v2` | **research** 🔎 |
| 13 | Reputation & footprint | `reputation_v2` | **research** 🔎 |

(Story bank and reference library are substrate *tables*, populated by extraction, not layers.)

Each field declares: **source** (how it gets filled), **touchpoint** (where we ask), **priority**, **core?** (is it load-bearing for the Ghostwriter), a **question** (for asked fields), and an **`isFilled` detector**.

### Sources

- **extract** — derived from real artifacts by the voice/extraction pipeline (no asking).
- **onboard** — asked conversationally by the Onboarder, or one-at-a-time via the Studio micro-prompt.
- **research** 🔎 — auto-fillable from public data (competitors, trends, followings, current perception). *This is the seed of the consultant feature* — the system researching the market for you. Currently modeled + tracked; auto-fill not yet wired.

## Progressive profiling — the mechanism

`services/profile/progressService.ts` turns the registry into a self-filling system:

- `loadSnapshot(clientId)` — assembles the profile state the registry checks.
- `computeCompleteness(snapshot)` — overall %, **core %**, per-section filled/total, and a priority-sorted `missing[]`.
- `nextQuestions(snapshot, touchpoint, n)` — the highest-leverage *unfilled, askable* fields for a touchpoint. `micro` surfaces both micro- and onboarding-tagged gaps.
- `captureAnswer(clientId, fieldKey, answer)` — an LLM maps a freeform answer into a typed layer patch and merges it via the accessor (validates on write). Returns the layer written or a reason it couldn't.

### Touchpoints (where the 49 fields get collected)

1. **Calibration / ingestion** — fills the `extract` fields automatically from real posts/transcripts.
2. **Onboarder chat** — fills the deep `onboard` fields conversationally, in priority order.
3. **Studio "Sharpen your profile" micro-prompt** — one question at a time, anywhere in the app, so the profile keeps climbing without a form.
4. **(planned) Inline, mid-draft** — the Ghostwriter asks for a missing field exactly when it needs it.
5. **(planned) Research auto-fill** — the 🔎 fields, filled from public data.

## Why this matters for v3

The WhatsApp employee is only as good as this profile. Every proactive action — "draft this," "you haven't posted in 5 days," "this trend fits your wedge" — is a read against these layers. The completeness/next-question engine is also how the bot will *naturally* keep profiling the user in conversation instead of via forms. Build the profile right, and the proactive layer has something to reason from.

## Endpoints

- `GET /v2/profile/completeness`
- `GET /v2/profile/next-questions?touchpoint=micro&n=1`
- `POST /v2/profile/answer` `{ fieldKey, answer }`

## Non-goals

- A profile *editor* UI for every field (agents write; humans confirm — direct field editing is intentionally not exposed).
- Filling 🔎 research fields by asking the user (those should be researched, not asked).
