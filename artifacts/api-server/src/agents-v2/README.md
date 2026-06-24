# agents-v2

The v2 agent framework. Foundation only — concrete agents land in follow-up PRs.

## Structure

```
agents-v2/
├── contracts/
│   ├── types.ts            # AgentResult, ContextKey/Requirement, EvidenceRef, AgentRole
│   ├── roleContract.ts     # RoleContract<TInput, TOutput> + header renderer
│   ├── profilePatch.ts     # Typed ProfilePatch operations (the only mutation surface)
│   └── outputs.ts          # Per-agent output schemas (StrategyProposal, ContentDraft, …)
├── curator/
│   └── contextCurator.ts   # Deterministic per-agent context shaping (no LLM)
├── runner/
│   └── agentRunner.ts      # Wraps every LLM call with contract enforcement
├── roles/
│   └── registry.ts         # AgentRole → RoleContract map
└── index.ts
```

## The contract is the agent

Every v2 agent is defined by a `RoleContract<TInput, TOutput>` declaring:

- `job` — one sentence
- `allowed_actions` / `forbidden_actions` — role lock
- `input_schema` / `output_schema` — typed I/O
- `context_requirements` — what slices of profile context the curator supplies
- `system_prompt(input)` — pure function building the prompt
- `refusal_reasons` — when the agent is expected to refuse
- `assert_no_violations(output, input)` — post-output semantic checks
- `default_model` / `default_temperature`

The implementation (how the LLM call works, which provider) is not part of the contract.

## Role-lock is enforced, not hoped for

Two layers:

1. **Type system.** Planner output is `CalendarOp[]`; it literally cannot contain prose. Ghostwriter cannot include a `ProfilePatch` because its `output_schema` does not allow one.
2. **Runtime semantic checks.** For invariants the type system can't encode — "ContentDraft must cite ≥1 voice_evidence anchor," "StrategyProposal evidence must reference ≥1 profile slot" — the contract supplies `assert_no_violations`. The runner rejects outputs that fail.

## Refusal is a first-class outcome

`AgentResult<O>` is `{ kind: 'ok' | 'refused' | 'contract_violation' }`. Refusal is not failure — it is a high-quality outcome when signal is thin. Agents are prompted with explicit `refusal_reasons` and rewarded for using them.

## Context curation is deterministic

`ContextCurator` is a switch statement. No LLM. Each agent declares the keys it needs; the curator returns only those, with size limits. Same input → same output. When generic output appears, you can diff the exact context blob across runs.

## Migration from v1

v2 agents land **alongside** v1 services, behind feature flags. Each migration step:

1. New agent class + contract registered
2. Eval harness runs v1 + v2 across fixtures
3. v2 must beat v1 on its rubric by ≥ 20% before flag flip
4. Internal flip (Muzamil) → paused-user flip → v1 deletion after 30d stable

See `docs/v2/architecture.md` for the per-agent migration order.
