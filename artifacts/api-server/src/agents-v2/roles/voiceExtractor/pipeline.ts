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
      produced_by: "voice_extractor@0.2.0",
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
  "Extract FIRST-PERSON anecdotes where the USER is the protagonist — things that happened TO THEM or that THEY did. " +
  "CRITICAL: do NOT extract stories about other people the user is featuring, interviewing, or profiling. " +
  "Many users (especially podcasters, interviewers, community builders) write posts ABOUT other people — those guests' " +
  "stories are NOT the user's story bank. A story qualifies only if the user could retell it as 'something that happened " +
  "to me' or 'something I did/built/decided/learned'. Each story must cite ≥1 source_sample_id. Never invent. " +
  "If no genuine first-person stories surface, return an empty array — that is the correct answer for a user who mostly " +
  "writes about others.";

function renderStoryPrompt(input: VoiceExtractorInput): string {
  const stratified = stratifySamples(input.samples, 24);
  return [
    `Find redeployable FIRST-PERSON anecdotes where the user is the protagonist.`,
    ``,
    `INCLUDE (the user is the subject):`,
    `  - "I built / I launched / I decided / I learned / I failed at / when I was at X..."`,
    `  - A turning point, a hard call, a lesson the user personally lived`,
    `  - The user's own origin, struggle, or milestone`,
    ``,
    `EXCLUDE (someone else is the subject):`,
    `  - "A founder overcame X" / "Wali transitioned to Y" / "my guest did Z"`,
    `  - Anything where the user is the narrator/host but NOT the protagonist`,
    `  - Profiles, features, interview recaps, congratulations to others`,
    ``,
    `Decision test: would the user say "this is MY story" or "this is THEIR story I shared"?`,
    `Only the former belongs in the story bank.`,
    ``,
    `Samples:`,
    ...stratified.map((s) => `[sample ${s.id}]\n${truncate(s.content, 800)}`),
  ].join("\n");
}

const REFERENCE_PASS_SYSTEM =
  "Extract the user's RECURRING INTELLECTUAL ANCHORS — people, books, frameworks, events, companies, and concepts the " +
  "user cites REPEATEDLY as part of how they think. Quality over quantity. " +
  "CRITICAL EXCLUSIONS: (1) never include the user's OWN name or company; (2) exclude one-off name-drops, congratulations, " +
  "tags, and people merely featured/interviewed once — a reference qualifies only if it appears across MULTIPLE samples OR " +
  "is clearly a load-bearing influence on the user's thinking; (3) exclude generic company mentions that are just part of a " +
  "person's bio. Each reference must cite ≥1 source_sample_id. Prefer 5-12 high-signal references over 30 noisy ones. " +
  "Never invent.";

function renderReferencePrompt(input: VoiceExtractorInput): string {
  const stratified = stratifySamples(input.samples, 30);
  const selfName = input.identity_full_name ?? null;
  return [
    `Find the user's RECURRING intellectual anchors — references they return to as part of how they think.`,
    ``,
    `INCLUDE only references that are EITHER:`,
    `  - cited across 2+ different samples, OR`,
    `  - a clearly load-bearing influence (a framework/thinker the user builds arguments on)`,
    ``,
    `EXCLUDE:`,
    selfName ? `  - the user themselves ("${selfName}") and their own companies` : `  - the user's own name and companies`,
    `  - one-off name-drops, tags, congratulations, "great chat with X" mentions`,
    `  - guests featured once with no recurring intellectual role`,
    `  - companies named only as part of someone's job title/bio`,
    ``,
    `Aim for 5-12 high-signal references, not an exhaustive roster. If a name appears once in passing, leave it out.`,
    ``,
    `Samples:`,
    ...stratified.map((s) => `[sample ${s.id}]\n${truncate(s.content, 500)}`),
  ].join("\n");
}

const WORLDVIEW_PASS_SYSTEM =
  "Identify the user's DEEP, non-negotiable beliefs — the convictions that sit UNDERNEATH their posts and explain WHY they " +
  "keep returning to certain topics. Go past the surface subject matter to the underlying thesis. " +
  "A worldview belief is NOT a topic the user posts about ('sales is hard in Pakistan'). It is a load-bearing conviction " +
  "about how the world works that would still be true even if they changed industries ('narrative and distribution are the " +
  "real moat as execution gets commoditized'; 'talent is everywhere, opportunity is not'; 'you earn the right to be loud by " +
  "building in silence first'). " +
  "Look for the belief BEHIND the topic: if they post repeatedly about Pakistani talent, the belief might be 'world-class " +
  "talent is mislocated, not absent.' Extract 3-7 of these. Each MUST cite evidence_sample_ids spanning MULTIPLE samples. " +
  "If a 'belief' only shows up in one post, it is a topic, not a worldview — drop it.";

function renderWorldviewPrompt(input: VoiceExtractorInput): string {
  // Wider stratified pull so beliefs are validated across the whole corpus,
  // not just recent posts (which skew topical).
  const stratified = stratifySamples(input.samples, 32);
  return [
    `Identify the user's DEEP worldview — the convictions underneath their posts, not the topics on the surface.`,
    ``,
    `Method:`,
    `  1. Notice which topics recur across many samples.`,
    `  2. For each cluster, ask: what does the user BELIEVE that makes them keep returning to this?`,
    `  3. State that underlying belief — the one that would survive even if they changed fields.`,
    ``,
    `Surface topic → underlying belief (examples of the depth required):`,
    `  "posts about local talent" → "world-class talent is mislocated, not absent"`,
    `  "posts about consistency/showing up" → "compounding in public beats sporadic brilliance"`,
    `  "posts about AI tools" → "as software commoditizes, narrative and taste become the moat"`,
    ``,
    `For each belief:`,
    `  claim: the deep conviction (not the topic)`,
    `  why_held: the reasoning visible across the samples`,
    `  where_it_shows_up: the topics/contexts this belief surfaces in`,
    `  evidence_sample_ids: MULTIPLE samples — a real belief recurs; a one-post idea is a topic, not a worldview`,
    ``,
    `Drop anything that appears in only one sample. Extract 3-7 deep beliefs.`,
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
