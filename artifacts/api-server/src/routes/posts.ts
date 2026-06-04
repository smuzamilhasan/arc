import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { CreatePostBody, UpdatePostBody, ListPostsQueryParams, GetPostParams, UpdatePostParams, DeletePostParams, ScheduleBatchPostsBody } from "@workspace/api-zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getClientForUser } from "./client";

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

  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = (time ?? "09:00").split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    res.status(400).json({ error: "Invalid date or time" });
    return;
  }
  const step = intervalDays && intervalDays > 0 ? intervalDays : 1;

  // De-duplicate while preserving order so the cadence stays even.
  const orderedIds = Array.from(new Set(postIds));

  // Only schedule posts that actually belong to this client.
  const owned = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, orderedIds)));
  const ownedSet = new Set(owned.map((p) => p.id));
  const scheduleIds = orderedIds.filter((id) => ownedSet.has(id));

  if (scheduleIds.length === 0) {
    res.status(400).json({ error: "No matching posts to schedule" });
    return;
  }

  const now = new Date();
  for (let i = 0; i < scheduleIds.length; i++) {
    const scheduledAt = new Date(year, month - 1, day + i * step, hour, minute, 0, 0);
    await db
      .update(postsTable)
      .set({ scheduledAt, status: "scheduled", updatedAt: now })
      .where(and(eq(postsTable.id, scheduleIds[i]), eq(postsTable.clientId, client.id)));
  }

  const updated = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.clientId, client.id), inArray(postsTable.id, scheduleIds)))
    .orderBy(postsTable.scheduledAt);
  res.json(updated.map(serializePost));
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
