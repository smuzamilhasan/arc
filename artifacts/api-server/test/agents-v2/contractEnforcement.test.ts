// Contract enforcement smoke tests for the v2 agent framework.
//
// These tests verify the FRAMEWORK invariants, not the LLM. We inject a
// scripted StructuredLLMClient so we can produce specific outputs and verify
// the AgentRunner enforces:
//   1. Input schema validation rejects bad inputs as contract_violation
//   2. Output schema validation rejects malformed outputs
//   3. assert_no_violations rejects semantically invalid outputs
//   4. Refusal outputs surface as kind="refused"
//   5. Successful outputs return kind="ok" with typed data
//
// We test against the Ghostwriter contract because it has the richest
// assert_no_violations rules (sample-id citation, body length, negative space,
// confidence floor).

import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

import { AgentRunner } from "../../src/agents-v2/runner/agentRunner";
import type { StructuredLLMClient } from "../../src/agents-v2/runner/agentRunner";
import { ghostwriterContract } from "../../src/agents-v2/roles/ghostwriter";
import type { GhostwriterInput } from "../../src/agents-v2/roles/ghostwriter";
import type { ContentDraft } from "../../src/agents-v2/contracts/outputs";

// ---------- Scripted LLM ----------

class ScriptedLLM implements StructuredLLMClient {
  constructor(private readonly response: unknown) {}
  async generate<O>(args: {
    output_schema: z.ZodSchema<O>;
    system_prompt: string;
    model: string;
    temperature: number;
  }): Promise<{ output: O; tokens_used: number; latency_ms: number }> {
    // Don't try to validate here — the runner will validate. We return the
    // raw response so we can test what happens when it's malformed.
    return { output: this.response as O, tokens_used: 100, latency_ms: 50 };
  }
}

// ---------- Fixture ----------

const VALID_INPUT: GhostwriterInput = {
  client_id: 1,
  brief: "How AI commoditizes software and why narrative becomes the moat.",
  platform: "linkedin",
  format: "post",
  identity: {
    full_name: "Test User",
    headline: "Building the engine",
  },
  positioning: {
    claim: "Narrative is the moat as software commoditizes.",
    adjacent_claims_rejected: ["AI-everything", "growth-hack everything"],
    proof_points: [{ kind: "talk", label: "Thought Behind Things" }],
  },
  voice: {
    description: "Calm, declarative, short sentences with em-dashes.",
    confidence: 0.75,
    sample_count: 50,
    sentence_stats: { avg_len: 14, p90_len: 22, declarative_ratio: 0.8, question_ratio: 0.08 },
    lexicon: { signature_words: ["narrative", "arc", "wedge"], avoided_words: [], banned_phrases: ["10x"] },
    signature_moves: [{ pattern: "opens with contrarian framing", frequency: 0.4 }],
  },
  voice_samples: [
    { sample_id: 101, platform: "linkedin", excerpt: "Software is getting commoditized..." },
    { sample_id: 102, platform: "linkedin", excerpt: "The moat moved to the people who tell the story..." },
  ],
  stories: [
    { story_id: 7, summary: "TBT interview that shifted the framing", themes: ["narrative"], last_used_at: null },
  ],
  references: [{ reference_id: 3, kind: "person", label: "Ben Thompson" }],
  negative_space: {
    refused_topics: ["politics"],
    refused_words: ["leverage", "guru"],
    refused_takes: ["AI will replace humans wholesale"],
    refused_formats: ["engagement-bait hook"],
  },
  anti_examples: [],
};

// ---------- Tests ----------

describe("AgentRunner contract enforcement (Ghostwriter)", () => {
  it("returns 'ok' for a well-formed draft citing a real sample_id", async () => {
    const goodDraft: ContentDraft = {
      refuses: false,
      platform: "linkedin",
      body: "Software is getting commoditized — the moat moved to those who can tell the story. Build in silence, arrive loud.",
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 101 }],
        story_anchor: { kind: "story_bank", story_id: 7 },
        reference_anchors: [{ kind: "reference_library", reference_id: 3 }],
      },
      honors_negative_space: true,
      confidence: 0.7,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(goodDraft) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.output.refuses).toBe(false);
    }
  });

  it("returns 'refused' when the agent emits a refusal", async () => {
    const refusal: ContentDraft = {
      refuses: true,
      refusal_reason: "Voice confidence too low for confident draft.",
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(refusal) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") {
      expect(result.reason).toMatch(/voice confidence/i);
    }
  });

  it("returns 'contract_violation' when style_anchors cite a sample_id not in input", async () => {
    const badDraft: ContentDraft = {
      refuses: false,
      platform: "linkedin",
      body: "Plausible looking draft.",
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 9999 }], // not in input
        reference_anchors: [],
      },
      honors_negative_space: true,
      confidence: 0.6,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(badDraft) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/sample_id=9999/);
    }
  });

  it("returns 'contract_violation' when the body contains a refused word", async () => {
    const bodyWithRefused: ContentDraft = {
      refuses: false,
      platform: "linkedin",
      body: "We need to leverage the new wave — this is a paradigm shift.",
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 101 }],
        reference_anchors: [],
      },
      honors_negative_space: true, // agent claims true but…
      confidence: 0.6,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(bodyWithRefused) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/refused word: "leverage"/);
    }
  });

  it("returns 'contract_violation' when the body contains a banned phrase", async () => {
    const bodyWithBanned: ContentDraft = {
      refuses: false,
      platform: "linkedin",
      body: "We 10x'd our reach last quarter and the team is unstoppable.",
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 101 }],
        reference_anchors: [],
      },
      honors_negative_space: true,
      confidence: 0.6,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(bodyWithBanned) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/banned phrase: "10x"/);
    }
  });

  it("returns 'contract_violation' when body exceeds the platform char cap", async () => {
    const tooLong: ContentDraft = {
      refuses: false,
      platform: "x",
      body: "x".repeat(500),
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 101 }],
        reference_anchors: [],
      },
      honors_negative_space: true,
      confidence: 0.6,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(tooLong) });
    const result = await runner.run({ ...VALID_INPUT, platform: "x" });
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/exceeds platform cap/);
    }
  });

  it("returns 'contract_violation' when high confidence is claimed under voice floor", async () => {
    const lowVoice = { ...VALID_INPUT, voice: { ...VALID_INPUT.voice!, confidence: 0.2 } };
    const overConfident: ContentDraft = {
      refuses: false,
      platform: "linkedin",
      body: "A reasonable-sounding draft.",
      voice_evidence: {
        style_anchors: [{ kind: "voice_sample", sample_id: 101 }],
        reference_anchors: [],
      },
      honors_negative_space: true,
      confidence: 0.85,
    };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(overConfident) });
    const result = await runner.run(lowVoice);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/below platform floor/);
    }
  });

  it("returns 'contract_violation' when the input itself is malformed", async () => {
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM({}) });
    const result = await runner.run({ client_id: "not-a-number" } as unknown as GhostwriterInput);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/Input failed schema/);
    }
  });

  it("returns 'contract_violation' when the LLM output fails schema validation", async () => {
    const malformed = { not: "a valid content draft" };
    const runner = new AgentRunner(ghostwriterContract, { llm: new ScriptedLLM(malformed) });
    const result = await runner.run(VALID_INPUT);
    expect(result.kind).toBe("contract_violation");
    if (result.kind === "contract_violation") {
      expect(result.details).toMatch(/Output failed schema/);
    }
  });
});
