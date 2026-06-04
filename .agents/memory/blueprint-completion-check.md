---
name: Blueprint "is it complete?" check
description: Which helper to use when detecting whether the onboarding Blueprint is fully done
---

To detect whether the whole Blueprint is complete (e.g. to redirect the user
onward after a final pillar save), use `nextPillar(client) === null`, NOT
`nextPillarAfter(client, currentId) === null`.

**Why:** `nextPillarAfter` deliberately skips the current pillar. So if the
pillar the user just saved is itself still incomplete (common in single-pillar
stages like basics/story/credibility where later stages are locked), it returns
null even though work remains — causing a false "done" / premature redirect.
`nextPillar` considers all unlocked pillars including the current one.

**How to apply:** `nextPillarAfter` is for "what's the next thing to nudge toward
after this one" (the post-save nudge card). `nextPillar` is for "is anything left
at all" (global completion gating).
