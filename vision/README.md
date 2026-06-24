# arc. / BuildMyArc — vision

The strategic substrate. Every agent and every loop reads from here. If a feature, prompt, or proposal contradicts this document, the document wins.

This file is human-curated. It is not generated. The loop may *propose* edits via a PR; it never writes here directly.

---

## North star

**A proactive content employee, resident on WhatsApp, who runs an expert's personal brand for them.**

The destination is no dashboard at all. The user texts a message; the assistant has already drafted three posts in their voice, surfaced an angle worth pulling on, scheduled the week's cadence, and queued a reply to the inbound that matters. The user approves or redirects. The system compounds.

The web app is the engine room. The WhatsApp surface is where the user actually lives. v1 is the engine; v2 is the surface; v3 is the compounding (the assistant getting demonstrably better at *this specific user* every week).

> **Build in silence. Arrive loud.**

---

## What this is, in one paragraph

BuildMyArc is the productized form of arc.'s method — the system that turns an expert's expertise into an undeniable presence in their field, without it eating their week. It interviews them (and reads their public footprint) to build a living operating profile; it runs distribution as a calendar in their voice; it tells them what to build, say, and ship next; and it is designed from day one toward a chat-native surface where the whole thing runs as a single conversation.

It is **not** a generic AI writing tool. The wedge is **voice fidelity + strategic taste**, and that wedge is defended by structured profiles, structured agent roles, and eval rigor — not by prompt cleverness.

---

## The wedge (why we win)

As AI commoditizes generic software, the moat moves to **narrative, taste, judgment, and distribution** — the things that are inherently personal. Generic AI tools produce slop because they have no real model of who the user is. The closer the system gets to a true model of *this specific person*, the further the output drifts from slop and toward "sounds exactly like them."

The wedge is therefore:

1. **Depth of profile.** A structured, layered, evolving model of the user (positioning, ICP, voice mechanics, worldview, story bank, negative space, references) — not a free-text blob.
2. **Voice fidelity.** Voice is extracted from real artifacts (their actual posts, transcripts, talks), not self-reported adjectives. The system knows how they actually sound.
3. **Strategic taste.** The system enforces non-genericness: it refuses to ship the obvious take, surfaces the contrarian angle the user actually believes, and won't draft what the user would never say.
4. **Surface that disappears.** The destination is a chat. The product gets simpler over time, not more complex.

If a proposed feature does not deepen one of these four, it probably should not exist.

---

## ICP

### Primary archetypes

| Archetype | What they want | What they will pay for |
|---|---|---|
| **Founders** (Seed → Series A, technical or domain expert) | Their conviction to pull talent, capital, customers | Authority that compounds without becoming a full-time content job |
| **Operators** (senior IC → exec, 10+ yrs) | The expertise they've earned to be visible | A way to show up consistently without willpower |
| **Experts & consultants** (advisory, niche specialists) | To be *the* name in their niche so right work finds them | Inbound, qualified, and on-positioning |
| **Creators** (existing audience, looking to compound) | A system, not a treadmill | The strategic layer their existing tools lack |

### Jobs to be done

- "Help me sound like *me*, at scale."
- "Tell me the right thing to post, not just generate options."
- "Stop making me start from a blank page."
- "Show me the next move, not another dashboard."
- "Don't make me learn another tool."

### Where they live (today)

LinkedIn (highest signal), X (second), Newsletter (high intent), YouTube (long-form). Podcasts are an inbound channel, not a publishing one for most of the ICP.

### Geography

US · Gulf · Pakistan (in that order of buying power; equal-priority in product quality).

### Disqualifications

- People who want **anonymous** or generic-influencer growth (they want a brand, not a person)
- People who want **automated DM outreach** at scale (we don't do that)
- Agencies looking for a *white-label* slop factory (we serve the agency *workflow* but not the slop)

---

## Non-goals

These are not "we haven't built them yet." These are **we will refuse to build them, even at the cost of users who want them.** This is the load-bearing list for the ideation loop.

1. **No dashboards-for-the-sake-of-dashboards.** Every metric on screen must change a user decision. Vanity metrics are forbidden.
2. **No auto-publishing without explicit per-post approval.** The user approves every piece of content that goes out under their name. Approval *can* be a single WhatsApp reply; it is never optional.
3. **No outbound DM / cold automation.** Ever. This destroys the brand we are trying to build.
4. **No generic AI writing.** If the system can't write it in the user's voice with evidence, it does not write it. A confidence-too-low refusal is a feature.
5. **No persona-faking.** The system never invents claims, achievements, anecdotes, or quotes. Drafts cite their substrate.
6. **No engagement-bait optimization.** We optimize for *being the name in the niche*, not for likes. Hooks come from substance, not from manipulation patterns.
7. **No "more is better."** Cadence is set by the user's voice and the audience's appetite, not by a posting quota.
8. **No multi-brand for one user.** One person, one arc. Agencies serve multiple clients; clients are not "brands."
9. **No copy-paste competitor monitoring.** We don't help users mimic competitors. We help them differentiate.
10. **No "AI content tool" framing.** This is a brand-and-distribution system that uses AI. Framing matters; framing leaks into prompts.

---

## Principles (taste)

These are how we make calls when the doc above doesn't decide for us.

- **Substrate over prompts.** When output is generic, the fix is almost never in the prompt. It's in the schema feeding the prompt. Fix the substrate first.
- **Structured > free text.** Every place a future agent will read, write structured. Free text is a dead end.
- **Refuse > placeholder.** A confident "I don't know enough to draft this" is worth more than a confident-sounding draft built on nothing. Train the system to refuse.
- **Evidence over assertion.** "Sounds like the user" is not a vibe check — it's a measurable claim against the user's actual artifacts.
- **One signal per viewport.** Carries over from the design system. Cognitive load is a cost.
- **The destination is a chat.** Every UI decision is made knowing the UI will eventually be removed.
- **Voice is sacred.** No agent, ever, drafts in any voice other than the user's, without explicit user request.
- **The 13 users (and the next 50) shape v2.** Every architectural decision is checked against "does this make their experience better?" before "is this elegant?"
- **Eval before ship.** No prompt change lands without running the eval harness. No exceptions.

---

## v2 scope (what unpause means)

The 13 migrated users are paused until v2. v2 is **shipped** when:

1. **Substrate is structured** — profile v2 schema is live, with structured voice features, story bank, negative space, references, anti-examples.
2. **Voice is extracted** — Apify ingestion pulls LinkedIn / X / YouTube / blog footprint and a voice-extraction agent populates voice features at confidence threshold.
3. **Onboarding is conversational** — adaptive agent fills the profile schema via dialogue, with the public-footprint pre-fill as the opening move.
4. **Agents are contract-bound** — typed I/O, role-locked, context-curated per agent. No more single-blob context.
5. **Eval harness gates ship** — fixture personas, rubric-scored outputs, baseline + delta tracked in CI.
6. **One end-to-end demo is undeniable** — Muzamil's own profile, ingested and conversationally completed, produces 5 drafts that are demonstrably in his voice (scored ≥ threshold) and that he'd actually post.

WhatsApp is **v3**. It is not v2. v2 is the engine becoming worth the surface.

UI/UX overhaul comes **after** the engine is producing non-generic output, not before. Polishing the wrong layer is the most common waste in product.

---

## What changes this document

- Material learning from the 13 users (or their successors) when they come back online
- A clear shift in ICP buying behavior (signal, not noise)
- An eval result that contradicts a stated belief
- The founder (Muzamil) explicitly editing it

What does *not* change this document: a single user's request, a competitor launch, a trend, a model release, or the ideation loop's enthusiasm.
