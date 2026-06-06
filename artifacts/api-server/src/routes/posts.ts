import { Router } from "express";
import { db, postsTable, ideasTable, narrativeProfilesTable, schedulerConnectionsTable } from "@workspace/db";
import { CreatePostBody, UpdatePostBody, ListPostsQueryParams, GetPostParams, UpdatePostParams, DeletePostParams, ScheduleBatchPostsBody, DraftPostsBody, HandoffPostParams, HandoffPostBody, HandoffBatchPostsBody } from "@workspace/api-zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { aiGenerationRateLimit, externalApiRateLimit } from "../middlewares/aiRateLimit";
import { draftContent } from "../services/ghostwriter";
import { agentsGateError } from "../services/foundation";
import { getProvider } from "../services/schedulers";
import { decryptSecret } from "../lib/crypto";

const router = Router();

function serializePost(p: typeof postsTable.$inferSelect) {
  const { clientId: _clientId, ...rest } = p;
  return {
    ...rest,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/posts", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.json([]);
    return;
  }

  const parsed = ListPostsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const conditions = [eq(postsTable.clientId, client.id)];
  if (params.platform) {
    conditions.push(eq(postsTable.platform, params.platform));
  }
  if (params.status) {
    conditions.push(eq(postsTable.status, params.status));
  }

  const posts = await db
    .select()
    .from(postsTable)
    .where(and(...conditions))
    .orderBy(desc(postsTable.updatedAt));

  res.json(posts.map(serializePost));
});

router.post("/posts", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const [post] = await db
    .insert(postsTable)
    .values({
      clientId: client.id,
      title: data.title,
      content: data.content,
      platform: data.platform,
      status: data.status,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      tags: data.tags ?? [],
    })
    .returning();
  res.status(201).json(serializePost(post));
});

// Compute a concrete scheduled date from a start day, a whole-day offset, and a
// time of day, using numeric Y/M/D parts so the result lands on the intended
// local calendar day with no timezone off-by-one drift. Shared by batch
// scheduling and the Planner's calendar generation. Throws on invalid input.
export function computeScheduledDate(
  startDate: string,
  offsetDays: number,
  time?: string,
): Date {
  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = (time ?? "09:00").split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Invalid date or time");
  }
  return new Date(year, month - 1, day + offsetDays, hour, minute, 0, 0);
}

export type ScheduleClientPostsInput = {
  postIds: number[];
  startDate: string;
  intervalDays?: number;
  time?: string;
};

// Spread a set of the client's existing posts across dates from a start date by
// a fixed day interval, marking each as scheduled. Shared by the
// /posts/schedule-batch route and the assistant's schedule_posts action so both
// apply identical per-client scheduling. Throws on invalid input or when none
// of the given posts belong to the client.
export async function scheduleClientPosts(
  clientId: number,
  input: ScheduleClientPostsInput,
): Promise<(typeof postsTable.$inferSelect)[]> {
  // Validate the start date / time up front (throws on bad input).
  computeScheduledDate(input.startDate, 0, input.time);
  const step = input.intervalDays && input.intervalDays > 0 ? input.intervalDays : 1;

  // De-duplicate while preserving order so the cadence stays even.
  const orderedIds = Array.from(new Set(input.postIds));

  // Only schedule posts that actually belong to this client.
  const owned = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(eq(postsTable.clientId, clientId), inArray(postsTable.id, orderedIds)));
  const ownedSet = new Set(owned.map((p) => p.id));
  const scheduleIds = orderedIds.filter((id) => ownedSet.has(id));

  if (scheduleIds.length === 0) {
    throw new Error("No matching posts to schedule");
  }

  const now = new Date();
  for (let i = 0; i < scheduleIds.length; i++) {
    const scheduledAt = computeScheduledDate(input.startDate, i * step, input.time);
    await db
      .update(postsTable)
      .set({ scheduledAt, status: "scheduled", updatedAt: now })
      .where(and(eq(postsTable.id, scheduleIds[i]), eq(postsTable.clientId, clientId)));
  }

  return db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.clientId, clientId), inArray(postsTable.id, scheduleIds)))
    .orderBy(postsTable.scheduledAt);
}

