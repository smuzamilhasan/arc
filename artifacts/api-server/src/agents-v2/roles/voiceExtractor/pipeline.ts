// VoiceExtractor pipeline — orchestrates the 5-pass extraction described in
// docs/v2/prds/voice-extraction.md.
//
//   Pass 0: deterministic pass (sentence stats, lexicon, punctuation)
//   Pass 1: LLM — signature moves + voice description (informed by pass 0)
//   Pass 2: LLM — story bank candidates
//   Pass 3: LLM — reference library candidates
//   Pass 4: LLM — worldview hypotheses
//
// Each LLM pass returns structured output. The pipeline merges them into a
// single ProfilePatch and confidence score.
//
// The pipeline is invoked by a RUN HARNESS (not by AgentRunner directly), since
// it composes multiple LLM calls. The agent's `system_prompt` covers pass 1
// only; passes 2-4 use their own sub-prompts here.

import { z } from "zod/v4";
import type { StructuredLLMClient } from "../../runner/agentRunner";
import { voiceExtractorContract } from "./contract";
import { extractDeterministicVoice } from "./deterministicPass";
import type { ProfilePatchOp } from "../../contracts/profilePatch";
import type { VoiceExtractorInput } from "./contract";
import type { VoiceExtractorOutput } from "../../contracts/outputs";

const MIN_SAMPLES = 10;
const DEFAULT_MODEL = "gpt-4o-2024-08-06";

