# PRD — Conversational onboarding

## Problem

v1 onboarding is 3 form steps, 10 fields, fixed order, no probing, no public-footprint pre-fill. Users skip or rush fields they don't care about. The profile is sparse going into generation. Output is generic.

## Outcome

An adaptive conversational agent (the **Onboarder**) that:

1. Begins **already informed** — Apify ingest has run, voice extractor has populated provisional features, story candidates, references, worldview hypotheses.
2. Opens with high-signal questions: "I read your stuff — here's what I picked up. Tell me what I got wrong."
3. Has a **playbook** of profile slots to fill, ranked by leverage.
4. Drills into vague answers with sharper follow-ups.
5. Knows when to stop — confidence per slot, terminates when leverage curve flattens.
6. Outputs `ProfilePatch`es continuously, not at the end. The profile fills *during* the conversation.

This is **not** a chatbot wrapper around the v1 form. It is an agent with a structured target.

## Architecture

```
Onboarder agent
  │
  ├─ inputs: ProfileContext (current state) + IngestSnapshot (extracted candidates)
  ├─ playbook: ranked list of slots × question generators
  ├─ output: stream of ProfilePatch operations
  └─ stop condition: required-slot coverage + leverage threshold
```

The agent does not run free-form. Every turn:

1. Look at current profile state
2. Identify the highest-leverage unfilled slot
3. Choose a question type:
   - **Confirm**: "I picked up X from your posts — confirm / correct?"
   - **Drill**: previous answer was vague → "When you say X, do you mean Y or Z?"
   - **Probe**: open question on a slot we have no signal for
   - **Verify**: contradiction across signals → ask which is true
4. Receive answer
5. Emit `ProfilePatch`
6. Decide next move (continue / wrap / pause for follow-up)

## Playbook structure

```ts
type SlotPlaybook = {
  slot: ProfileSlot;
  required: boolean;
  confidence_target: number;
  question_generators: QuestionGenerator[];
  stop_after_turns: number;     // anti-perseveration
  unlocks?: ProfileSlot[];      // gating
};
```

Slots are ordered so highest-leverage land first. Examples (priority order):

1. Positioning claim + adjacent rejections
2. ICP archetypes (one good archetype > four bad ones)
3. Worldview confirmation (from extractor hypotheses)
4. Voice confirmation (from extractor features)
5. Anti-examples ("show me 3 posts that sound nothing like you")
6. Negative space ("what would you never write about?")
7. Story bank confirmation (from extractor candidates)
8. Reference library (passive — populated mostly from extraction)

## Stop condition

Onboarding ends when:
- All `required: true` slots above confidence threshold, OR
- 7 consecutive turns without measurable profile state change (perseveration), OR
- User taps "I'm done for now" (resume later)

Average completion: 12-20 turns, not 60.

## UX

- Single-page chat-style UI
- Visible profile-completeness indicator (which layers are filling)
- "Resume later" first-class — onboarding is not a one-sitting thing
- Apify ingest runs in background during conversation; new findings surface as the agent says "actually, I just spotted X — talking about this for a sec?"

## Refusal behavior

If a user provides contradictory or shallow answers, the agent refuses to confidently fill that slot. Better a clearly-low-confidence slot than a confident wrong one. Ghostwriter respects confidence downstream.

## Acceptance

- Onboarder contract defined (input / output / role / rubric)
- Playbook with all 8 slots, question generators, stop conditions
- One end-to-end run on Muzamil-real fixture produces a complete v2 profile in ≤ 25 turns
- Profile state changes monotonically (no fill / unfill flapping)
- Resume-later works (state persists per turn)

## Out of scope

- Multi-language onboarding (English only)
- Voice / audio onboarding (text-only for v2; voice-input is v3)
- WhatsApp delivery (UI is web; chat in WhatsApp is v3)