router.post("/posts/schedule-batch", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = ScheduleBatchPostsBody.safeParse(req.body);
  if (!parsed.success || parsed.data.postIds.length === 0) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { postIds, startDate, intervalDays, time } = parsed.data;

  try {
    const updated = await scheduleClientPosts(client.id, {
      postIds,
      startDate,
      intervalDays,
      time,
    });
    res.json(updated.map(serializePost));
  } catch {
    res.status(400).json({ error: "Invalid input" });
  }
});

// The Ghostwriter: draft platform-appropriate copy in the client's voice. Drafts
// are returned for review and are NOT persisted — the client edits the ones they
// want and saves them via the normal create-post route. Rate-limited because each
// call is an AI generation.
router.post("/posts/draft", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const gateError = await agentsGateError(client);
  if (gateError) {
    res.status(403).json({ error: gateError });
    return;
  }
  const parsed = DraftPostsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;

  // Optionally ground the draft in a saved idea — scoped to this client.
  let ideaTitle: string | undefined;
  let ideaNotes: string | undefined;
  if (data.ideaId !== undefined) {
    const [idea] = await db
      .select()
      .from(ideasTable)
      .where(and(eq(ideasTable.id, data.ideaId), eq(ideasTable.clientId, client.id)));
    if (!idea) {
      res.status(400).json({ error: "Idea not found" });
      return;
    }
    ideaTitle = idea.title;
    ideaNotes = idea.notes ?? undefined;
  }

  // Optionally expand an existing post — its title + skeleton content become the
  // source material the draft expands on. Scoped to this client.
  let postTitle: string | undefined;
  let postContent: string | undefined;
  if (data.postId !== undefined) {
    const [post] = await db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.id, data.postId), eq(postsTable.clientId, client.id)));
    if (!post) {
      res.status(400).json({ error: "Post not found" });
      return;
    }
    postTitle = post.title;
    postContent = post.content;
  }

  // Use the latest narrative for voice/themes if one exists; it's optional.
  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);

  try {
    const result = await draftContent(client, narrative ?? null, {
      format: data.format,
      platform: data.platform,
      brief: data.brief,
      theme: data.theme,
      count: data.count,
      feedback: data.feedback,
      ideaTitle,
      ideaNotes,
      postTitle,
      postContent,
    });
    if (result.drafts.length === 0) {
      res.status(502).json({ error: "The Ghostwriter could not produce a draft. Please try again." });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "ghostwriter draft failed");
    res.status(502).json({ error: "Draft generation failed. Please try again." });
  }
});

// Resolve which connected scheduler to hand a post off to. When `requested` is
// omitted we use the client's single connection (the common case); if several
// are connected, the provider must be specified.
async function resolveConnection(clientId: number, requested?: string) {
  const rows = await db
    .select()
    .from(schedulerConnectionsTable)
    .where(eq(schedulerConnectionsTable.clientId, clientId));
  if (rows.length === 0) return { error: "no-connection" as const };
  if (requested) {
    const match = rows.find((r) => r.provider === requested);
    return match ? { connection: match } : { error: "no-connection" as const };
  }
  if (rows.length === 1) return { connection: rows[0] };
  return { error: "ambiguous" as const };
}

