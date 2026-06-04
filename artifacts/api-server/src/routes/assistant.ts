import { Router, type Request } from "express";
import {
  db,
  assistantMessagesTable,
  clientProfileTable,
  narrativeProfilesTable,
  platformStrategiesTable,
  contentStrategiesTable,
  postsTable,
  ideasTable,
  auditResultsTable,
  type AssistantAction,
  type AssistantActionKind,
  type ClientProfile,
} from "@workspace/db";
import { asc, desc, eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getClientForUser } from "./client";
import {
  generateAssistantReply,
  buildDiff,
  type SystemContext,
  type HistoryTurn,
  type ProposedAction,
} from "../services/assistant";
import { generateNarrative } from "../services/narrative";

const router = Router();

function serializeMessage(m: typeof assistantMessagesTable.$inferSelect) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    actions: m.actions,
    createdAt: m.createdAt.toISOString(),
  };
}

async function loadContext(clientId: number, client: ClientProfile): Promise<SystemContext> {
  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, clientId))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);
  const [platforms] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, clientId))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  const [contentStrategy] = await db
    .select()
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, clientId))
    .orderBy(desc(contentStrategiesTable.id))
    .limit(1);
  const [audit] = await db
    .select()
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, clientId))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.clientId, clientId))
    .orderBy(desc(postsTable.updatedAt));
  const ideas = await db
    .select()
    .from(ideasTable)
    .where(eq(ideasTable.clientId, clientId))
    .orderBy(desc(ideasTable.createdAt));

  return { client, narrative, platforms, contentStrategy, audit, posts, ideas };
}

async function loadHistory(clientId: number): Promise<HistoryTurn[]> {
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.clientId, clientId))
    .orderBy(asc(assistantMessagesTable.id));
  return rows
    .slice(-20)
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

// Turn the model's proposed actions into persisted AssistantAction records,
// enriching each with an id, "proposed" status, and a computed before -> after diff.
function enrichActions(proposed: ProposedAction[], ctx: SystemContext): AssistantAction[] {
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

router.get("/assistant/messages", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.clientId, client.id))
    .orderBy(asc(assistantMessagesTable.id));
  res.json(rows.map(serializeMessage));
});

router.post("/assistant/message", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const [userMessage] = await db
    .insert(assistantMessagesTable)
    .values({ clientId: client.id, role: "user", content, actions: [] })
    .returning();

  try {
    const ctx = await loadContext(client.id, client);
    const history = await loadHistory(client.id);
    const result = await generateAssistantReply({
      context: ctx,
      history: history.slice(0, -1),
      userMessage: content,
    });
    const actions = enrichActions(result.actions, ctx);

    const [assistantMessage] = await db
      .insert(assistantMessagesTable)
      .values({ clientId: client.id, role: "assistant", content: result.reply, actions })
      .returning();

    res.json({
      userMessage: serializeMessage(userMessage),
      assistantMessage: serializeMessage(assistantMessage),
    });
  } catch (err) {
    req.log.error({ err }, "Assistant reply generation failed");
    res.status(502).json({ error: "The assistant could not respond. Please try again." });
  }
});

// Locate the persisted message + action by the action's uuid, scoped to client.
async function findAction(clientId: number, actionId: string) {
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.clientId, clientId))
    .orderBy(asc(assistantMessagesTable.id));
  for (const row of rows) {
    const idx = row.actions.findIndex((a) => a.id === actionId);
    if (idx !== -1) return { row, idx, action: row.actions[idx] };
  }
  return null;
}

async function persistActionUpdate(
  rowId: number,
  actions: AssistantAction[],
  idx: number,
  next: AssistantAction,
) {
  const updated = actions.slice();
  updated[idx] = next;
  await db
    .update(assistantMessagesTable)
    .set({ actions: updated })
    .where(eq(assistantMessagesTable.id, rowId));
  return next;
}

