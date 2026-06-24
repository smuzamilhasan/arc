# Onboarder agent

Adaptive conversational profile-filler. Opens already informed (extractor pre-fill), drills on vague answers, knows when to stop.

This agent is the answer to the diagnosis finding: "v1 onboarding is 3 form steps, 10 fields, fixed order, never sees the user's actual writing."

See `docs/v2/prds/conversational-onboarding.md`.

## How it works

The Onboarder is a single-turn `RoleContract` invoked once per conversation turn. The orchestrator (`services/onboardingSessionService.ts`) holds conversation state across turns; the agent itself is stateless.

```
┌──────────────────────────────────────────────────────────────────┐
│                  OnboardingSessionService                         │
│                                                                   │
│  state: log, slotCoverage, profile snapshot, extractor snapshot   │
│                                                                   │
│  per turn:                                                        │
│   1. append user answer to log                                    │
│   2. playbook.chooseNextSlot(coverage) → focus slot               │
│   3. build OnboarderInput                                         │
│   4. runner.run(onboarderContract, input)                         │
│   5. apply side effects:                                          │
│       • question → persist + return                               │
│       • patch   → applyProfilePatch + bump confidence             │
│       • wrap    → mark session wrapped                            │
│   6. check isCoverageComplete → synthetic wrap if so              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       Onboarder agent
                       (stateless, pure)
```

## Playbook

`playbook.ts` defines 9 slots in priority order. Each slot has:
- `required: bool` — required slots gate `coverage_complete`
- `confidence_target` — when to consider the slot filled
- `stop_after_turns` — when to move on, even if not at target
- `unlocked_by` — prerequisite slots

Priority order (first 5 are required + load-bearing):

1. `positioning.claim` — sharpest sentence drives everything else
2. `positioning.adjacent_claims_rejected` — what user is NOT
3. `icp.archetypes` — one well-specified archetype > 4 shallow
4. `worldview.beliefs` — confirms extractor hypotheses
5. `voice.confirmation` — user signs off on extracted voice
6. `anti_examples` — 3 posts that sound nothing like them
7. `negative_space.refused_topics` — words/topics/takes refused
8. `story_bank.confirmation` — confirms candidates from extractor
9. `reference_library.confirmation` — yes/no per extracted name

Why playbook in code (not in the prompt): the conversation structure is deterministic and reviewable in PR diffs. The LLM decides *how* to ask, not *what* to ask about.

## Role lock

| Allowed | Forbidden |
|---|---|
| One question per turn on the current_slot | Ask about a different slot than current_slot |
| Drill on a vague last answer | Draft content for the user |
| Open with 'confirm' when extractor has pre-fill | Mass-update multiple unrelated slots |
| Emit a patch when answer carries signal | Confidently fill a slot from a vague answer |
| Wrap on user_paused | Wrap without orchestrator stop signal (unless conversation is long) |

`assert_no_violations` enforces:
- Question target_slot matches current_slot (no slot-jumping)
- Question prompt_text ≤ 600 chars (no rambling)
- Patches reference correct client_id with ≥ 1 op
- Wraps only emitted under valid conditions

## Stop conditions

Conversation ends when one of:
- All required slots above `confidence_target` (or `stop_after_turns` hit) → `coverage_complete`
- User explicitly says "stop", "pause", "later", "done" → `user_paused`
- 7+ consecutive turns without slot confidence change → `perseveration` (orchestrator decides)

Target completion: 12–20 turns, not 60.

## File map

```
onboarder/
├── contract.ts    # RoleContract<I, O> + input schema + system_prompt + assert_no_violations
├── playbook.ts    # Slot priority + chooseNextSlot + isCoverageComplete + aggregateConfidence
├── index.ts       # Registers contract with role registry
└── README.md
```

## API surface (from the service)

```
POST /api/v2/onboarder/start    → { sessionId, firstTurn, resumedExisting }
POST /api/v2/onboarder/answer   → { kind, sessionId, turn?, reason?, aggregateConfidence }
GET  /api/v2/onboarder/status   → { active, sessionId, turnCount, aggregateConfidence, slotCoverage, log }
```

## Calibration

The Onboarder's quality depends on:
1. **Extractor pre-fill** — high-confidence candidates make the opening turn dramatically better ("I noticed X..." vs "Tell me about yourself")
2. **Playbook order** — the most leveraged slots fill first
3. **Drill prompts** — vague answers must trigger drills, not skipping

The eval harness scores onboarder runs on:
- `slot_coverage` — required slots filled
- `adaptivity` — drills on vague answers
- `stop_condition_respect` — wraps on coverage_complete cleanly
- `informed_opener` — uses extractor snapshot in opening turns

If `informed_opener` scores low after extractor populates, the prompt needs sharpening — not the playbook.
