import { Router } from "express";
import { db, ideasTable } from "@workspace/db";
import { CreateIdeaBody, DeleteIdeaParams, UpdateIdeaParams, UpdateIdeaBody } from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";

const router = Router();

function serializeIdea(i: typeof ideasTable.$inferSelect) {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
  };
}

router.get("/ideas", async (req, res) => {
  const ideas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt));
  res.json(ideas.map(serializeIdea));
});

router.post("/ideas", async (req, res) => {
  const parsed = CreateIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const [idea] = await db
    .insert(ideasTable)
    .values({
      title: data.title,
      notes: data.notes ?? "",
      platform: data.platform ?? null,
    })
    .returning();
  res.status(201).json(serializeIdea(idea));
});

router.delete("/ideas/:id", async (req, res) => {
  const parsed = DeleteIdeaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(ideasTable).where(eq(ideasTable.id, parsed.data.id));
  res.status(204).send();
});

router.patch("/ideas/:id", async (req, res) => {
  const paramParsed = UpdateIdeaParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateIdeaBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const updates: Partial<typeof ideasTable.$inferInsert> = {};
  const data = bodyParsed.data;
  if (data.title !== undefined) updates.title = data.title;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.platform !== undefined) updates.platform = data.platform;

  const [idea] = await db
    .update(ideasTable)
    .set(updates)
    .where(eq(ideasTable.id, paramParsed.data.id))
    .returning();
  if (!idea) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
  res.json(serializeIdea(idea));
});

export default router;
