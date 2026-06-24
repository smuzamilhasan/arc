# v2 architecture

## Principles

1. **Substrate first.** Schema before prompts, prompts before UI.
2. **Structured contracts.** Every agent has a typed input schema and a typed output schema. Hand-offs are JSON, not prose.
3. **Per-agent context curation.** A deterministic curator builds the right context blob for each agent. No agent sees the full profile by default.
4. **Role-locked.** Each agent declares an allowed-actions list and a forbidden-actions list. Violations are caught at the contract layer, not by hoping the LLM behaves.
5. **Eval-gated.** No prompt or contract change ships without running the fixture rubric.
6. **Refuse over placeholder.** Confidence too low → refuse. Refusal is a first-class output.
7. **Additive.** v1 keeps running. v2 lives in parallel namespaces until per-agent migration is complete.

## System map

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER FOOTPRINT INGEST                       │
│  Apify actors → raw posts, transcripts, comments → cache         │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   VOICE EXTRACTION AGENT (v2)                    │
│  raw artifacts → structured voice features, story candidates,    │
│  reference library, recurring themes                             │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROFILE SUBSTRATE (v2)                        │
│  client_profile (extended, structured layers)                    │
│  voice_samples │ voice_features │ story_bank                     │
│  reference_library │ negative_space │ anti_examples              │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CONTEXT CURATOR (deterministic)                 │
│  per-agent context shaping; no LLM in this layer                 │
└─────┬──────────┬──────────┬─────────┬──────────┬──────────┬────┘
      ▼          ▼          ▼         ▼          ▼          ▼
 ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐
 │Onboarder│ │Strateg.│ │Narratv.│ │Planner │ │Ghostwr.│ │Invst.│
 │         │ │        │ │        │ │        │ │        │ │      │
 │  v2     │ │   v2   │ │   v2   │ │   v2   │ │   v2   │ │  v2  │
 └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬───┘
      ▼          ▼          ▼          ▼          ▼          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              STRUCTURED AGENT OUTPUTS (typed)                │
 │  ProfilePatch │ StrategyProposal │ NarrativeDraft │ CalOps   │
 │  ContentDraft │ ResearchSummary                              │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                        EVAL HARNESS                          │
 │  fixtures × agents × rubrics → scores → trend → CI gate     │
 └─────────────────────────────────────────────────────────────┘
