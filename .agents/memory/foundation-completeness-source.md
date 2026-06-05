---
name: Foundation completeness must share one source
description: Why nav + dashboard completion state must read the same /dashboard summary, and the href-rewrite trap in the nav collapse
---

# Foundation completeness: one source of truth

The "Foundation complete" state drives BOTH the dashboard Overview card and the
left-nav collapse (four entries — Blueprint/Audit/Narrative/Platforms — become a
single Foundation hub button).

## Rule 1: compute completeness from the same source everywhere
Both the dashboard page and the nav (`layout.tsx`) must read audit/narrative
completeness from the consolidated `GET /dashboard` summary
(`auditComplete`/`narrativeComplete`), not from separate per-resource queries.

**Why:** the nav previously used independent `useGetLatestAudit` +
`useGetNarrative` queries while the dashboard used `/dashboard`. When the two
sources disagreed (one query erroring/stale), the dashboard collapsed but the
nav did not, leaving the foundation panels showing separately.

**How to apply:** if you add another surface that flips on foundation
completeness, feed it the `/dashboard` summary, not ad-hoc resource fetches.

## Rule 2: collapse logic keys off stable label, not href
The nav rewrites the Blueprint href to `/blueprint/view` once the blueprint is
complete, and foundation-complete implies blueprint-complete. So an `href ===
"/blueprint"` check in the collapse never matches and the Foundation item is
never inserted — Blueprint stays in the nav while the others vanish.

**Why:** the href is a mutated/derived value; the label is stable identity.

**How to apply:** when collapsing/replacing nav items, match on `item.label`
(or another stable id), never on the possibly-rewritten `href`.
