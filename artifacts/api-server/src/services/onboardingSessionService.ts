// OnboardingSessionService — orchestrates the multi-turn Onboarder agent.
//
// This is the stateful layer. The Onboarder agent itself is stateless and pure;
// the service feeds it the right inputs each turn and persists the resulting
// outputs to `onboarding_sessions`.
//
// API:
//   startSession(clientId)         → create/resume row; return first agent turn
//   submitAnswer(sessionId, text)  → run one agent turn, persist, return turn
//   getActiveSession(clientId)     → fetch current session (for resume)
//   wrapSession(sessionId, reason) → mark wrapped
//
// Each `submitAnswer` does:
//   1. Append user answer to log
//   2. Pick next slot via playbook (or drill if last answer was vague)
//   3. Build OnboarderInput
//   4. Run AgentRunner with onboarderContract
//   5. If output is patch → applyProfilePatch, bump slot confidence
//   6. If output is question → store and return
//   7. If output is wrap → mark session wrapped
//   8. If all required slots covered → emit synthetic wrap

import {
  db,
  onboardingSessionsTable,
  clientProfileTable,
  storyBankTable,
  referenceLibraryTable,
  readLayer,
  type OnboardingSession,
  type OnboardingLogEntry,
  type SlotCoverage,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { AgentRunner } from "../agents-v2/runner/agentRunner";
import {
  onboarderContract,
  type OnboarderInput,
  PLAYBOOK,
  chooseNextSlot,
  isCoverageComplete,
  aggregateConfidence,
} from "../agents-v2/roles/onboarder";
import { openaiStructuredClient } from "../agents-v2/llm";
import { applyProfilePatch } from "../agents-v2/profilePatch";
import type { OnboarderTurn } from "../agents-v2/contracts/outputs";

export type StartSessionResult = {
  sessionId: number;
  clientId: number;
  resumedExisting: boolean;
  firstTurn: OnboarderTurn;
};

export type SubmitAnswerResult =
  | { kind: "next"; sessionId: number; turn: OnboarderTurn; aggregateConfidence: number }
  | { kind: "wrapped"; sessionId: number; reason: string; aggregateConfidence: number }
  | { kind: "refused"; sessionId: number; reason: string }
  | { kind: "violation"; sessionId: number; details: string };

/**
 * Begin (or resume) an onboarding session for a client and return the first
 * agent turn. Idempotent: if an active session exists, resume it.
 */
export async function startSession(clientId: number): Promise<StartSessionResult> {
  const existing = await getActiveSession(clientId);

  if (existing) {
    const turn = await runAgentTurn(existing, /* lastUserAnswer */ null);
    const updated = await persistAgentTurn(existing, turn);
    return {
      sessionId: existing.id,
      clientId,
      resumedExisting: true,
      firstTurn: turn,
    };
  }

  const profileSnapshot = await loadProfileSnapshot(clientId);

  const created = await db
    .insert(onboardingSessionsTable)
    .values({
      clientId,
      status: "active",
      profileSnapshotAtStart: profileSnapshot as Record<string, unknown>,
    })
    .returning();
  const session = created[0]!;

  const turn = await runAgentTurn(session, null);
  await persistAgentTurn(session, turn);

  return { sessionId: session.id, clientId, resumedExisting: false, firstTurn: turn };
}

/** Run one user → agent turn. */
export async function submitAnswer(
  sessionId: number,
  answerText: string
): Promise<SubmitAnswerResult> {
  const sessionRow = await loadSession(sessionId);
  if (!sessionRow) {
    return { kind: "violation", sessionId, details: "session not found" };
  }
  if (sessionRow.status !== "active") {
    return { kind: "violation", sessionId, details: `session is ${sessionRow.status}, not active` };
  }

  // 1. Append user turn.
  const log = appendLog(sessionRow.log, {
    role: "user",
    at: new Date().toISOString(),
    text: answerText,
  });
  await db
    .update(onboardingSessionsTable)
    .set({ log, lastTurnAt: new Date(), turnCount: sessionRow.turnCount + 1 })
    .where(eq(onboardingSessionsTable.id, sessionId));
  const sessionWithUser = { ...sessionRow, log, turnCount: sessionRow.turnCount + 1 };

  // 2. Run agent turn.
  const turn = await runAgentTurn(sessionWithUser, answerText);

  // 3. Apply side effects per turn kind.
  if (turn.kind === "patch") {
    try {
      await applyProfilePatch(turn.patch);
      // Bump confidence for the slot we're focused on, using the patch's
      // self-reported confidence.
      const focusSlot = pickFocusSlot(sessionWithUser);
      if (focusSlot) {
        const newCoverage = bumpCoverage(
          sessionWithUser.slotCoverage,
          focusSlot.slot,
          turn.patch.confidence
        );
        await persistCoverage(sessionId, newCoverage);
      }
    } catch (err) {
      return {
        kind: "violation",
        sessionId,
        details: `patch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (turn.kind === "question") {
    const focusSlot = pickFocusSlot(sessionWithUser);
    if (focusSlot) {
      const newCoverage = bumpCoverage(
        sessionWithUser.slotCoverage,
        focusSlot.slot,
        sessionWithUser.slotCoverage[focusSlot.slot]?.confidence ?? 0,
        { incrementTurns: true }
      );
      await persistCoverage(sessionId, newCoverage);
    }
  }

  // 4. Persist agent turn.
  const updated = await persistAgentTurn(sessionWithUser, turn);

  // 5. Check for natural wrap.
  const coverage = (await loadSession(sessionId))?.slotCoverage ?? {};
  if (turn.kind === "wrap" || isCoverageComplete(coverage)) {
    const wrapReason = turn.kind === "wrap" ? turn.reason : "coverage_complete";
    await wrapSession(sessionId, wrapReason as "coverage_complete" | "user_paused" | "perseveration");
    return {
      kind: "wrapped",
      sessionId,
      reason: wrapReason,
      aggregateConfidence: aggregateConfidence(coverage),
    };
  }

  return {
    kind: "next",
    sessionId,
    turn,
    aggregateConfidence: aggregateConfidence(coverage),
  };
}

export async function getActiveSession(clientId: number): Promise<OnboardingSession | null> {
  const rows = await db
    .select()
    .from(onboardingSessionsTable)
    .where(and(eq(onboardingSessionsTable.clientId, clientId), eq(onboardingSessionsTable.status, "active")))
    .orderBy(desc(onboardingSessionsTable.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function wrapSession(
  sessionId: number,
  reason: "coverage_complete" | "perseveration" | "user_paused"
): Promise<void> {
  await db
    .update(onboardingSessionsTable)
    .set({
      status: "wrapped",
      wrappedAt: new Date(),
      wrapReason: reason,
    })
    .where(eq(onboardingSessionsTable.id, sessionId));
}

// ---------- Internal ----------

async function loadSession(sessionId: number): Promise<OnboardingSession | null> {
  const rows = await db
    .select()
    .from(onboardingSessionsTable)
    .where(eq(onboardingSessionsTable.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

async function runAgentTurn(
  session: OnboardingSession,
  lastUserAnswer: string | null
): Promise<OnboarderTurn> {
  const focus = pickFocusSlot(session);
  if (!focus) {
    // No slots left — return wrap synthetically.
    return {
      kind: "wrap",
      reason: "coverage_complete",
      summary: "All required slots covered or saturated.",
    };
  }

  const profileSnapshot = await loadProfileSnapshot(session.clientId);
  const extractorSnapshot = await loadExtractorSnapshot(session.clientId);

  const input: OnboarderInput = {
    client_id: session.clientId,
    current_slot: {
      slot: focus.slot,
      rationale: focus.rationale,
      turns_spent_on_this_slot: session.slotCoverage[focus.slot]?.turns_spent ?? 0,
      current_confidence: session.slotCoverage[focus.slot]?.confidence ?? 0,
    },
    profile_snapshot: profileSnapshot,
    extractor_snapshot: extractorSnapshot,
    conversation_log: session.log.slice(-12).map(stripTimestamps),
    last_user_answer: lastUserAnswer,
  };

  const runner = new AgentRunner(onboarderContract, { llm: openaiStructuredClient });
  const result = await runner.run(input);

  if (result.kind === "ok") return result.output;
  if (result.kind === "refused") {
    return {
      kind: "wrap",
      reason: "user_paused",
      summary: result.reason,
    };
  }
  // contract_violation → emit a clarifying question on the same slot so we
  // don't burn user trust on a hard failure.
  return {
    kind: "question",
    question_type: "drill",
    target_slot: focus.slot,
    prompt_text:
      "Sorry — let me try that again. Could you say a bit more about what you mean here?",
  };
}

function pickFocusSlot(session: OnboardingSession): { slot: string; rationale: string } | null {
  const slot = chooseNextSlot(session.slotCoverage);
  if (!slot) return null;
  return { slot: slot.slot, rationale: slot.rationale };
}

async function persistAgentTurn(
  session: OnboardingSession,
  turn: OnboarderTurn
): Promise<void> {
  const entry: OnboardingLogEntry = {
    role: "agent",
    at: new Date().toISOString(),
    kind: turn.kind,
    target_slot: turn.kind === "question" ? turn.target_slot : undefined,
    question_type: turn.kind === "question" ? turn.question_type : undefined,
    prompt_text: turn.kind === "question" ? turn.prompt_text : undefined,
    patch_summary:
      turn.kind === "patch"
        ? `${turn.patch.ops.length} ops @ confidence ${turn.patch.confidence.toFixed(2)}`
        : undefined,
    wrap_reason: turn.kind === "wrap" ? turn.reason : undefined,
  };
  const log = appendLog(session.log, entry);
  await db
    .update(onboardingSessionsTable)
    .set({
      log,
      lastTurnAt: new Date(),
      aggregateConfidence: aggregateConfidence(session.slotCoverage),
    })
    .where(eq(onboardingSessionsTable.id, session.id));
}

async function persistCoverage(sessionId: number, coverage: SlotCoverage): Promise<void> {
  await db
    .update(onboardingSessionsTable)
    .set({ slotCoverage: coverage, aggregateConfidence: aggregateConfidence(coverage) })
    .where(eq(onboardingSessionsTable.id, sessionId));
}

function bumpCoverage(
  coverage: SlotCoverage,
  slot: string,
  newConfidence: number,
  opts: { incrementTurns?: boolean } = {}
): SlotCoverage {
  const existing = coverage[slot];
  return {
    ...coverage,
    [slot]: {
      confidence: Math.max(existing?.confidence ?? 0, newConfidence),
      turns_spent: (existing?.turns_spent ?? 0) + (opts.incrementTurns ? 1 : 0),
      last_touched_at: new Date().toISOString(),
    },
  };
}

function appendLog(log: OnboardingLogEntry[], entry: OnboardingLogEntry): OnboardingLogEntry[] {
  return [...(log ?? []), entry];
}

function stripTimestamps(e: OnboardingLogEntry): OnboardingLogEntry {
  // The agent input schema doesn't include `at` to keep the LLM context tight.
  if (e.role === "agent") {
    const { at, ...rest } = e;
    return { ...rest, at } as OnboardingLogEntry;
  }
  return e;
}

async function loadProfileSnapshot(clientId: number): Promise<OnboarderInput["profile_snapshot"]> {
  const rows = await db
    .select({
      fullName: clientProfileTable.fullName,
      headline: clientProfileTable.headline,
      positioningV2: clientProfileTable.positioningV2,
      icpV2: clientProfileTable.icpV2,
      voiceV2: clientProfileTable.voiceV2,
      worldviewV2: clientProfileTable.worldviewV2,
      negativeSpaceV2: clientProfileTable.negativeSpaceV2,
    })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { identity: null };
  }
  return {
    identity: {
      full_name: row.fullName,
      headline: row.headline,
    },
    positioning: readLayer("positioning_v2", row.positioningV2),
    icp: readLayer("icp_v2", row.icpV2),
    voice: readLayer("voice_v2", row.voiceV2),
    worldview: readLayer("worldview_v2", row.worldviewV2),
    negative_space: readLayer("negative_space_v2", row.negativeSpaceV2),
  };
}

async function loadExtractorSnapshot(
  clientId: number
): Promise<OnboarderInput["extractor_snapshot"]> {
  // Pull recent candidates from story_bank + reference_library (status = candidate).
  const stories = await db
    .select({ id: storyBankTable.id, summary: storyBankTable.summary })
    .from(storyBankTable)
    .where(and(eq(storyBankTable.clientId, clientId), eq(storyBankTable.status, "candidate")))
    .orderBy(desc(storyBankTable.createdAt))
    .limit(10);
  const references = await db
    .select({
      id: referenceLibraryTable.id,
      label: referenceLibraryTable.label,
      kind: referenceLibraryTable.kind,
    })
    .from(referenceLibraryTable)
    .where(
      and(
        eq(referenceLibraryTable.clientId, clientId),
        eq(referenceLibraryTable.status, "candidate")
      )
    )
    .orderBy(desc(referenceLibraryTable.citationCount))
    .limit(15);

  // Voice description + signature words from current voice_v2.
  const profileRows = await db
    .select({ voiceV2: clientProfileTable.voiceV2, worldviewV2: clientProfileTable.worldviewV2 })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  const voice = readLayer("voice_v2", profileRows[0]?.voiceV2);
  const worldview = readLayer("worldview_v2", profileRows[0]?.worldviewV2);

  return {
    voice_description: voice?.description ?? null,
    signature_words: voice?.lexicon?.signature_words ?? [],
    story_candidates: stories.map((s) => ({ id: s.id, summary: s.summary })),
    reference_candidates: references.map((r) => ({ id: r.id, label: r.label, kind: r.kind })),
    worldview_hypotheses: (worldview?.beliefs ?? []).map((b) => ({
      claim: b.claim,
      confidence: b.confidence,
    })),
  };
}
