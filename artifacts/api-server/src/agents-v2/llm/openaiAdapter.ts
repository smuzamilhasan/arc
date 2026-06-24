// OpenAI implementation of StructuredLLMClient.
//
// Uses the OpenAI Chat Completions API with `response_format: json_schema` for
// structured output enforcement. We convert our Zod 4 schemas to JSON Schema
// via `z.toJSONSchema(schema)` because openai/helpers/zod is pinned to Zod 3
// and the codebase standardized on Zod 4.
//
// The adapter re-validates the model's JSON response against the original Zod
// schema — defense in depth, since OpenAI's structured-output enforcement is
// strong but not perfect.

import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod/v4";
import type { StructuredLLMClient } from "../runner/agentRunner";

export type OpenAIAdapterOptions = {
  /** Override the default model id used when callers don't specify one. */
  defaultModel?: string;
};

const DEFAULT_MODEL = "gpt-4o-2024-08-06";

export class OpenAIStructuredClient implements StructuredLLMClient {
  constructor(private readonly options: OpenAIAdapterOptions = {}) {}

  async generate<O>(args: {
    system_prompt: string;
    user_prompt?: string;
    output_schema: z.ZodSchema<O>;
    model: string;
    temperature: number;
    max_tokens?: number;
  }): Promise<{ output: O; tokens_used: number; latency_ms: number }> {
    const t0 = Date.now();

    // Zod 4 → JSON Schema (subset OpenAI accepts).
    const jsonSchema = toJsonSchemaForOpenAI(args.output_schema);

    const model = args.model || this.options.defaultModel || DEFAULT_MODEL;

    const completion = await openai.chat.completions.create({
      model,
      temperature: args.temperature,
      max_completion_tokens: args.max_tokens,
      messages: [
        { role: "system", content: args.system_prompt },
        ...(args.user_prompt ? [{ role: "user" as const, content: args.user_prompt }] : []),
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "agent_output",
          strict: true,
          schema: jsonSchema,
        },
      },
    });

    const latency_ms = Date.now() - t0;
    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new OpenAIAdapterError("OpenAI returned no content");
    }
    if (choice?.finish_reason === "length") {
      throw new OpenAIAdapterError("OpenAI response truncated by token limit");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (err) {
      throw new OpenAIAdapterError(
        `OpenAI returned non-JSON despite json_schema response_format: ${(err as Error).message}`
      );
    }

    // Re-validate with Zod for defense in depth.
    const parsed = args.output_schema.safeParse(raw);
    if (!parsed.success) {
      throw new OpenAIAdapterError(
        `OpenAI output failed Zod re-validation: ${parsed.error.message}`
      );
    }

    const tokens_used =
      (completion.usage?.prompt_tokens ?? 0) + (completion.usage?.completion_tokens ?? 0);

    return { output: parsed.data, tokens_used, latency_ms };
  }
}

/**
 * Build a JSON Schema acceptable to OpenAI's strict structured-output mode.
 * OpenAI's strict mode requires `additionalProperties: false` and `required`
 * on every object — `z.toJSONSchema` produces compatible output for `strict`.
 */
function toJsonSchemaForOpenAI(schema: z.ZodSchema<unknown>): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    reused: "inline",
  }) as Record<string, unknown>;
}

export class OpenAIAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIAdapterError";
  }
}

/** Singleton instance for the common case. */
export const openaiStructuredClient = new OpenAIStructuredClient();
