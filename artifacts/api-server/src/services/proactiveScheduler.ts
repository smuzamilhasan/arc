import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  clientProfileTable,
  narrativeProfilesTable,
  assistantMessagesTable,
  assistantReviewsTable,
  assistantInsightsTable,
  type ClientProfile,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  loadContext,
  loadHistory,
  enrichActions,
} from "../routes/assistant";
import {
  generateProactiveSuggestion,
  generateEducationalInsights,
  generateDailyGuidance,
} from "./assistant";
import { areAgentsUnlocked } from "./foundation";
import { notify } from "./assistantNotifier";

// How often the scheduler wakes up to look for clients to review.
const TICK_INTERVAL_MS = 5 * 60 * 1000;
// Minimum time between two proactive reviews of the SAME client, so we never
// nag and never re-spend model budget on an unchanged foundation too soon.
const PER_CLIENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
// Max clients reviewed per tick, bounding model cost and request load.
const MAX_PER_TICK = 3;
// Educational insights refresh on a slower cadence than proactive suggestions —
// they are evergreen encouragement, so once a batch exists we only regenerate
// after a long interval OR when the brand state meaningfully changes.
const INSIGHTS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
// Max clients whose insights are (re)generated per tick, bounding model cost.
const INSIGHTS_MAX_PER_TICK = 3;
// The strategist's daily guidance check-in: at most one per client per ~24h.
const DAILY_INSIGHT_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Max daily-guidance messages posted per tick, bounding model cost.
const DAILY_INSIGHT_MAX_PER_TICK = 3;

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

async function recordInsightsRun(clientId: number, stateHash: string): Promise<void> {
  const existing = await getReview(clientId);
  const now = new Date();
  if (existing) {
    await db
      .update(assistantReviewsTable)
      .set({ lastInsightsAt: now, lastInsightsStateHash: stateHash, updatedAt: now })
      .where(eq(assistantReviewsTable.id, existing.id));
  } else {
    await db.insert(assistantReviewsTable).values({
      clientId,
      lastInsightsAt: now,
      lastInsightsStateHash: stateHash,
      updatedAt: now,
    });
  }
}

async function recordDailyInsightRun(clientId: number): Promise<void> {
  const existing = await getReview(clientId);
  const now = new Date();
  if (existing) {
    await db
      .update(assistantReviewsTable)
      .set({ lastDailyInsightAt: now, updatedAt: now })
      .where(eq(assistantReviewsTable.id, existing.id));
  } else {
    await db.insert(assistantReviewsTable).values({
      clientId,
      lastDailyInsightAt: now,
      updatedAt: now,
    });
  }
}

async function countActiveInsights(clientId: number): Promise<number> {
  const rows = await db
    .select({ id: assistantInsightsTable.id })
    .from(assistantInsightsTable)
    .where(
      and(
        eq(assistantInsightsTable.clientId, clientId),
        eq(assistantInsightsTable.dismissed, false),
      ),
    );
  return rows.length;
}

// Generate (or refresh) a client's educational insights when warranted. Runs on
// a slower cadence than proactive suggestions and for ALL profiles (insights are
// useful from the very start of the journey, not only once a narrative exists).
// Returns true if a fresh batch was generated, so the tick can bound its budget.
async function maybeRefreshInsights(client: ClientProfile): Promise<boolean> {
  const review = await getReview(client.id);
  const activeCount = await countActiveInsights(client.id);

  const ctx = await loadContext(client.id, client);
  const stateHash = computeStateHash(ctx);

  const elapsed = review?.lastInsightsAt
    ? Date.now() - review.lastInsightsAt.getTime()
    : Infinity;
  const stale = elapsed >= INSIGHTS_REFRESH_MS;
  const stateChanged = !review || review.lastInsightsStateHash !== stateHash;

  // Skip when we already have a live batch that is neither stale nor outdated.
  if (activeCount > 0 && !stale && !stateChanged) return false;

  const insights = await generateEducationalInsights(ctx);
  if (insights.length === 0) {
    // Record the run so we don't retry the model every tick on a dud response.
    await recordInsightsRun(client.id, stateHash);
    return false;
  }

  // Refresh the live set: clear the current non-dismissed batch, then insert the
  // new one. Dismissed rows are left untouched so they never resurface.
  await db
    .delete(assistantInsightsTable)
    .where(
      and(
        eq(assistantInsightsTable.clientId, client.id),
        eq(assistantInsightsTable.dismissed, false),
      ),
    );
  await db.insert(assistantInsightsTable).values(
    insights.map((i) => ({
      clientId: client.id,
      pillar: i.pillar,
      contexts: i.contexts,
      stage: i.stage,
      title: i.title,
      body: i.body,
    })),
  );

  await recordInsightsRun(client.id, stateHash);
  notify(client.id, "insights");
  return true;
}

// Post the strategist's once-a-day, fully tailored guidance message into the
// chat. Only runs once the FULL foundation is complete (the same bar that
// unlocks the agents) and at most once per ~24h. Returns true if a message was
// posted so the tick can respect its per-tick budget.
async function maybeDailyInsight(client: ClientProfile): Promise<boolean> {
  // The daily guidance only exists once the client has a complete foundation —
  // before that the strategist is locked.
  if (!(await areAgentsUnlocked(client))) return false;

  const review = await getReview(client.id);
  if (review?.lastDailyInsightAt) {
    const elapsed = Date.now() - review.lastDailyInsightAt.getTime();
    if (elapsed < DAILY_INSIGHT_INTERVAL_MS) return false;
  }

  // Don't stack a daily note on top of something the client hasn't seen yet.
  if (await hasPendingUnseen(client.id)) return false;

  const ctx = await loadContext(client.id, client);
  const history = await loadHistory(client.id);
  const message = await generateDailyGuidance({ context: ctx, history });

  // Record the run regardless so a dud response doesn't retry every tick.
  await recordDailyInsightRun(client.id);

  if (!message) return false;

  await db.insert(assistantMessagesTable).values({
    clientId: client.id,
    role: "assistant",
    content: message,
    actions: [],
    seen: false,
  });
  notify(client.id);
  return true;
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
  // Only clients with a narrative have a foundation worth reviewing for
  // strategic action proposals.
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

  // Educational insights are useful from the very start of the journey, so they
  // run for ALL profiles (not just those with a narrative), on their own slower
  // cadence and budget.
  const allClients = await db
    .select()
    .from(clientProfileTable)
    .orderBy(desc(clientProfileTable.updatedAt));

  let refreshed = 0;
  for (const client of allClients) {
    if (refreshed >= INSIGHTS_MAX_PER_TICK) break;
    try {
      const didRefresh = await maybeRefreshInsights(client);
      if (didRefresh) refreshed++;
    } catch (err) {
      logger.error({ err, clientId: client.id }, "Insight refresh failed");
    }
  }

  // The strategist's once-a-day guidance check-in, for clients whose full
  // foundation is complete (maybeDailyInsight enforces that bar itself).
  let dailyPosted = 0;
  for (const client of allClients) {
    if (dailyPosted >= DAILY_INSIGHT_MAX_PER_TICK) break;
    try {
      const didPost = await maybeDailyInsight(client);
      if (didPost) dailyPosted++;
    } catch (err) {
      logger.error({ err, clientId: client.id }, "Daily insight failed");
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
