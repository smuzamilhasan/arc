# PRD — Profile schema v2

## Problem

v1 captures the user as 80+ free-text fields on `client_profile`. There is no structured voice, no archive of real artifacts, no story bank, no reference library, no negative space, no anti-examples. The substrate cannot support non-generic output regardless of prompt quality.

## Outcome

A structured, layered profile that downstream agents can query precisely. Each agent reads only the slices it needs. Profile evolves over time as ingestion and onboarding fill it in.

## Design (eight layers)

### 1. Identity (unchanged from v1)
Name, role, company, geography, headline, bio.

### 2. Positioning (structured)
- `claim`: the one sentence
- `defensibility`: why this claim is defensible *for this user*
- `adjacent_claims_rejected`: what's nearby that the user explicitly does *not* claim
- `proof_points`: structured citations (achievements, results, reference-able artifacts)

### 3. ICP (structured)
- `archetypes`: list of {label, jobs_to_be_done, watering_holes, what_they_read, where_they_get_stuck}
- `disqualifications`: who this is *not* for

### 4. Voice (structured features, not adjectives)
- `sentence_stats`: avg_len, p90_len, declarative_ratio, question_ratio
- `lexicon`: signature_words[], avoided_words[], banned_phrases[]
- `signature_moves`: list of patterns (e.g. "opens with contrarian framing", "ends with rhetorical question")
- `punctuation_signature`: em_dash_density, colon_use, ellipsis_use
- `formality`: 0..1
- `confidence`: 0..1 per field — populated low until voice extraction fills it

### 5. Worldview
- 3-7 `non_negotiable_beliefs`: structured {claim, why_held, where_it_shows_up}

### 6. Story bank
A new table: redeployable anecdotes with metadata (where used before, themes, audience that resonates).

### 7. Reference library
A new table: people / books / frameworks / events the user cites. Tracks frequency and recency.

### 8. Negative space + Anti-examples
- `negative_space`: refused_topics[], refused_words[], refused_takes[]
- `anti_examples`: list of {sample_text, why_not_this_voice} — 3 minimum, ideally captured during onboarding

### 9. Voice samples (separate table)
Real artifacts ingested via Apify or pasted by user. Source, platform, content, ingested_at, extracted_features (FK to features computed for this sample).

## Schema changes (additive)

All new tables. The v1 `client_profile` row is extended with **JSONB columns** for the structured layers so v1 services keep reading their existing string fields untouched.

```
client_profile  (existing) + ADD COLUMNS:
  positioning_v2        jsonb
  icp_v2                jsonb
  voice_v2              jsonb
  worldview_v2          jsonb
  negative_space_v2     jsonb

NEW TABLES:
  voice_samples       (id, client_id, source, platform, content, content_hash, ingested_at, metadata)
  voice_features      (id, client_id, computed_at, features jsonb, sample_count, confidence)
  story_bank          (id, client_id, summary, body, themes text[], audience_resonance jsonb, last_used_at, embedding)
  reference_library   (id, client_id, kind, label, context, citation_count, last_cited_at)
  anti_examples       (id, client_id, sample_text, why_not_this_voice, created_at)
```

Each row is FK to `client_profile.id`. JSONB layers hold typed shapes (Zod-validated on write).

## Migration

- Drizzle migration adds columns + tables
- No data destruction; no v1 field removed
- Backfill script populates `voice_v2` from `personalityTone` as a low-confidence seed
- v1 services unchanged

## Acceptance

- All new tables exist in dev DB
- Zod schemas defined for each JSONB layer (`profileV2.ts`)
- Type-safe accessors (`getVoiceLayer`, `setVoiceLayer`, etc.)
- Migration runs cleanly on a copy of prod
- No v1 service breaks (smoke test passes)

## Out of scope

- Editing UI for new layers (handled by conversational onboarding PRD)
- Computing voice features (handled by voice extraction PRD)
- Reading new layers in v1 agents (handled by per-agent migration)
