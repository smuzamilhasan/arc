import { Router, type Request } from "express";
import {
  db,
  plannerMessagesTable,
  contentStrategiesTable,
  postsTable,
  ideasTable,
  type PlannerAction,
  type PlannerActionKind,
  type ClientProfile,
} from "@workspace/db";
import { asc, desc, eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  generatePlannerReply,
  buildDiff,
  type PlannerProposedAction,
} from "../services/plannerChat";
import { loadContext, loadHistory } from "./assistant";
import { isBlueprintComplete } from "../services/platforms";
import { agentsGateError } from "../services/foundation";
import { scheduleClientPosts } from "./posts";
import { rescheduleToDay, shiftDateByDays } from "../services/scheduleMath";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";
import type { PlannedSlot, PlannedIdea } from "../services/planner";

const PLANNER_MESSAGE_MAX_LENGTH = 4000;

const router = Router();

function serializeMessage(m: typeof plannerMessagesTable.$inferSelect) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    actions: m.actions,
    seen: m.seen,
    createdAt: m.createdAt.toISOString(),
  };
}

// Turn the model's proposed actions into persisted PlannerAction records,
// enriching each with an id, "proposed" status, and a computed before -> after
// diff. Shared with the Manager relay.
export function enrichPlannerActions(
  proposed: PlannerProposedAction[],
  ctx: Awaited<ReturnType<typeof loadContext>>,
): PlannerAction[] {
  return proposed.map((p) => ({
    id: randomUUID(),
    kind: p.kind,
    title: p.title,
    rationale: p.rationale,
    status: "proposed" as const,
    rejectionComment: null,
    diff: buildDiff(p.kind, p.payload, ctx),
    payload: p.payload,
  }));
}

// The Planner can only act once the Blueprint is complete AND a content
// strategy exists — the same gate the existing /planner/generate route uses.
// Mirrors the server-side enforcement of the UI lock.
async function plannerGate(client: ClientProfile): Promise<string | null> {
  const agentsError = await agentsGateError(client);
  if (agentsError) return agentsError;
  if (!isBlueprintComplete(client)) {
    return "Complete your Blueprint to unlock planning.";
  }
  const [contentStrategy] = await db
    .select({ id: contentStrategiesTable.id })
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .limit(1);
  if (!contentStrategy) {
    return "Generate your content strategy before planning a calendar.";
  }
  return null;
}

router.get("/planner/chat/messages", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const rows = await db
    .select()
    .from(plannerMessagesTable)
    .where(eq(plannerMessagesTable.clientId, client.id))
    .orderBy(asc(plannerMessagesTable.id));
  res.json(rows.map(serializeMessage));
});

// Count unseen Planner messages (Manager hand-offs), driving the unread dot.
router.get("/planner/chat/unread", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const rows = await db
    .select({ id: plannerMessagesTable.id })
    .from(plannerMessagesTable)
    .where(
      and(
        eq(plannerMessagesTable.clientId, client.id),
        eq(plannerMessagesTable.seen, false),
      ),
    );
  res.json({ count: rows.length });
});

router.post("/planner/chat/seen", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  await db
    .update(plannerMessagesTable)
    .set({ seen: true })
    .where(
      and(
        eq(plannerMessagesTable.clientId, client.id),
        eq(plannerMessagesTable.seen, false),
      ),
    );
  res.json({ count: 0 });
});

router.post("/planner/chat/message", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const gateError = await plannerGate(client);
  if (gateError) {
    res.status(403).json({ error: gateError });
    return;
  }
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }
  if (content.length > PLANNER_MESSAGE_MAX_LENGTH) {
    res
      .status(400)
      .json({ error: `Message must be ${PLANNER_MESSAGE_MAX_LENGTH} characters or fewer.` });
    return;
  }

  const [userMessage] = await db
    .insert(plannerMessagesTable)
    .values({ clientId: client.id, role: "user", content, actions: [] })
    .returning();

  try {
    const ctx = await loadContext(client.id, client);
    const history = await loadPlannerHistory(client.id);
    const result = await generatePlannerReply({
      context: ctx,
      history: history.slice(0, -1),
      userMessage: content,
    });
    const actions = enrichPlannerActions(result.actions, ctx);

    const [assistantMessage] = await db
      .insert(plannerMessagesTable)
      .values({ clientId: client.id, role: "assistant", content: result.reply, actions })
      .returning();

    res.json({
      userMessage: serializeMessage(userMessage),
      assistantMessage: serializeMessage(assistantMessage),
    });
  } catch (err) {
    req.log.error({ err }, "Planner reply generation failed");
    res.status(502).json({ error: "The Planner could not respond. Please try again." });
  }
});

