# agents-v2/llm

Concrete implementations of the `StructuredLLMClient` interface from the v2 runner.

## OpenAIStructuredClient

Uses the workspace's `@workspace/integrations-openai-ai-server` package (which already provides a configured `openai` client tied to `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL`).

### Why Zod 4 → JSON Schema manually

`openai/helpers/zod` is pinned to Zod 3. The codebase standardized on Zod 4 (`zod/v4`). We convert via `z.toJSONSchema(schema, { target: "draft-7" })` instead — it produces output compatible with OpenAI's strict structured-output mode.

### Defense in depth

The model output is:
1. Constrained at generation by OpenAI's strict structured-output mode (provider-side).
2. Re-validated against the original Zod schema after parsing (client-side).

Either layer alone is insufficient; both together catch every malformed output we've seen in practice.

### Errors surfaced

- `OpenAIAdapterError("OpenAI returned no content")` — provider hiccup
- `OpenAIAdapterError("OpenAI response truncated by token limit")` — `finish_reason === "length"`; bump `max_tokens` in the contract or break the agent's work into smaller calls
- `OpenAIAdapterError("...non-JSON...")` — provider violated structured-output contract; usually transient
- `OpenAIAdapterError("...failed Zod re-validation...")` — schema mismatch; either a Zod 4 feature `z.toJSONSchema` can't express or a provider bug

The `AgentRunner` converts adapter errors into `contract_violation` results, so the caller never receives a malformed agent output.

### Required env

Both already set in the existing api-server (used by v1 services):

```
AI_INTEGRATIONS_OPENAI_API_KEY=
AI_INTEGRATIONS_OPENAI_BASE_URL=
```

No new env vars introduced by v2.
