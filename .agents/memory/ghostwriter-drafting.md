---
name: Ghostwriter drafting design
description: How the Ghostwriter content-drafting flow is shaped and why it has no DB table
---

# Ghostwriter drafting

The Ghostwriter (`POST /posts/draft`, operationId `draftPosts`) generates content drafts (post/hook/article) in the client's voice and returns them **un-persisted**. The client edits them in a dialog and saves the ones they want via the normal `POST /posts` (status `draft`). Discard = just don't save.

**Why:** the requirement is "editable drafts the client reviews before anything is published." Returning ephemeral drafts and reusing the existing post-create path satisfies review-before-publish without a new drafts table, extra cleanup in `deleteClientData`, or new ownership-scoping surface.

**How to apply:**
- Do NOT add a `drafts` table for this. If you need history/persistence of generations later, that is a deliberate new decision — reconsider the whole flow.
- The endpoint is rate-limited with `aiGenerationRateLimit` (it is an AI call) and must be registered BEFORE `/posts/:id` so the literal path isn't captured by the param route.
- Voice comes from `client.personalityTone/desiredFeeling/brandValues/nonNegotiables` + the latest narrative (`pointOfView/coreNarrative/themes/contentHooks`); narrative is optional. Grounding uses the substance profile fields with the same `<...>` untrusted-data wrapper + no-fabrication rules as `profile.ts`.
- Variant count is bounded server-side per format in `services/ghostwriter.ts` (post 1-3, hook 1-6, article 1) — never trust the client's `count`.
- Idea → Ghostwriter handoff is a URL convention: the Idea Bank navigates to `/content?draftIdea=<id>&draftTitle=...&draftPlatform=...`; the Content page reads it via wouter `useSearch`, opens the dialog prefilled, then strips the params with a `replace` navigation.
