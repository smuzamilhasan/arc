# v1 engine diagnosis

Evidence-based diagnosis of why current output is generic and why agent role-lock is weak. All findings cite file paths from `~/Downloads/Arc/`.

## Substrate (profile schema)

`lib/db/src/schema/clientProfile.ts` — 80+ fields, almost all `text(...)` strings.

| Concern | Evidence | Impact |
|---|---|---|
| Voice as one string | `personalityTone: text(...)` line 57 | Critical — no structured voice features |
| No voice artifacts table | No `voice_samples` / `post_archive` schema anywhere | Critical — ghostwriter never sees real writing |
| Free-text everywhere | `signature_frameworks`, `signature_achievements`, `professionalJourney`, `earlyLife` are all `text` | High — no structured queries, no per-field analysis |
| No negative space | `nonNegotiables` is one string, no anti-examples table | High — system has no model of what user *refuses* to say |
| No story bank | Anecdotes live as prose inside `professionalJourney`, not as redeployable units | Medium — every post starts from scratch |
| No reference library | Names / books / frameworks the user cites are not modeled | Medium — losing a key non-genericness signal |

**Substrate verdict:** generic-in, generic-out. No amount of prompt engineering recovers from this. Schema is the root.

## Agents (role lock)

`artifacts/api-server/src/services/`

### Ghostwriter (`ghostwriter.ts:74-203`)

- Builds drafts from `personalityTone`, `brandValues`, `pointOfView`, `coreNarrative`, themes, bio, achievements, thesis, frameworks
- **Zero examples of actual posts** in context
- No `Post.content` lookup, no archive of prior writing
- Voice is built from self-reported adjectives, not demonstrated patterns
- Forbids inventing facts (good) but does **not** forbid drafting when voice context is thin (bad)

### Strategist / Assistant (`assistant.ts:411-437`, `assistant.ts:272-404`)

- Massive system prompt ("master brand strategist")
- `buildSystemContext` (lines 272-404) serializes **the entire user state** into one blob — profile, audit, dossier, narrative, platform strategy, content strategy, posts (titles only), ideas (titles only)
- Same blob passed to every agent call
- Posts are referenced as `[#${id}] (${platform}/${status}) ${title}` — no content, no voice signal extracted

### Narrative (`narrative.ts:26-113`)

- Prompt says "specific, not generic" (line 92) without any contrastive examples
- No competitor narratives shown as foils
- No "examples of sharp narratives" or "examples of generic narratives to avoid"
- Aspiration without enforcement

### Planner (`plannerChat.ts:1-50`)

- Inherits same `SystemContext`
- Calendar ops are produced as text, not structured operations (re-parsing required)

### Investigator (`investigator.ts:39-148`)

- Receives `describeClient` summary (lines 39-46)
- Calls Gemini Google Search — good external grounding
- Never feeds web findings back as "here's how the world sees you vs. what you claim" friction signal

## Voice handling — the critical void

- No schema field for archived posts
- No analysis pipeline from `posts.content` to voice features
- No metric: sentence length, lexicon, signature moves, punctuation signature
- No comparison: "draft A is 60% distinctive vs prior writing"
- No feedback: edits to drafts don't update voice profile

## Onboarding (`personal-brand/src/pages/onboard.tsx`)

- 3 steps, 10 questions total
- Fixed `STEP_FIELDS` (lines 90-94) — non-adaptive
- No external data fetch (no LinkedIn / X auto-import)
- No probing for narrative arc, signature moves, recurring references
- No sampling of user's actual writing

## Eval

- `assistant-batch.test.ts` — tests confirm/reject action mechanics, not output quality
- `narrative.spec.ts` — e2e, no ground-truth voice fixtures
- No prompt eval, no output grading, no fixture personas, no regression gates
- No logging surface for "show me the last 100 generations and let me rate them"

## Context curation

- One function (`buildSystemContext` in `assistant.ts`) builds one blob for all agents
- No per-agent shaping
- No "what does this agent need *only*?" curation

## Root causes, ranked

1. **No voice sample ingestion or storage** — Ghostwriter has no access to how user actually writes. *Fix in schema + ingestion.*
2. **Monolithic context** — same blob to every agent. *Fix in context curator.*
3. **Self-reported voice without ground truth** — `personalityTone` is a string. *Fix in voice features schema + extraction agent.*
4. **No comparative / boundary signals** — "be specific" with no examples. *Fix in prompt design + anti-examples.*
5. **No feedback loop** — user edits don't update profile. *Fix in eval + capture pipeline.*
6. **Thin onboarding** — 10 form fields never probe deep. *Fix in conversational onboarding.*
7. **Free-text role descriptions** — agents share context, not contracts. *Fix in agent contracts framework.*

Every fix in v2 maps to one of these seven root causes. Anything that doesn't is out of scope.
