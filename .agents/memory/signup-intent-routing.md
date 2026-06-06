---
name: Signup intent routing (agency vs individual)
description: How the "For agencies" path reaches agency creation, and why entry routing must gate on hasAgency not personalClientId.
---

The landing "For agencies" buttons only set a localStorage signup intent (key `arc.signupIntent`) then go to the SAME `/sign-up` page as individuals. The post-auth Entry page reads that intent to decide where to send the user.

**Rule:** agency-intent routing in `entry.tsx` must gate on `!hasAgency` (no agency membership yet), NOT on `personalClientId == null`.

**Why:** the original bug gated the agency-creation redirect on `personalClientId == null`, so any user who already had a personal profile was silently sent to `/dashboard` and could never create an agency via "For agencies". An existing individual clicking "For agencies" is a legitimate path — they become an agency owner who also has a personal brand.

**How to apply:**
- Consume the intent exactly once per Entry decision (set the routed guard before reading it), so the intent is cleared even on the default onboard/dashboard path and doesn't stick for future visits.
- `/agency?create=1` is the create surface and works for any signed-in user; `account.tsx` StartAgency is the discoverable entry for existing users.
- `peekSignupIntent()` (non-consuming) is for sign-up-page UX copy only — the real consume happens at Entry after auth.
- Routing precedence: existing agency operator (no personal profile) -> `/agency`; else intent==="agency" && !hasAgency -> `/agency?create=1`; else onboard/dashboard.
