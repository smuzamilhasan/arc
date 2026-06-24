# PRD — Agent contracts framework

## Problem

v1 agents share one massive context blob, drift between roles (Strategist drafts content, Ghostwriter changes positioning), produce free-text outputs that the next agent re-parses, and have no enforcement of role boundaries beyond hoping the LLM stays in lane.

## Outcome

Every agent declares:
- A typed **input schema** (what context slice it needs)
- A typed **output schema** (what it produces)
- A **role contract** (job, allowed actions, forbidden actions, escalation rules)
- A **rubric reference** (the eval contract for its outputs)

A central **context curator** is the only path to context. A central **agent runner** wraps each call with contract validation pre-/post-.

## Components

### 1. `RoleContract<I, O>`

```ts
interface RoleContract<I, O> {
  name: AgentRole;
  job: string;                       // one sentence
  allowed_actions: string[];
  forbidden_actions: string[];
  escalates_to?: AgentRole;          // when forbidden, where does work go?
  input_schema: ZodSchema<I>;
  output_schema: ZodSchema<O>;
  rubric: RubricRef;
  system_prompt: (ctx: I) => string;
  refusal_reasons: string[];         // valid reasons to emit `refuses: true`
}
```

### 2. `ContextCurator`

Deterministic, no LLM.

```ts
class ContextCurator {
  static for<R extends AgentRole>(role: R, userId: number): InputFor<R>;
}
```

Each role registers what it needs via `ContextRequirement[]`. Curator pulls only that. Cacheable per (role, userId, profile_version).

### 3. `AgentRunner`

```ts
class AgentRunner<I, O> {
  constructor(private contract: RoleContract<I, O>) {}

  async run(input: I, opts?: RunOptions): Promise<AgentResult<O>>;
}

type AgentResult<O> =
  | { kind: 'ok'; output: O; rubric_score?: RubricScore }
  | { kind: 'refused'; reason: string }
  | { kind: 'contract_violation'; details: string };
```

Runner:
1. Validates `input` against `input_schema`
2. Builds prompt via `system_prompt(ctx)`
3. Calls LLM with structured-output enforcement
4. Validates output against `output_schema`
5. Checks output for contract violations (e.g. Ghostwriter output editing positioning)
6. (Optional) runs evaluator agent for rubric score
7. Returns typed `AgentResult`

### 4. Role registry

```ts
export const roles = {
  strategist: StrategistContract,
  ghostwriter: GhostwriterContract,
  narrative: NarrativeContract,
  planner: PlannerContract,
  manager: ManagerContract,
  investigator: InvestigatorContract,
  onboarder: OnboarderContract,
  voice_extractor: VoiceExtractorContract,
  evaluator: EvaluatorContract,
};
```

Each contract lives in its own file under `agents-v2/roles/`.

## Forbidden-action enforcement

Two layers:

1. **Output schema** — Planner output is `CalendarOp[]`; there is no string field for "draft." Type system makes drafting impossible at compile time.
2. **Runtime checker** — for actions not encodable in types (e.g. "didn't cite voice evidence"), runner runs a post-condition function on the output. Failure → `contract_violation`.

## Acceptance

- `RoleContract`, `ContextCurator`, `AgentRunner` exist with full types
- One reference implementation (Onboarder) end-to-end runnable on the fixture profiles
- v1 services untouched
- Tests: contract validation rejects bad inputs / outputs

## Out of scope

- Migrating v1 agents (per-agent migration tracked separately)
- Eval rubrics (eval harness PRD)