// Apply a confirmed action against the underlying system using per-client
// scoping. Throws on any validation/lookup failure.
async function applyAction(
  client: ClientProfile,
  kind: AssistantActionKind,
  payload: Record<string, unknown> | null,
): Promise<void> {
  switch (kind) {
    case "update_profile": {
      await db
        .update(clientProfileTable)
        .set({ ...(payload ?? {}), updatedAt: new Date() })
        .where(eq(clientProfileTable.id, client.id));
      return;
    }
    case "update_narrative": {
      const [existing] = await db
        .select()
        .from(narrativeProfilesTable)
        .where(eq(narrativeProfilesTable.clientId, client.id))
        .orderBy(desc(narrativeProfilesTable.id))
        .limit(1);
      if (!existing) throw new Error("No narrative to update");
      await db
        .update(narrativeProfilesTable)
        .set({ ...(payload ?? {}), updatedAt: new Date() })
        .where(eq(narrativeProfilesTable.id, existing.id));
      return;
    }
    case "regenerate_narrative": {
      const [existing] = await db
        .select()
        .from(narrativeProfilesTable)
        .where(eq(narrativeProfilesTable.clientId, client.id))
        .orderBy(desc(narrativeProfilesTable.id))
        .limit(1);
      const answers = existing?.industryAnswers ?? [];
      const data = await generateNarrative(client, answers);
      const values = {
        clientId: client.id,
        industryAnswers: answers,
        coreNarrative: data.coreNarrative,
        pointOfView: data.pointOfView,
        themes: data.themes,
        recommendedPlatforms: data.recommendedPlatforms,
        contentHooks: data.contentHooks,
        updatedAt: new Date(),
      };
      if (existing) {
        await db
          .update(narrativeProfilesTable)
          .set(values)
          .where(eq(narrativeProfilesTable.id, existing.id));
      } else {
        await db.insert(narrativeProfilesTable).values(values);
      }
      return;
    }
    case "update_content_strategy": {
      const [existing] = await db
        .select()
        .from(contentStrategiesTable)
        .where(eq(contentStrategiesTable.clientId, client.id))
        .orderBy(desc(contentStrategiesTable.id))
        .limit(1);
      if (!existing) throw new Error("No content strategy to update");
      await db
        .update(contentStrategiesTable)
        .set({ ...(payload ?? {}), updatedAt: new Date() })
        .where(eq(contentStrategiesTable.id, existing.id));
      return;
    }
    case "update_platforms": {
      const [existing] = await db
        .select()
        .from(platformStrategiesTable)
        .where(eq(platformStrategiesTable.clientId, client.id))
        .orderBy(desc(platformStrategiesTable.id))
        .limit(1);
      if (!existing) throw new Error("No platform strategy to update");
      await db
        .update(platformStrategiesTable)
        .set({ ...(payload ?? {}), updatedAt: new Date() })
        .where(eq(platformStrategiesTable.id, existing.id));
      return;
    }
    case "create_post": {
      const p = payload ?? {};
      await db.insert(postsTable).values({
        clientId: client.id,
        title: p.title as string,
        content: (p.content as string) ?? "",
        platform: p.platform as string,
        status: p.status as string,
        scheduledAt: p.scheduledAt ? new Date(p.scheduledAt as string) : null,
        tags: (p.tags as string[]) ?? [],
      });
      return;
    }
    case "update_post": {
      const p = payload ?? {};
      const { id, scheduledAt, ...rest } = p as Record<string, unknown>;
      const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt as string);
      const updated = await db
        .update(postsTable)
        .set(updates)
        .where(and(eq(postsTable.id, id as number), eq(postsTable.clientId, client.id)))
        .returning();
      if (updated.length === 0) throw new Error("Post not found");
      return;
    }
    case "create_idea": {
      const p = payload ?? {};
      await db.insert(ideasTable).values({
        clientId: client.id,
        title: p.title as string,
        notes: (p.notes as string) ?? "",
        platform: (p.platform as string) ?? null,
      });
      return;
    }
    case "update_idea": {
      const p = payload ?? {};
      const { id, ...rest } = p as Record<string, unknown>;
      const updated = await db
        .update(ideasTable)
        .set(rest)
        .where(and(eq(ideasTable.id, id as number), eq(ideasTable.clientId, client.id)))
        .returning();
      if (updated.length === 0) throw new Error("Idea not found");
      return;
    }
    default:
      throw new Error("Unsupported action");
  }
}

router.post("/assistant/actions/:actionId/confirm", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const found = await findAction(client.id, req.params.actionId);
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
    req.log.error({ err }, "Failed to apply assistant action");
    res.status(400).json({ error: "This change could not be applied." });
    return;
  }

  const next = await persistActionUpdate(found.row.id, found.row.actions, found.idx, {
    ...found.action,
    status: "applied",
  });
  res.json({ action: next, assistantMessage: null });
});

// Apply or reject many proposed actions in one request. Actions are grouped by
// their owning message row so each row's JSON `actions` array is read and
// written exactly once, avoiding the lost-update races that parallel
// single-action requests on the same row would cause.
async function resolveBatchScoped(
  req: Request,
  client: ClientProfile,
  actionIds: string[],
  mode: "confirm" | "reject",
): Promise<AssistantAction[]> {
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.clientId, client.id))
    .orderBy(asc(assistantMessagesTable.id));

  const wanted = new Set(actionIds);
  const updatedById = new Map<string, AssistantAction>();

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
          req.log.error({ err }, "Failed to apply assistant action in batch");
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
        .update(assistantMessagesTable)
        .set({ actions: nextActions })
        .where(eq(assistantMessagesTable.id, row.id));
    }
  }

  return actionIds.map((id) => updatedById.get(id)).filter((a): a is AssistantAction => !!a);
}

router.post("/assistant/actions/confirm-batch", async (req, res) => {
  const client = await getClientForUser(req.userId!);
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

router.post("/assistant/actions/reject-batch", async (req, res) => {
  const client = await getClientForUser(req.userId!);
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

router.post("/assistant/actions/:actionId/reject", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const found = await findAction(client.id, req.params.actionId);
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

  // If the client gave a reason, ask the assistant to revise.
  if (!comment) {
    res.json({ action: next, assistantMessage: null });
    return;
  }

  try {
    const ctx = await loadContext(client.id, client);
    const history = await loadHistory(client.id);
    const revisionPrompt = `I rejected your proposed change "${found.action.title}". Here is my feedback: ${comment}. Please revise your suggestion accordingly.`;
    const result = await generateAssistantReply({
      context: ctx,
      history,
      userMessage: revisionPrompt,
    });
    const actions = enrichActions(result.actions, ctx);
    const [assistantMessage] = await db
      .insert(assistantMessagesTable)
      .values({ clientId: client.id, role: "assistant", content: result.reply, actions })
      .returning();
    res.json({ action: next, assistantMessage: serializeMessage(assistantMessage) });
  } catch (err) {
    req.log.error({ err }, "Assistant revision generation failed");
    res.status(502).json({ error: "The assistant could not revise. Please try again." });
  }
});

export default router;