// Planner-scoped conversation history (kept separate from the Strategist chat).
async function loadPlannerHistory(clientId: number) {
  const rows = await db
    .select()
    .from(plannerMessagesTable)
    .where(eq(plannerMessagesTable.clientId, clientId))
    .orderBy(asc(plannerMessagesTable.id));
  return rows
    .slice(-20)
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

async function findAction(clientId: number, actionId: string) {
  const rows = await db
    .select()
    .from(plannerMessagesTable)
    .where(eq(plannerMessagesTable.clientId, clientId))
    .orderBy(asc(plannerMessagesTable.id));
  for (const row of rows) {
    const idx = row.actions.findIndex((a) => a.id === actionId);
    if (idx !== -1) return { row, idx, action: row.actions[idx] };
  }
  return null;
}

async function persistActionUpdate(
  rowId: number,
  actions: PlannerAction[],
  idx: number,
  next: PlannerAction,
) {
  const updated = actions.slice();
  updated[idx] = next;
  await db
    .update(plannerMessagesTable)
    .set({ actions: updated })
    .where(eq(plannerMessagesTable.id, rowId));
  return next;
}

// Apply a confirmed calendar action against the underlying posts/ideas, scoped
// to this client. Throws on any validation/lookup failure.
async function applyAction(
  client: ClientProfile,
  kind: PlannerActionKind,
  payload: Record<string, unknown> | null,
): Promise<void> {
  switch (kind) {
    case "generate_calendar": {
      const slots = (payload?.slots as PlannedSlot[] | undefined) ?? [];
      const ideas = (payload?.ideas as PlannedIdea[] | undefined) ?? [];
      if (slots.length === 0 && ideas.length === 0) {
        throw new Error("Empty calendar");
      }
      await db.transaction(async (tx) => {
        if (slots.length > 0) {
          await tx.insert(postsTable).values(
            slots.map((s) => {
              const date = new Date(s.targetDate);
              const scheduledAt = Number.isNaN(date.getTime()) ? null : date;
              const tags = [s.contentType, s.format]
                .map((t) => (t ?? "").trim())
                .filter(Boolean);
              return {
                clientId: client.id,
                title: s.title,
                content: s.brief,
                platform: s.platform,
                status: scheduledAt ? "scheduled" : "draft",
                scheduledAt,
                tags,
              };
            }),
          );
        }
        if (ideas.length > 0) {
          await tx.insert(ideasTable).values(
            ideas.map((i) => ({
              clientId: client.id,
              title: i.title,
              notes: i.notes ?? "",
              platform: i.platform ?? null,
            })),
          );
        }
      });
      return;
    }
    case "schedule_posts": {
      const postIds = (payload?.postIds as number[] | undefined) ?? [];
      const startDate = String(payload?.startDate ?? "");
      const intervalDays =
        typeof payload?.intervalDays === "number"
          ? (payload.intervalDays as number)
          : undefined;
      const time = typeof payload?.time === "string" ? (payload.time as string) : undefined;
      await scheduleClientPosts(client.id, { postIds, startDate, intervalDays, time });
      return;
    }
    case "reschedule_posts": {
      const items =
        (payload?.items as
          | { postId: number; day: string; time?: string }[]
          | undefined) ?? [];
      if (items.length === 0) throw new Error("No posts to reschedule");
      const ids = items.map((i) => i.postId);
      const owned = await db
        .select({ id: postsTable.id, scheduledAt: postsTable.scheduledAt })
        .from(postsTable)
        .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, ids)));
      const ownedById = new Map(owned.map((p) => [p.id, p]));
      let applied = 0;
      const now = new Date();
      for (const item of items) {
        const existing = ownedById.get(item.postId);
        if (!existing) continue;
        const scheduledAt = rescheduleToDay(existing.scheduledAt ?? null, item.day, item.time);
        await db
          .update(postsTable)
          .set({ scheduledAt, status: "scheduled", updatedAt: now })
          .where(and(eq(postsTable.id, item.postId), eq(postsTable.clientId, client.id)));
        applied++;
      }
      if (applied === 0) throw new Error("No matching posts to reschedule");
      return;
    }
    case "shift_posts": {
      const postIds = (payload?.postIds as number[] | undefined) ?? [];
      const delta = Number(payload?.deltaDays ?? 0);
      const ids = Array.from(new Set(postIds));
      const owned = await db
        .select({ id: postsTable.id, scheduledAt: postsTable.scheduledAt })
        .from(postsTable)
        .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, ids)));
      const schedulable = owned.filter((p) => p.scheduledAt);
      if (schedulable.length === 0) throw new Error("No scheduled posts to shift");
      const now = new Date();
      for (const p of schedulable) {
        const scheduledAt = shiftDateByDays(p.scheduledAt ?? null, delta);
        await db
          .update(postsTable)
          .set({ scheduledAt, status: "scheduled", updatedAt: now })
          .where(and(eq(postsTable.id, p.id), eq(postsTable.clientId, client.id)));
      }
      return;
    }
    case "delete_posts": {
      const postIds = (payload?.postIds as number[] | undefined) ?? [];
      const ids = Array.from(new Set(postIds));
      if (ids.length === 0) throw new Error("No posts to delete");
      const deleted = await db
        .delete(postsTable)
        .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, ids)))
        .returning({ id: postsTable.id });
      if (deleted.length === 0) throw new Error("No matching posts to delete");
      return;
    }
    default:
      throw new Error("Unsupported action");
  }
}