// ---------- Pass 1 schema: voice features ----------
const voiceFeaturesPassSchema = z.object({
  signature_moves: z
    .array(
      z.object({
        pattern: z.string(),
        frequency: z.number().min(0).max(1),
        examples_sample_ids: z.array(z.number().int()).default([]),
      })
    )
    .default([]),
  formality: z.number().min(0).max(1),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

// ---------- Pass 2 schema: story candidates ----------
const storyCandidatesPassSchema = z.object({
  stories: z
    .array(
      z.object({
        summary: z.string().min(1),
        body: z.string().min(1),
        themes: z.array(z.string()).default([]),
        source_sample_ids: z.array(z.number().int()).min(1),
      })
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});

// ---------- Pass 3 schema: reference candidates ----------
const referenceCandidatesPassSchema = z.object({
  references: z
    .array(
      z.object({
        kind: z.enum(["person", "book", "framework", "event", "company", "concept"]),
        label: z.string().min(1),
        context: z.string().default(""),
        source_sample_ids: z.array(z.number().int()).min(1),
      })
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});

// ---------- Pass 4 schema: worldview hypotheses ----------
const worldviewHypothesesPassSchema = z.object({
  beliefs: z
    .array(
      z.object({
        claim: z.string(),
        why_held: z.string(),
        where_it_shows_up: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1),
        evidence_sample_ids: z.array(z.number().int()).default([]),
      })
    )
    .default([]),
});

export type RunVoiceExtractorDeps = {
  llm: StructuredLLMClient;
};

export async function runVoiceExtractor(
  input: VoiceExtractorInput,
  deps: RunVoiceExtractorDeps
): Promise<VoiceExtractorOutput> {
  // Refuse on thin samples — contract refusal_reason #1.
  if (input.samples.length < MIN_SAMPLES) {
    return {
      refuses: true,
      refusal_reason: `Only ${input.samples.length} voice samples available; need ≥ ${MIN_SAMPLES} for confident extraction.`,
    };
  }

  // Pass 0: deterministic.
  const det = extractDeterministicVoice(input.samples);

  // Pass 1: voice features.
  const voiceFeatures = await deps.llm.generate({
    system_prompt: voiceExtractorContract.system_prompt(input),
    user_prompt: renderVoiceFeaturesPrompt(input, det),
    output_schema: voiceFeaturesPassSchema,
    model: DEFAULT_MODEL,
    temperature: 0.2,
  });

  // Pass 2: stories.
  const stories = await deps.llm.generate({
    system_prompt: STORY_PASS_SYSTEM,
    user_prompt: renderStoryPrompt(input),
    output_schema: storyCandidatesPassSchema,
    model: DEFAULT_MODEL,
    temperature: 0.3,
  });

  // Pass 3: references.
  const references = await deps.llm.generate({
    system_prompt: REFERENCE_PASS_SYSTEM,
    user_prompt: renderReferencePrompt(input),
    output_schema: referenceCandidatesPassSchema,
    model: DEFAULT_MODEL,
    temperature: 0.1,
  });

  // Pass 4: worldview.
  const worldview = await deps.llm.generate({
    system_prompt: WORLDVIEW_PASS_SYSTEM,
    user_prompt: renderWorldviewPrompt(input),
    output_schema: worldviewHypothesesPassSchema,
    model: DEFAULT_MODEL,
    temperature: 0.2,
  });

  // Merge into ProfilePatch.
  const ops: ProfilePatchOp[] = [];

  ops.push({
    op: "voice_patch",
    rationale: `Voice features from ${input.samples.length} samples (deterministic + LLM pass)`,
    patch: {
      sentence_stats: det.sentence_stats,
      lexicon: {
        signature_words: det.lexicon.signature_words,
        avoided_words: det.lexicon.avoided_words,
        banned_phrases: [],
      },
      punctuation: det.punctuation,
      signature_moves: voiceFeatures.output.signature_moves,
      formality: voiceFeatures.output.formality,
      description: voiceFeatures.output.description,
      confidence: voiceFeatures.output.confidence,
      sample_count: input.samples.length,
    },
  });

  for (const s of stories.output.stories) {
    ops.push({
      op: "story_append",
      summary: s.summary,
      body: s.body,
      themes: s.themes,
      source_sample_ids: s.source_sample_ids,
      status: "candidate",
    });
  }

  for (const r of references.output.references) {
    ops.push({
      op: "reference_append",
      kind: r.kind,
      label: r.label,
      context: r.context,
      source_sample_ids: r.source_sample_ids,
      status: "candidate",
    });
  }

  if (worldview.output.beliefs.length > 0) {
    ops.push({
      op: "worldview_patch",
      rationale: `${worldview.output.beliefs.length} worldview hypotheses extracted from samples; surface to user for confirmation during onboarding`,
      patch: { beliefs: worldview.output.beliefs },
    });
  }

  const aggregate = avg([
    voiceFeatures.output.confidence,
    stories.output.confidence,
    references.output.confidence,
  ]);

  return {
    refuses: false,
    profile_patch: {
      client_id: input.client_id,
      ops,
      confidence: aggregate,
      produced_by: "voice_extractor@0.1.0",
    },
    sample_count: input.samples.length,
    confidence: aggregate,
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---------- Prompt builders ----------

function renderVoiceFeaturesPrompt(
  input: VoiceExtractorInput,
  det: ReturnType<typeof extractDeterministicVoice>
): string {
  const stratified = stratifySamples(input.samples, 20);
  return [
    `Deterministic stats over ${input.samples.length} samples:`,
    `  avg sentence length: ${det.sentence_stats.avg_len.toFixed(1)} words`,
    `  p90 sentence length: ${det.sentence_stats.p90_len}`,
    `  question rate: ${(det.sentence_stats.question_ratio * 100).toFixed(0)}%`,
    `  signature words: ${det.lexicon.signature_words.slice(0, 15).join(", ")}`,
    `  em-dash density: ${det.punctuation.em_dash_density.toFixed(4)} per word`,
    ``,
    `Stratified samples (${stratified.length} of ${input.samples.length}):`,
    ``,
    ...stratified.map((s) => `[sample ${s.id}] (${s.platform ?? "unknown"})\n${truncate(s.content, 600)}`),
    ``,
    `Extract:`,
    `  signature_moves: structural patterns observed across multiple samples`,
    `  formality (0..1): 0=raw conversational, 1=published essay`,
    `  description: 2-3 sentences describing the voice using observable patterns only`,
    `  confidence: your aggregate confidence in these extractions`,
  ].join("\n");
}

const STORY_PASS_SYSTEM =
  "Extract anecdotes the user has actually told in their samples. Each story must cite ≥1 source_sample_id. Never invent. If no real stories surface, return an empty array.";

function renderStoryPrompt(input: VoiceExtractorInput): string {
  const stratified = stratifySamples(input.samples, 20);
  return [
    `Find redeployable anecdotes the user has told in these samples. Look for:`,
    `  - "I once..." / "When I was at X..." / "A founder told me..."`,
    `  - Concrete numbers, places, people, moments`,
    `  - Things you can imagine the user telling again in a different post`,
    ``,
    `Samples:`,
    ...stratified.map((s) => `[sample ${s.id}]\n${truncate(s.content, 800)}`),
  ].join("\n");
}

const REFERENCE_PASS_SYSTEM =
  "Extract people, books, frameworks, events, companies, and concepts the user has cited. Each must cite ≥1 source_sample_id. Never invent references.";

function renderReferencePrompt(input: VoiceExtractorInput): string {
  const stratified = stratifySamples(input.samples, 30);
  return [
    `Find named references the user actually cites in their samples (people, books, frameworks, events, companies, concepts).`,
    ``,
    `Samples:`,
    ...stratified.map((s) => `[sample ${s.id}]\n${truncate(s.content, 500)}`),
  ].join("\n");
}

const WORLDVIEW_PASS_SYSTEM =
  "Identify the 3-7 non-negotiable beliefs visible across the samples. Beliefs are claims about how the world works that recur. Each belief MUST cite evidence_sample_ids. If fewer than 3 strong beliefs surface, return an empty array.";

function renderWorldviewPrompt(input: VoiceExtractorInput): string {
  const stratified = stratifySamples(input.samples, 25);
  return [
    `Identify the non-negotiable beliefs the user holds — claims about how their world works that recur across samples.`,
    ``,
    `For each belief:`,
    `  claim: short statement`,
    `  why_held: 1 sentence on the reasoning visible in the samples`,
    `  where_it_shows_up: topics/contexts this belief appears in`,
    `  evidence_sample_ids: which samples support this`,
    ``,
    `Samples:`,
    ...stratified.map((s) => `[sample ${s.id}]\n${truncate(s.content, 500)}`),
  ].join("\n");
}

// ---------- Helpers ----------

function stratifySamples<T extends { id: number; content: string }>(samples: T[], target: number): T[] {
  if (samples.length <= target) return samples;
  // Stratified sample by index — even spacing across the corpus so we don't
  // over-index on one period.
  const step = samples.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    out.push(samples[Math.floor(i * step)]!);
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + " …";
}
