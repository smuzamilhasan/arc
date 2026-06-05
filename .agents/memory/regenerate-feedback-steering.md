---
name: Regenerate feedback steering
description: How the optional "steer this regeneration" feedback step is wired across AI generation surfaces, and which surfaces deliberately skip it.
---

# Regenerate feedback steering

A reusable web hook (`artifacts/personal-brand/src/components/regenerate-feedback.tsx`,
`useRegenerateFeedback`) gates AI regenerations behind an optional feedback dialog.
`requestFeedback(hasExisting, run)` runs immediately with no dialog on first generation
(`hasExisting=false`); when prior content exists it opens a dialog with one Textarea +
Skip/Regenerate. Skipping or empty text passes `feedback=undefined`, preserving the
old no-feedback behavior (no regression).

Backend: `feedback?: string` flows through Zod request bodies and into each service via
`feedback.ts` (`feedbackBlock`, `classifyFeedbackParts`). Multi-part surfaces route
feedback to sub-prompts: audit's `runAudit` classifies feedback into seo/geo/recommendations
parts.

**Why (audit honesty rule):** audit feedback is injected into `summarizeSeo`,
`gatherWebContext`+`summarizeGeo`, and `buildRecommendations`, but deliberately NOT into
`askGeoModel`/`classifyGeo`. The GEO models and the classifier must reflect what the web
actually says about the person, uninfluenced by the user steering — otherwise the audit
stops being an honest mirror.

**How to apply:** adding a new regen surface = thread `feedback?` through the service +
Zod body + route, then wire `useRegenerateFeedback` on the page and gate the "regenerate"
(not first-run) action through `requestFeedback`. First-run/auto-gen paths (e.g. narrative
auto-synthesis, pillar background example generation) intentionally stay dialog-free.

**Gotcha:** an `onClick={runFn}` where `runFn(feedback?: string)` has an optional first
arg leaks the click event as `feedback`. Always wrap: `onClick={() => runFn()}`.
