// Onboarder — adaptive conversational profile-filler.
//
// Each turn is a single RoleContract invocation. The orchestrator
// (OnboardingSessionService) holds conversation state across turns; the agent
// itself is stateless and pure.
//
// Per turn:
//   input:  current profile, conversation log, last user answer (if any),
//           current slot focus (chosen by playbook), extractor snapshot
//   output: OnboarderTurn — discriminated union: question | patch | wrap

import { z } from "zod/v4";
import type { RoleContract } from "../../contracts/roleContract";
import { onboarderTurnSchema, type OnboarderTurn } from "../../contracts/outputs";
import type { SlotKey } from "./playbook";

// ---------- Input ----------

const logEntrySchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("agent"),
    kind: z.enum(["question", "patch", "wrap"]),
    target_slot: z.string().optional(),
    prompt_text: z.string().optional(),
  }),
  z.object({
    role: z.literal("user"),
    text: z.string(),
  }),
]);

export const onboarderInputSchema = z.object({
  client_id: z.number().int(),

  // The slot the playbook says to work on this turn. Agent SHOULD ask about
  // this slot unless the last user answer requires a drill.
  current_slot: z.object({
    slot: z.string(),
    rationale: z.string(),
    turns_spent_on_this_slot: z.number().int().nonnegative(),
    current_confidence: z.number().min(0).max(1),
  }),

  // Existing profile context — what's already known.
  profile_snapshot: z.object({
    identity: z
      .object({
        full_name: z.string(),
        headline: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    positioning: z.unknown().nullable().optional(),
    icp: z.unknown().nullable().optional(),
    voice: z.unknown().nullable().optional(),
    worldview: z.unknown().nullable().optional(),
    negative_space: z.unknown().nullable().optional(),
  }),

  // Pre-populated candidates from voice extraction. These are how the agent
  // opens "informed" instead of asking from a blank page.
  extractor_snapshot: z
    .object({
      voice_description: z.string().nullable().optional(),
      signature_words: z.array(z.string()).default([]),
      story_candidates: z
        .array(z.object({ id: z.number().int(), summary: z.string() }))
        .default([]),
      reference_candidates: z
        .array(z.object({ id: z.number().int(), label: z.string(), kind: z.string() }))
        .default([]),
      worldview_hypotheses: z
        .array(z.object({ claim: z.string(), confidence: z.number() }))
        .default([]),
    })
    .nullable()
    .optional(),

  // Recent conversation log — capped to last 12 entries so the prompt stays small.
  conversation_log: z.array(logEntrySchema).default([]),

  // The user's most recent answer, if any. May be empty on the opening turn.
  last_user_answer: z.string().nullable().optional(),

  // Turn mode, set by the orchestrator:
  //   "ask"     → produce the next QUESTION for current_slot (or wrap if done)
  //   "capture" → the user just answered; produce a PATCH capturing it into
  //               current_slot. Only re-ask (question) if the answer is truly
  //               empty of signal. Never wrap in capture mode.
  // Defaulting to "ask" preserves the opening-turn behavior.
  mode: z.enum(["ask", "capture"]).default("ask"),
});
export type OnboarderInput = z.infer<typeof onboarderInputSchema>;

// ---------- Contract ----------

export const onboarderContract: RoleContract<OnboarderInput, OnboarderTurn> = {
  name: "onboarder",
  job: "Fill the structured profile by adaptive conversation, drilling into vague answers and stopping when leverage flattens.",
  version: "0.1.0",

  allowed_actions: [
    "Ask one question per turn, grounded in the current_slot focus or a drill on the last answer",
    "Emit a profile_patch when the last answer carries enough signal to update a slot",
    "Open with a 'confirm' question when extractor_snapshot has high-confidence pre-fill",
    "Emit a 'wrap' turn with reason='user_paused' if the user explicitly asks to stop",
    "Surface a previously-given answer back to the user when verifying contradictions",
  ],
  forbidden_actions: [
    "Ask about a slot other than current_slot, unless you are drilling on the last user answer",
    "Draft content for the user, suggest posts, or propose strategy",
    "Emit a wrap turn unless the orchestrator passes a stop signal in the current_slot rationale",
    "Mass-update multiple unrelated slots in a single patch",
    "Confidently fill a slot from a vague or contradictory answer",
  ],
  escalates_to: "strategist",

  input_schema: onboarderInputSchema,
  output_schema: onboarderTurnSchema,

  context_requirements: [], // Onboarder receives everything in input; the session service builds context, not the curator

  refusal_reasons: [
    "Last user answer is contradictory to previously-given answer; verify needed",
    "Slot already saturated above confidence target (caller should advance)",
    "User indicated pause/stop in last answer",
  ],

  default_model: "gpt-4o-2024-08-06",
  default_temperature: 0.4,
  enforce_structured_output: true,

  system_prompt: (input) => {
    const header = [
      `You are filling slot \`${input.current_slot.slot}\` for client ${input.client_id}.`,
      `Slot rationale: ${input.current_slot.rationale}`,
      `Current confidence on this slot: ${input.current_slot.current_confidence.toFixed(2)}`,
      `Turns already spent on this slot: ${input.current_slot.turns_spent_on_this_slot}`,
      input.last_user_answer ? `\nThe user just said:\n"${input.last_user_answer}"` : ``,
    ];

    if (input.mode === "capture") {
      return [
        ...header,
        ``,
        `MODE: CAPTURE. The user just answered. Your job is to turn their answer into a`,
        `profile_patch for slot \`${input.current_slot.slot}\`.`,
        ``,
        `Rules:`,
        `  - Emit kind="patch" with ops that write what the user actually said into the`,
        `    correct profile layer for this slot. Map the slot to its layer:`,
        `      positioning.* → positioning_patch`,
        `      icp.*          → icp_patch`,
        `      worldview.*    → worldview_patch`,
        `      negative_space.* → negative_space_patch`,
        `      voice.*        → voice_patch`,
        `      anti_examples  → anti_example_append`,
        `      story_bank.*   → story_append (confirm a candidate as status:"confirmed")`,
        `      reference_library.* → reference_append (confirm a candidate as status:"confirmed")`,
        `  - Set patch.client_id=${input.client_id} and patch.confidence honestly`,
        `    (clear, specific answer → 0.7-0.9; vague → ≤0.5).`,
        `  - Never invent. Patches reflect ONLY what the user said (plus extractor candidates they confirmed).`,
        `  - ONLY if the answer is genuinely empty of usable signal (e.g. "idk", "skip"),`,
        `    emit kind="question" re-probing this slot. NEVER emit kind="wrap" in capture mode.`,
        ``,
        `Voice (for any question text): calm, declarative, premium. Sentence case. No hype.`,
      ].join("\n");
    }

    // mode === "ask"
    return [
      ...header,
      ``,
      `MODE: ASK. Produce the NEXT question to fill slot \`${input.current_slot.slot}\`.`,
      ``,
      `Choose the question_type:`,
      `  - "confirm" if extractor_snapshot has a high-confidence pre-fill for this slot`,
      `    ("I picked up X from your posts — is that right?").`,
      `  - "drill" if the last answer was vague and needs sharpening.`,
      `  - "probe" otherwise (open question for a slot we have no signal on).`,
      ``,
      `Hard rules:`,
      `  - Emit kind="question". One question, max 2 sentences.`,
      `  - target_slot MUST equal "${input.current_slot.slot}".`,
      `  - Reference what you already know (profile_snapshot, extractor_snapshot) so the user feels heard.`,
      `  - No hype words, emoji, or filler.`,
      ``,
      `Voice you write in: calm, declarative, premium. Sentence case. No hype.`,
    ].join("\n");
  },

  assert_no_violations: (output, input) => {
    const violations: string[] = [];

    // If the agent emits a question, target_slot should match current_slot
    // (drilling on the same slot is fine; jumping slots is not).
    if (output.kind === "question") {
      if (output.target_slot !== input.current_slot.slot) {
        violations.push(
          `question target_slot=${output.target_slot} does not match current_slot=${input.current_slot.slot}; agent jumped slots`
        );
      }
      // Prompt text length sanity.
      if (output.prompt_text.length > 600) {
        violations.push("question prompt_text exceeds 600 chars (likely rambling)");
      }
    }

    // Patches must reference the current client_id and have at least one op.
    if (output.kind === "patch") {
      if (output.patch.client_id !== input.client_id) {
        violations.push("patch client_id mismatch");
      }
      if (output.patch.ops.length === 0) {
        violations.push("patch with zero ops");
      }
    }

    // Wraps are only allowed when the user said so or coverage is genuinely done.
    if (output.kind === "wrap") {
      if (
        output.reason !== "user_paused" &&
        !input.last_user_answer?.toLowerCase().match(/\b(stop|pause|later|done)\b/) &&
        input.conversation_log.length > 0
      ) {
        // Coverage-complete wraps must come from the orchestrator, not the agent.
        // We don't have a signal here, so only flag if the conversation is short.
        if (input.conversation_log.length < 6) {
          violations.push("wrap emitted too early without user-stop signal");
        }
      }
    }

    return violations;
  },
};

// Helper: serializes the recent conversation tail for the user prompt.
export function renderConversationTail(input: OnboarderInput): string {
  const tail = input.conversation_log.slice(-8);
  return tail
    .map((e) =>
      e.role === "agent"
        ? `agent[${e.kind}${e.target_slot ? `:${e.target_slot}` : ""}]: ${e.prompt_text ?? "(patch)"}`
        : `user: ${e.text}`
    )
    .join("\n");
}

// Re-export the input slot key type for callers building the input shape.
export type { SlotKey };
