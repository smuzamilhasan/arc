---
name: Narrative generation source
description: How/when a narrative_profiles row is created and where its inputs come from
---

# Narrative generation

A `narrative_profiles` row only exists after `POST /narrative/generate` runs; `GET /narrative` returns 404 until then. The Narrative page treats a 404 as "no narrative."

**Decision:** The Narrative page auto-synthesizes from the onboarding "coach" answers (passions, beliefs, frustrations, desiredChange, audienceImpact on client_profile) instead of forcing a separate interview. The hardcoded 4-question "Synthesis Interview" is only a fallback (no coach material captured) or an explicit "Retake" override.

**Why:** Onboarding's final step asks narrative-style questions; users expected those to produce the narrative and were confused when the Narrative page re-asked them. The narrative AI service already consumes the coach fields from the profile, so the answers were never lost — only the trigger was missing.

**How to apply:** If you change onboarding's coach fields or the narrative interview questions, keep the client→question seeding map in `pages/narrative.tsx` (`seedAnswersFromClient`) in sync. Auto-gen is guarded by a ref so it fires once per page load.
