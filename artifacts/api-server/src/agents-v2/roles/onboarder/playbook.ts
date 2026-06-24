// Onboarder playbook — the ranked list of profile slots the agent fills, with
// the rules for choosing what to ask next, when to drill, and when to stop.
//
// The agent never roams free. Each turn, the agent looks at slot coverage and
// picks the highest-leverage unfilled slot. This file is the source of truth
// for "what does a complete profile look like" and "in what order."
//
// Keeping the playbook in code (not in the LLM prompt) is deliberate: it makes
// the onboarding behavior deterministic in structure and reviewable in PR diffs.

export type SlotKey =
  | "positioning.claim"
  | "positioning.adjacent_claims_rejected"
  | "icp.archetypes"
  | "worldview.beliefs"
  | "voice.confirmation"
  | "anti_examples"
  | "negative_space.refused_topics"
  | "story_bank.confirmation"
  | "reference_library.confirmation";

export type SlotPlaybook = {
  slot: SlotKey;
  /** Required slots must be filled above confidence_target for `coverage_complete`. */
  required: boolean;
  /** Confidence at or above which the slot is considered filled. */
  confidence_target: number;
  /**
   * Maximum consecutive turns to spend on this slot before moving on. Prevents
   * the agent from getting stuck drilling forever.
   */
  stop_after_turns: number;
  /** Slots this one unlocks. A slot is skipped until all of its `unlocked_by` are filled. */
  unlocked_by?: SlotKey[];
  /**
   * Human-readable rationale shown to the agent in the system prompt so it can
   * choose the right question type for this slot.
   */
  rationale: string;
};

export const PLAYBOOK: SlotPlaybook[] = [
  {
    slot: "positioning.claim",
    required: true,
    confidence_target: 0.75,
    stop_after_turns: 4,
    rationale:
      "Sharpest claim drives everything else. If this is vague, every downstream agent will be generic.",
  },
  {
    slot: "positioning.adjacent_claims_rejected",
    required: true,
    confidence_target: 0.6,
    stop_after_turns: 3,
    unlocked_by: ["positioning.claim"],
    rationale:
      "What this user is NOT is as important as what they are. Without rejections, the claim has no edges.",
  },
  {
    slot: "icp.archetypes",
    required: true,
    confidence_target: 0.7,
    stop_after_turns: 5,
    unlocked_by: ["positioning.claim"],
    rationale:
      "One well-specified archetype beats four shallow ones. Drill on jobs-to-be-done and where they get stuck.",
  },
  {
    slot: "worldview.beliefs",
    required: true,
    confidence_target: 0.65,
    stop_after_turns: 5,
    rationale:
      "Voice extractor pre-fills hypotheses. Confirmation here makes downstream content recognizably this person.",
  },
  {
    slot: "voice.confirmation",
    required: true,
    confidence_target: 0.7,
    stop_after_turns: 3,
    rationale:
      "Voice features came from samples. User confirms or corrects the description. Skip if voice confidence already > 0.7.",
  },
  {
    slot: "anti_examples",
    required: true,
    confidence_target: 1.0,
    stop_after_turns: 2,
    rationale:
      "Three posts that sound NOTHING like the user. Strongest single negative-space signal we capture.",
  },
  {
    slot: "negative_space.refused_topics",
    required: true,
    confidence_target: 0.6,
    stop_after_turns: 3,
    rationale:
      "Topics and words the user refuses. Ghostwriter respects this absolutely.",
  },
  {
    slot: "story_bank.confirmation",
    required: false,
    confidence_target: 0.5,
    stop_after_turns: 4,
    unlocked_by: ["positioning.claim"],
    rationale:
      "Extractor produced candidates. User confirms which are real and worth redeploying.",
  },
  {
    slot: "reference_library.confirmation",
    required: false,
    confidence_target: 0.5,
    stop_after_turns: 3,
    rationale:
      "Names / books / frameworks the extractor surfaced. Quick yes/no per item, low cost.",
  },
];

/**
 * Choose the next slot to ask about given current coverage. Returns null when
 * all required slots are above threshold (caller emits `wrap`).
 */
export function chooseNextSlot(
  coverage: Record<string, { confidence: number; turns_spent: number }>
): SlotPlaybook | null {
  for (const slot of PLAYBOOK) {
    // Skip slots whose unlockers haven't met confidence.
    if (slot.unlocked_by) {
      const unlocked = slot.unlocked_by.every(
        (dep) => (coverage[dep]?.confidence ?? 0) >= 0.5
      );
      if (!unlocked) continue;
    }
    const c = coverage[slot.slot];
    const conf = c?.confidence ?? 0;
    const turns = c?.turns_spent ?? 0;
    // Stop drilling this slot if we've exhausted turns; treat as best-effort.
    if (turns >= slot.stop_after_turns) continue;
    if (conf >= slot.confidence_target) continue;
    return slot;
  }
  return null;
}

/** Returns true when all required slots meet their target. */
export function isCoverageComplete(
  coverage: Record<string, { confidence: number; turns_spent: number }>
): boolean {
  for (const slot of PLAYBOOK) {
    if (!slot.required) continue;
    const c = coverage[slot.slot];
    const conf = c?.confidence ?? 0;
    const turns = c?.turns_spent ?? 0;
    // Required slot is "satisfied" if either it's above target OR we've spent
    // our turn budget on it (best-effort, don't perseverate).
    if (conf < slot.confidence_target && turns < slot.stop_after_turns) {
      return false;
    }
  }
  return true;
}

/** Coverage aggregate, weighted by `required`. */
export function aggregateConfidence(
  coverage: Record<string, { confidence: number; turns_spent: number }>
): number {
  const required = PLAYBOOK.filter((s) => s.required);
  if (required.length === 0) return 1;
  const sum = required.reduce((acc, s) => acc + (coverage[s.slot]?.confidence ?? 0), 0);
  return sum / required.length;
}
