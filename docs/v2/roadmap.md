# v2 → v3 roadmap — to the WhatsApp employee

**Status:** FINAL (post-critique rounds 1 & 2) · 2026-06-26 · calibration user: Muzamil (client_id 3)

> The destination: **a personal content employee that lives on WhatsApp** — it knows you, watches your world, proactively proposes and drafts content in your voice, and acts on your approval. Mission anchor: enable 50,000 people. It must be voice-faithful, proactive (not just reactive), and cost-sustainable at scale.

---

## Where we are (the honest baseline)

The **engine substrate is built and live** ([`STATUS.md`](./STATUS.md)): structured profile, multilingual ingestion, voice extraction, conversational onboarding, comprehensive progressive profiling, and a role-locked Ghostwriter that refuses below confidence. **13 v1 users are paused — and paying nothing — waiting for v2.**

Critically, **two pieces of the "v3" vision already exist in v1, in primitive form** — the roadmap must *harden* them, not rebuild them:

- **An orchestrator** — `services/manager.ts` already decomposes an instruction into ≤4 agent tasks and re-sorts by a deterministic `AGENT_ORDER`. What it lacks: per-user **conversation memory**, a session store, and **corpus retrieval**.
- **A proactive engine** — `services/proactiveScheduler.ts` already ticks per-client (in-process `setInterval`, `MAX_PER_TICK=3`, ~24h cadence guard, state-hash dedup). What it lacks: **durability** (it's in the web process — a restart resets timers, two Railway replicas double-fire, a crash drops a tick silently), per-user-local scheduling, and any **value instrumentation**.

So the real unbuilt hard part is **not** "an orchestrator" or "a proactive engine." It's the **durable async + state substrate underneath them**: a crash-safe job queue, per-user conversation memory + retrieval, idempotent delivery, a deterministic policy layer, and cost metering. Build that once, deliberately, or every later phase re-discovers it.

And the engine is **ungated**: the eval harness `runCell` returns `no_runner` today — output quality is unverified. We can't scale output we can't measure.

## The gaps between here and v3

1. **Trust** — no real quality gate (eval is a stub). 2. **Revenue + truth** — a working reactive product sits idle while 13 paying users are dark. 3. **Substrate** — no durable queue, memory, retrieval, policy layer, or cost metering. 4. **Proaction that's wanted** — the scheduler sends, but nothing measures whether it *should* have. 5. **Publishing + the channel** — drafts don't post; no WhatsApp, which carries hard platform constraints.

## Target architecture (v3)

```
WhatsApp (Meta Cloud API via BSP)            ← channel adapter (transport only)
   │  inbound webhook / outbound + approved templates / 24h-window aware
   ▼
Deterministic POLICY GATE  ──────────────┐   ← NOT an LLM. Owns: 24h-window/template choice,
   │                                      │     approval_style enforcement, publish authorization,
   ▼                                      │     idempotency, retry. The brain calls into it.
Conversation Orchestrator ("the Employee")│   ← wraps existing manager.ts + session memory +
   │  intent → capability agents          │     corpus retrieval + in-chat progressive profiling
   ├── Ghostwriter   (draft, voice-faithful, retrieval-grounded)
   ├── Profiler      (fill the profile, conversationally)
   ├── Researcher 🔎 (trends / market / reputation — the fuel for proaction)
   ├── Planner       (what to post, when — earned cadence)
   └── Publisher     (post to LinkedIn/X, approval-gated, idempotent)
   ▼
Durable job queue + workers (Postgres-native: pg-boss / SELECT … FOR UPDATE SKIP LOCKED)
   │   idempotency keys · retries/backoff · dead-letter · result delivered by PUSH,
   │   in-window check evaluated at DELIVERY time (template fallback if window closed)
   ▼
Profile substrate + memory (13 layers + conversation log + pgvector over voice_samples/story_bank)
   ▼
Model router + per-user token budget (cheap-by-default, premium on final draft, hard cap)
   └── cost-per-active-user attributed from the FIRST agent call
```

## Two long-lead items — start in parallel, day one

1. **WhatsApp BSP onboarding.** The WhatsApp Business Platform is not a chat API. **24h window:** outside 24h of the user's last message you may send only **pre-approved template messages**, to **opted-in** users — exactly the situation a proactive morning draft is in. **BSP + business verification + number + template approval** is a multi-week, bureaucratic process. Treat it as *procurement*, begin now, even though the surface ships in Phase 4.
2. **Researcher spike.** "Watches your world" is the vaguest, riskiest, most load-bearing capability — and proaction has no fuel without it. Spike it cheaply (below) before betting Phase 3 on it.

## Deterministic vs LLM — draw the line once

| Must be deterministic (a policy gate the brain calls) | May be LLM-driven |
|---|---|
| 24h-window / template-vs-freeform choice | intent classification |
| `approval_style` enforcement (review_all / trust_high / autonomous) | which profiling question to ask next |
| publish authorization (never auto-post beyond approval) | draft generation |
| idempotency (Meta retries webhooks — dedupe or double-post) | research summarization |
| retry / backoff / dead-letter | |

If an LLM "autonomous" classification is allowed to reach the publish path, it *will* eventually auto-post something it shouldn't. Authorization is code, not a prompt.

---

## Phases

### Phase 0.5 — Unblock revenue (the Monday-morning list)
*Goal: the smallest possible work that lets us bill the 13 — not the full substrate. The reactive product is synchronous, single-agent, no proaction, no WhatsApp; it needs almost none of the heavy substrate.*
1. **Secrets + cleanup as a gate:** gitignore repo-root `.cf-token`/`.clerk-secret`/`.db-url`; purge dup `story_bank` rows + leaked YouTube test samples for client 3.
2. **Eval as a smoke test:** wire `runCell` with the **deterministic scorers only** (negative-space honored, voice anchor present, format/length, refusal-correctness). No ≥10-fixture bar yet — that's Phase 0.7. Catches regressions today.
3. **Produce the v1→v2 baseline for the 13:** for each paused user, run v2 ingest + extraction and **snapshot a v1-vs-v2 draft pair**. This both upgrades their profile *and* becomes the human-rated eval fixture set (closes the fixture-sourcing gap for free).
4. **Define "publishable" + ship the rating control:** *publishable = the creator ships it with ≤1 light edit*, rated in-product via a Ship/👍 control. This is the metric the whole trust thesis rides on; define it once, here.
5. **Minimal cost log:** write tokens-per-draft to a row. Not a router, not a budget enforcer — just observation, so Phase 1 has real cost data.
6. **Stamp `schema_version` per profile layer** — cheap now; the upgrade story when a field's *semantics* change later (across 13 live users) depends on it.
7. **Parallel (long poles):** start BSP onboarding + the Researcher spike.
- **Exit:** the 13 can be billed; regressions are caught; every reactivated user has a v1-vs-v2 pair to rate.

### Phase 1 — Ship v2 reactive to the 13 (revenue + user truth)
*Goal: stop pre-launching. The cheapest trust signal is a paying user saying "this finally sounds like me."*
- Release the **already-built** Studio + Ghostwriter (no orchestrator, no proaction) to all 13 paused users, behind the Phase 0.5 smoke test. Charge them.
- **Pricing — Phase 1 is a flat tier, credits are a fast-follow.** Bill a **flat included-allowance tier on the existing arc. ladder** — bundle BuildMyArc into/above **Premium Community ($49.99/mo)** with a generous included monthly generation allowance; **cost is logged, not yet metered**. True credit/overage metering (premium draft costs more credits than a capture) arrives with the **model router in Phase 0.7** — don't sell a metered model we can't meter yet. The allowance still acts as the COGS ceiling.
- **Instrument acceptance** via the Phase 0.5 rating control: gate = a set % "publishable" across the rated v1-vs-v2 pairs, materially above v1. v2 must beat v1 on *humans*, not just fixtures.
- **Rollback:** if v2 doesn't beat v1 for a given user, keep them on v1 output for that surface; no forced migration.
- **Exit (human, not synthetic):** a majority of reactivated users rate v2 publishable at a materially higher rate than v1, and they're paying.

### Phase 0.7 — The durable substrate (built in PARALLEL with Phase 1 billing)
*Goal: build the foundation Phases 2–4 stand on, once — without blocking the revenue in Phase 1.*
- **Durable job queue:** Postgres-native (**pg-boss / `FOR UPDATE SKIP LOCKED`** — no Redis in this stack, don't add one), idempotency keys, retry/backoff, dead-letter.
- **Memory + retrieval:** per-user **conversation log**; **pgvector** over `voice_samples`/`story_bank` — the voice-faithfulness lever the brain (Phase 2) and Ghostwriter need.
- **Model router + credits:** cheap-by-default, premium on final draft; per-user token budget / hard cap; cost-per-active-user attribution; this is where Phase 1's flat tier upgrades to real credit metering.
- **Deterministic policy gate** as a module (24h-window/template, `approval_style`, publish auth, idempotency, retry).
- **Upgrade the eval gate** from smoke test to real gate: fold in the ≥10 human-rated v1-vs-v2 pairs from Phase 1; add LLM-judge **advisory** with self-consistency (n≥3, median) + variance, gating on a *band*.
- **Exit:** queue survives a worker crash and a second Railway replica without double-firing; retrieval-grounded drafts measurable; cost-per-draft is a real, metered number; eval is a CI gate, not a smoke test.

### Phase 2 — The Employee brain (web first)
*Goal: one conversation that can do everything — built on what exists, tested where iteration is cheap.*
- **Wrap `manager.ts`** with the Phase 0 session memory + retrieval; add intent→capability routing for the full agent set; natural multi-turn replies. Progressive profiling happens **in conversation** (the next-question engine), not via forms.
- Route async work through the **job queue**; deliver results by push. **Bake the WhatsApp in-window contract into the job result envelope now** (evaluate window at delivery; carry a template fallback) — it's a Phase 2 contract, not a Phase 4 detail.
- Define the **refusal-mid-conversation** turn: when Ghostwriter is below confidence, the bot asks for what it needs — silence reads as broken.
- Surface as a **chat page in the web app** — the same brain that will sit behind WhatsApp.
- **Exit:** Muzamil runs a full loop in chat ("draft about X" → on-voice, retrieval-grounded draft → "save it"), and the bot naturally profiles him when it hits a gap.

### Phase 3 — Proaction (earned + instrumented) + WhatsApp thin slice
*Goal: it works for you without being asked — and you're glad it did. Validate the channel early.*
- **Replace the in-process scheduler** with the durable claimed queue: wake-ups enqueue "due" users, workers claim via `SKIP LOCKED`, scheduled by **user-local send-time bucket** (not one global cron → no thundering herd at 50k, no replica double-fire).
- **Earned cadence, not daily.** Start weekly / "only on a genuinely good hook." Track **proposal acceptance rate** + a trust signal (mutes / ignores / thumbs-down); **auto-throttle** a user when acceptance drops. The Researcher 🔎 is the fuel (and auto-fills market/reputation layers).
- **WhatsApp thin slice in parallel:** wire a Twilio-sandbox number for Muzamil + 2 users and run real proactive pings through the actual **24h-window/template** path. If templates make proaction feel robotic, learn it now — not in Phase 4. Keep **email/web as a parallel proactive surface** so the v3 thesis isn't hostage to Meta approval.
- **Kill-switch:** a per-user and global proaction off-switch; if acceptance craters, proaction defaults to silent (draft saved, not pushed). Spam is the failure mode with the highest trust cost — make stopping it one toggle.
- **Exit (value, not just function):** proposal acceptance clears a set bar for Muzamil + the 2 users; throttling demonstrably protects trust.

### Phase 4 — Publishing + the full WhatsApp surface
*Goal: drafts become posts; WhatsApp becomes primary.*
- **Publisher:** LinkedIn + X (direct API or via Make, already in the stack), always behind the approval gate, **idempotent** (no double-posts on retry).
- **Full channel adapter** over Meta Cloud API via the onboarded BSP: inbound webhook → orchestrator, outbound replies, approved **templates** for out-of-window/proactive, media (send drafts, receive voice notes/images), opt-in capture, WhatsApp-identity → client mapping.
- Web app demotes to **dashboard/settings**; WhatsApp is where the work happens.
- **Kill-switch / rollback:** Publisher is idempotent (idempotency key per draft → no double-post on Meta webhook retries) and has a hard off-switch; if the channel adapter fails, the orchestrator falls back to the web/email surface — WhatsApp is never the only way to reach the employee.
- **Exit:** Muzamil runs his whole content loop from WhatsApp, including a proactive morning proposal that publishes on approval.

### Phase 5 — Scale to the mission (50,000)
*Goal: 1 → 50k at a unit cost that holds.*
- Onboarding funnel; reactivate beyond the first 13.
- Load + cost testing; observability + tracing; **eval-in-prod sampling** (per-user quality monitoring); support runbooks.
- **Exit:** the funnel onboards a new user end-to-end with no manual steps, at a defensible cost-per-active-user.

---

## Sequencing rationale
- **Revenue first, on the smallest possible base.** Phase 0.5 is deliberately thin — just enough to bill the 13. The heavy substrate (Phase 0.7) builds *in parallel* with that billing, so a paying, instrumented cohort exists in weeks, not after a two-month foundation.
- **Substrate once, but not in the way of revenue.** The queue/memory/retrieval/policy/cost layer underpins Phases 2–4; build it deliberately in Phase 0.7 (parallel to Phase 1) or re-discover it three times.
- **Brain on web before phone.** The orchestrator is the hard part; the WhatsApp adapter is transport. Iterate the brain cheaply, then wrap it.
- **Validate the channel early, ship it late.** A Phase 3 thin slice de-risks the Meta/template bet months before the full surface.
- **BSP + Researcher in parallel from day one** — the two longest poles, one bureaucratic, one technical.

## Unit economics (the 50k question, sketched)
A daily proactive proposal ≈ research-summarize + plan + one final draft ≈ 30–60K tokens. At premium pricing that's roughly **$0.05–0.15/user/day → $1.50–4.50/user/month** in proaction tokens alone, before ingestion re-runs, retries, and multi-platform. At 50k that is **~$75k–225k/month of COGS** *if designed without discipline*. Two structural defenses, both designed in early: (1) the **model router** (premium only on the final draft), and (2) the **credit allowance** as a hard ceiling per tier. This is why cost moves to Phase 0/1, not Phase 3.

## Risk register — each with its cheapest de-risking experiment
| Risk | De-risk now (cheap) |
|---|---|
| Voice still feels generic | Phase 0 retrieval + human "sounds like me" rating from the 13 |
| Proaction is spam / burns tokens | Researcher spike: a "worth posting about" hook ≥3 of 5 days for Muzamil, manually triggered |
| WhatsApp is the wrong/over-constrained surface | Phase 3 Twilio-sandbox thin slice; keep email/web proactive in parallel |
| Cost is ruinous at scale | cost-per-draft metered from the first call; allowance ceiling |
| Eval gate is theater | deterministic hard scorers + judge self-consistency + ≥10 human-rated fixtures |
| In-process scheduler double-fires / drops | durable claimed queue (`SKIP LOCKED`), user-local buckets |

## Decisions still genuinely the owner's
- Build publishing/scheduling ourselves vs. lean on Make.com (already in the stack)?
- WhatsApp BSP: Twilio (fast, pricier) vs 360dialog / Meta-direct (cheaper, more setup)?
- Cheap-tier model for the router (Haiku vs DeepSeek vs Gemini Flash) — needs a quality/cost bake-off.
- Exact credit allowance per tier (sets the COGS ceiling).