router.post("/planner/chat/actions/:actionId/confirm", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const found = await findAction(client.id, String(req.params.actionId));
  if (!found) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (found.action.status !== "proposed") {
    res.status(400).json({ error: "This action has already been resolved" });
    return;
  }

  try {
    await applyAction(client, found.action.kind, found.action.payload);
  } catch (err) {
    req.log.error({ err }, "Failed to apply planner action");
    res.status(400).json({ error: "This change could not be applied." });
    return;
  }

  const next = await persistActionUpdate(found.row.id, found.row.actions, found.idx, {
    ...found.action,
    status: "applied",
  });
  res.json({ action: next, assistantMessage: null });
});

// Apply or reject many proposed actions in one request, grouped by their owning
// message row so each row's JSON `actions` array is read and written exactly
// once, avoiding lost-update races.
async function resolveBatchScoped(
  req: Request,
  client: ClientProfile,
  actionIds: string[],
  mode: "confirm" | "reject",
): Promise<PlannerAction[]> {
  const rows = await db
    .select()
    .from(plannerMessagesTable)
    .where(eq(plannerMessagesTable.clientId, client.id))
    .orderBy(asc(plannerMessagesTable.id));

  const wanted = new Set(actionIds);
  const updatedById = new Map<string, PlannerAction>();

  for (const row of rows) {
    let rowChanged = false;
    const nextActions = row.actions.slice();

    for (let idx = 0; idx < nextActions.length; idx++) {
      const action = nextActions[idx];
      if (!wanted.has(action.id) || action.status !== "proposed") continue;

      if (mode === "confirm") {
        try {
          await applyAction(client, action.kind, action.payload);
        } catch (err) {
          req.log.error({ err }, "Failed to apply planner action in batch");
          continue;
        }
        const next = { ...action, status: "applied" as const };
        nextActions[idx] = next;
        updatedById.set(action.id, next);
        rowChanged = true;
      } else {
        const next = { ...action, status: "rejected" as const, rejectionComment: null };
        nextActions[idx] = next;
        updatedById.set(action.id, next);
        rowChanged = true;
      }
    }

    if (rowChanged) {
      await db
        .update(plannerMessagesTable)
        .set({ actions: nextActions })
        .where(eq(plannerMessagesTable.id, row.id));
    }
  }

  return actionIds.map((id) => updatedById.get(id)).filter((a): a is PlannerAction => !!a);
}

router.post("/planner/chat/actions/confirm-batch", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const raw = req.body?.actionIds;
  const actionIds = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  if (actionIds.length === 0) {
    res.status(400).json({ error: "actionIds is required" });
    return;
  }
  const actions = await resolveBatchScoped(req, client, actionIds, "confirm");
  res.json({ actions });
});

router.post("/planner/chat/actions/reject-batch", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const raw = req.body?.actionIds;
  const actionIds = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  if (actionIds.length === 0) {
    res.status(400).json({ error: "actionIds is required" });
    return;
  }
  const actions = await resolveBatchScoped(req, client, actionIds, "reject");
  res.json({ actions });
});

router.post("/planner/chat/actions/:actionId/reject", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const found = await findAction(client.id, String(req.params.actionId));
  if (!found) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (found.action.status !== "proposed") {
    res.status(400).json({ error: "This action has already been resolved" });
    return;
  }

  const comment =
    typeof req.body?.comment === "string" && req.body.comment.trim()
      ? req.body.comment.trim()
      : null;

  const next = await persistActionUpdate(found.row.id, found.row.actions, found.idx, {
    ...found.action,
    status: "rejected",
    rejectionComment: comment,
  });

  // If the client gave a reason, ask the Planner to revise.
  if (!comment) {
    res.json({ action: next, assistantMessage: null });
    return;
  }

  try {
    const ctx = await loadContext(client.id, client);
    const history = await loadPlannerHistory(client.id);
    const revisionPrompt = `I rejected your proposed change "${found.action.title}". Here is my feedback: ${comment}. Please revise your suggestion accordingly.`;
    const result = await generatePlannerReply({
      context: ctx,
      history,
      userMessage: revisionPrompt,
    });
    const actions = enrichPlannerActions(result.actions, ctx);
    const [assistantMessage] = await db
      .insert(plannerMessagesTable)
      .values({ clientId: client.id, role: "assistant", content: result.reply, actions })
      .returning();
    res.json({ action: next, assistantMessage: serializeMessage(assistantMessage) });
  } catch (err) {
    req.log.error({ err }, "Planner revision generation failed");
    res.status(502).json({ error: "The Planner could not revise. Please try again." });
  }
});

export default router;