// Push one post to a provider and, on success, record the hand-off state.
// Returns a discriminated result so batch and single callers share the logic.
async function handoffOne(
  clientId: number,
  post: typeof postsTable.$inferSelect,
  connection: typeof schedulerConnectionsTable.$inferSelect,
  overrideScheduledAt?: string | null,
): Promise<{ ok: true; post: typeof postsTable.$inferSelect } | { ok: false; error: string }> {
  const provider = getProvider(connection.provider);
  if (!provider) return { ok: false, error: "Unsupported scheduler" };

  let apiKey: string;
  try {
    apiKey = decryptSecret(connection.apiKeyEncrypted);
  } catch {
    return { ok: false, error: "Stored scheduler key could not be read. Reconnect the scheduler." };
  }

  const scheduledAtIso =
    overrideScheduledAt !== undefined && overrideScheduledAt !== null
      ? overrideScheduledAt
      : post.scheduledAt
        ? post.scheduledAt.toISOString()
        : undefined;

  const result = await provider.createScheduledDraft(apiKey, {
    content: post.content,
    title: post.title,
    scheduledAt: scheduledAtIso,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const now = new Date();
  const [updated] = await db
    .update(postsTable)
    .set({
      handoffProvider: connection.provider,
      handoffAt: now,
      handoffRef: result.url ?? result.externalId ?? null,
      scheduledAt: scheduledAtIso ? new Date(scheduledAtIso) : post.scheduledAt,
      updatedAt: now,
    })
    .where(and(eq(postsTable.id, post.id), eq(postsTable.clientId, clientId)))
    .returning();
  return { ok: true, post: updated };
}

// Push a single post into the client's connected scheduler. arc never publishes
// directly — it only creates a draft/scheduled item in the client's own tool.
router.post("/posts/:id/handoff", externalApiRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const paramParsed = HandoffPostParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = HandoffPostBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [post] = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.id, paramParsed.data.id), eq(postsTable.clientId, client.id)));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const resolved = await resolveConnection(client.id, bodyParsed.data.provider);
  if ("error" in resolved) {
    res.status(409).json({
      error:
        resolved.error === "ambiguous"
          ? "Several schedulers are connected. Specify which one to use."
          : "No scheduler connected. Connect one first.",
    });
    return;
  }

  const result = await handoffOne(
    client.id,
    post,
    resolved.connection,
    bodyParsed.data.scheduledAt ?? undefined,
  );
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.json(serializePost(result.post));
});

// Hand off several posts at once, returning a per-post result so partial
// failures are visible, plus the updated posts.
router.post("/posts/handoff-batch", externalApiRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = HandoffBatchPostsBody.safeParse(req.body);
  if (!parsed.success || parsed.data.postIds.length === 0) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const resolved = await resolveConnection(client.id, parsed.data.provider);
  if ("error" in resolved) {
    res.status(409).json({
      error:
        resolved.error === "ambiguous"
          ? "Several schedulers are connected. Specify which one to use."
          : "No scheduler connected. Connect one first.",
    });
    return;
  }

  const orderedIds = Array.from(new Set(parsed.data.postIds));
  const owned = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, orderedIds)));
  const byId = new Map(owned.map((p) => [p.id, p]));

  const results: { postId: number; ok: boolean; error: string | null }[] = [];
  const updatedPosts: (typeof postsTable.$inferSelect)[] = [];
  for (const id of orderedIds) {
    const post = byId.get(id);
    if (!post) {
      results.push({ postId: id, ok: false, error: "Post not found" });
      continue;
    }
    const r = await handoffOne(client.id, post, resolved.connection);
    if (r.ok) {
      results.push({ postId: id, ok: true, error: null });
      updatedPosts.push(r.post);
    } else {
      results.push({ postId: id, ok: false, error: r.error });
    }
  }

  res.json({ results, posts: updatedPosts.map(serializePost) });
});

router.get("/posts/:id", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const parsed = GetPostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [post] = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.id, parsed.data.id), eq(postsTable.clientId, client.id)));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(serializePost(post));
});

router.patch("/posts/:id", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const paramParsed = UpdatePostParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdatePostBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const updates: Partial<typeof postsTable.$inferInsert> = {};
  const data = bodyParsed.data;
  if (data.title !== undefined) updates.title = data.title;
  if (data.content !== undefined) updates.content = data.content;
  if (data.platform !== undefined) updates.platform = data.platform;
  if (data.status !== undefined) updates.status = data.status;
  if (data.scheduledAt !== undefined) updates.scheduledAt = new Date(data.scheduledAt);
  if (data.tags !== undefined) updates.tags = data.tags;
  updates.updatedAt = new Date();

  const [post] = await db
    .update(postsTable)
    .set(updates)
    .where(and(eq(postsTable.id, paramParsed.data.id), eq(postsTable.clientId, client.id)))
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(serializePost(post));
});

router.delete("/posts/:id", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const parsed = DeletePostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = await db
    .delete(postsTable)
    .where(and(eq(postsTable.id, parsed.data.id), eq(postsTable.clientId, client.id)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.status(204).send();
});

export default router;
