import { Router } from "express";
import { db, postsTable, ideasTable, narrativeProfilesTable } from "@workspace/db";
import { CreatePostBody, UpdatePostBody, ListPostsQueryParams, GetPostParams, UpdatePostParams, DeletePostParams, ScheduleBatchPostsBody, DraftPostsBody } from "@workspace/api-zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getClientForUser } from "./client";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";
import { draftContent } from "../services/ghostwriter";

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
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
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

router.get("/posts/:id", async (req, res) => {
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
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
