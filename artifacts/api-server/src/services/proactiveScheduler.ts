import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  clientProfileTable,
  narrativeProfilesTable,
  assistantMessagesTable,
  assistantReviewsTable,
  type ClientProfile,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  loadContext,
  loadHistory,
  enrichActions,
} from "../routes/assistant";
import { generateProactiveSuggestion } from "./assistant";
import { notify } from "./assistantNotifier";

// How often the scheduler wakes up to look for clients to review.
const TICK_INTERVAL_MS = 5 * 60 * 1000;
// Minimum time between two proactive reviews of the SAME client, so we never
// nag and never re-spend model budget on an unchanged foundation too soon.
const PER_CLIENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
// Max clients reviewed per tick, bounding model cost and request load.
const MAX_PER_TICK = 3;

// Hash the macro brand foundation the strategist actually reasons about, so we
// can skip a review when nothing meaningful changed since last time.
function computeStateHash(ctx: Awaited<ReturnType<typeof loadContext>>): string {
  const c = ctx.client;
  const macro = {
    profile: {
      fullName: c.fullName,
      headline: c.headline,
      currentRole: c.currentRole,
      company: c.company,
      industry: c.industry,
      goals: c.goals,
      bio: c.bio,
      positioning: c.positioning,
      primaryAudience: c.primaryAudience,
      secondaryAudience: c.secondaryAudience,
      brandValues: c.brandValues,
      nonNegotiables: c.nonNegotiables,
      personalityTone: c.personalityTone,
      desiredFeeling: c.desiredFeeling,
      thesis: c.thesis,
      coreBeliefs: c.coreBeliefs,
      signatureFrameworks: c.signatureFrameworks,
      passions: c.passions,
      beliefs: c.beliefs,
      frustrations: c.frustrations,
      desiredChange: c.desiredChange,
    },
    narrative: ctx.narrative ?? null,
    contentStrategy: ctx.contentStrategy ?? null,
    platforms: ctx.platforms ?? null,
    audit: ctx.audit
      ? { seoScore: ctx.audit.seoScore, geoScore: ctx.audit.geoScore }
      : null,
  };
  return createHash("sha256").update(JSON.stringify(macro)).digest("hex");
}

async function hasPendingUnseen(clientId: number): Promise<boolean> {
  const rows = await db
    .select({ id: assistantMessagesTable.id })
    .from(assistantMessagesTable)
    .where(
      and(
        eq(assistantMessagesTable.clientId, clientId),
        eq(assistantMessagesTable.seen, false),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function getReview(clientId: number) {
  const [existing] = await db
    .select()
    .from(assistantReviewsTable)
    .where(eq(assistantReviewsTable.clientId, clientId))
    .limit(1);
  return existing ?? null;
}

async function upsertReview(clientId: number, stateHash: string): Promise<void> {
  const existing = await getReview(clientId);
  const now = new Date();
  if (existing) {
    await db
      .update(assistantReviewsTable)
      .set({ lastReviewedAt: now, lastStateHash: stateHash, updatedAt: now })
      .where(eq(assistantReviewsTable.id, existing.id));
  } else {
    await db.insert(assistantReviewsTable).values({
      clientId,
      lastReviewedAt: now,
      lastStateHash: stateHash,
      updatedAt: now,
    });
  }
}

// Run one proactive review for a single client. Returns true if a suggestion
// was posted (so the tick can respect its per-tick budget).
async function reviewClient(client: ClientProfile): Promise<boolean> {
  const review = await getReview(client.id);

  if (review?.lastReviewedAt) {
    const elapsed = Date.now() - review.lastReviewedAt.getTime();
    if (elapsed < PER_CLIENT_COOLDOWN_MS) return false;
  }

  // Don't pile suggestions on top of one the client hasn't looked at yet.
  if (await hasPendingUnseen(client.id)) return false;

  const ctx = await loadContext(client.id, client);
  const stateHash = computeStateHash(ctx);

  // Nothing changed since the last review — record the look and move on without
  // spending a model call.
  if (review && review.lastStateHash === stateHash) {
    await upsertReview(client.id, stateHash);
    return false;
  }

  const history = await loadHistory(client.id);
  const result = await generateProactiveSuggestion({ context: ctx, history });

  await upsertReview(client.id, stateHash);

  if (result.actions.length === 0) return false;

  const actions = enrichActions(result.actions, ctx);
  await db.insert(assistantMessagesTable).values({
    clientId: client.id,
    role: "assistant",
    content: result.reply,
    actions,
    seen: false,
  });
  notify(client.id);
  return true;
}

async function runTick(): Promise<void> {
  // Only clients with a narrative have a foundation worth reviewing.
  const rows = await db
    .select({ client: clientProfileTable })
    .from(clientProfileTable)
    .innerJoin(
      narrativeProfilesTable,
      eq(narrativeProfilesTable.clientId, clientProfileTable.id),
    )
    .orderBy(desc(clientProfileTable.updatedAt));

  const seen = new Set<number>();
  let posted = 0;
  for (const { client } of rows) {
    if (posted >= MAX_PER_TICK) break;
    if (seen.has(client.id)) continue;
    seen.add(client.id);
    try {
      const didPost = await reviewClient(client);
      if (didPost) posted++;
    } catch (err) {
      logger.error({ err, clientId: client.id }, "Proactive review failed");
    }
  }
}

let started = false;

// Start the background proactive-review loop. Safe to call once at server boot.
export function startProactiveScheduler(): void {
  if (started) return;
  started = true;

  const tick = () => {
    runTick().catch((err) => {
      logger.error({ err }, "Proactive scheduler tick failed");
    });
  };

  // Stagger the first run slightly so it doesn't compete with boot.
  setTimeout(tick, 60 * 1000);
  const handle = setInterval(tick, TICK_INTERVAL_MS);
  // Don't keep the process alive solely for the scheduler.
  handle.unref?.();

  logger.info("Proactive strategist scheduler started");
}
