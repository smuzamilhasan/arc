import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { CreatePostBody, UpdatePostBody, ListPostsQueryParams, GetPostParams, UpdatePostParams, DeletePostParams } from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";

const router = Router();

function serializePost(p: typeof postsTable.$inferSelect) {
  return {
    ...p,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/posts", async (req, res) => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  let query = db.select().from(postsTable).$dynamic();

  const conditions = [];
  if (params.platform) {
    conditions.push(eq(postsTable.platform, params.platform));
  }
  if (params.status) {
    conditions.push(eq(postsTable.status, params.status));
  }

  const posts = await db
    .select()
    .from(postsTable)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(postsTable.updatedAt));

  res.json(posts.map(serializePost));
});

router.post("/posts", async (req, res) => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const [post] = await db
    .insert(postsTable)
    .values({
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

router.get("/posts/:id", async (req, res) => {
  const parsed = GetPostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, parsed.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(serializePost(post));
});

router.patch("/posts/:id", async (req, res) => {
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
    .where(eq(postsTable.id, paramParsed.data.id))
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(serializePost(post));
});

router.delete("/posts/:id", async (req, res) => {
  const parsed = DeletePostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(postsTable).where(eq(postsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