```

## Agent topology

| Agent | Job (1 line) | Allowed actions | Forbidden actions | Output type |
|---|---|---|---|---|
| **Onboarder** | Fills the profile schema by adaptive conversation | Ask, infer, propose `ProfilePatch` | Draft content, decide strategy | `ProfilePatch` |
| **Voice extractor** | Distill structured voice features from real artifacts | Read artifacts, emit features, story candidates, references | Decide strategy, draft content | `VoiceFeaturesPatch` |
| **Strategist** | Decide positioning, narrative, ICP, what to *do* | Propose `StrategyProposal`, request research | Draft posts, edit calendar | `StrategyProposal` |
| **Narrative** | Synthesize positioning into one cohesive narrative | Read strategy + profile, emit `NarrativeDraft` | Draft content for distribution, decide cadence | `NarrativeDraft` |
| **Planner** | Calendar ops only | Emit `CalendarOp[]` (create / move / delete / reschedule) | Draft content, change strategy | `CalendarOp[]` |
| **Ghostwriter** | Draft content in user's voice with evidence | Emit `ContentDraft` citing voice samples + story_bank entries | Decide strategy, change calendar | `ContentDraft` |
| **Investigator** | External research only, structured | Web search, summarize, surface foils | Draft user-facing content | `ResearchSummary` |
| **Manager** | Decompose a user request into a typed plan over the above | Emit `Plan` referencing other agents | Execute work itself, draft content | `Plan` |
| **Evaluator** | Score outputs against rubric | Read fixture + output + rubric, emit `RubricScore` | Edit outputs, change profile | `RubricScore` |

### Hard rules

- Ghostwriter is the **only** agent allowed to produce user-facing prose.
- Strategist is the **only** agent allowed to update positioning / ICP / values.
- Planner is the **only** agent allowed to emit calendar operations.
- Manager is the **only** agent allowed to delegate.
- Evaluator never writes back to any production table.

Violations are caught by the contract layer (output schema validation + allowed-action whitelist) — not by trusting the LLM.

## Dataflow contracts

### `ProfileContext` (input to most agents)

Each agent declares which sections it needs. Curator returns only those.

```ts
type ProfileContext = {
  identity?: IdentityLayer;          // name, role, geography
  positioning?: PositioningLayer;     // claim, ICP, what-they-reject
  voice?: VoiceLayer;                 // features + sample refs (not full samples)
  narrative?: NarrativeLayer;         // current narrative + themes
  worldview?: WorldviewLayer;         // 3-7 non-negotiable beliefs
  stories?: StoryRef[];               // bank entries with summaries
  references?: ReferenceRef[];        // people, books, frameworks they cite
  negative_space?: NegativeSpace;      // refused topics / words / takes
  anti_examples?: AntiExample[];      // posts that sound nothing like them
  voice_samples?: VoiceSampleRef[];   // real artifact refs (ghostwriter only)
};
```

### `StrategyProposal` (Strategist output)

```ts
type StrategyProposal = {
  scope: 'positioning' | 'icp' | 'values' | 'narrative_direction';
  rationale: string;
  patch: ProfilePatch;
  confidence: 0..1;
  evidence: EvidenceRef[];           // which profile slots / artifacts back this
  refuses?: boolean;                 // explicit "I don't have enough signal"
  refusal_reason?: string;
};
```

### `ContentDraft` (Ghostwriter output)

```ts
type ContentDraft = {
  platform: 'linkedin' | 'x' | 'newsletter' | 'youtube_caption' | 'blog';
  body: string;
  voice_evidence: {                  // every draft cites its voice signal
    style_anchors: VoiceFeatureRef[];
    story_anchor?: StoryRef;
    reference_anchors?: ReferenceRef[];
  };
  honors_negative_space: boolean;    // explicit check
  confidence: 0..1;
  refuses?: boolean;
  refusal_reason?: string;
};
```

Drafts that fail `voice_evidence` validation or `honors_negative_space === false` are rejected at the contract layer before reaching the user.

### `CalendarOp` (Planner output)

```ts
type CalendarOp =
  | { op: 'create'; platform; scheduledAt; draftRef?; }
  | { op: 'move'; postId; scheduledAt; }
  | { op: 'delete'; postId; }
  | { op: 'reschedule'; postId; reason; scheduledAt; };
```

No free-text in planner output. Calendar mutations only.

## Context curator

Single function, deterministic, no LLM:

```ts
curate(agent: AgentRole, userId: number): ProfileContext
```

Each agent registers the keys it needs. Curator pulls only those, with size limits, and returns a typed `ProfileContext`. Same input → same output. Cacheable.

Why deterministic: when generic output appears, you can debug by inspecting the exact context blob. LLM-built context is a debugging black hole.

## Eval harness

- **Fixtures**: Muzamil (real, gold standard) + 3 synthetic personas spanning ICP archetypes (founder, operator, creator)
- **Per-agent rubric**: each agent has a rubric specific to its job
  - Ghostwriter: voice-fidelity, non-genericness, story-anchored, honors-negative-space
  - Strategist: alignment-to-profile, evidence-cited, non-genericness, refuses-when-low-signal
  - Narrative: specificity, differentiates-from-foils, voice-coherent
  - Planner: respects cadence, no-double-booking, platform-fit
- **Runner**: `pnpm eval` runs fixtures × agents × rubrics → JSON report
- **CI gate**: PR cannot land if any rubric drops more than N% vs. baseline
- **Baseline**: captured once on v1 services so we measure improvement, not just hold steady

## Migration plan (per-agent)

v2 agents land alongside v1, behind a feature flag. Each migration step:

1. Land v2 agent class (with contracts, role, curator)
2. Run eval on v1 + v2 across fixtures
3. v2 must beat v1 on its rubric by ≥ 20% before flag flip
4. Flip flag for internal users (Muzamil first)
5. Flip flag for the 13 paused users
6. Delete v1 agent after 30 days of v2 stability

Order: Voice extractor → Onboarder → Ghostwriter (the genericness-tier) → Strategist → Narrative → Planner → Manager → Investigator.

## What stays out of v2

- WhatsApp (v3)
- Native social publishing (post-v3, integrations layer)
- Newsletter platforms (post-v3)
- Multi-user collab (no near-term need)
- New marketing surfaces (engine first)
- The other 3 SPAs in the repo (marketing-os, pitch-deck, mockup-sandbox) — out of scope
