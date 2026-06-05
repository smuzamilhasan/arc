import { Router } from "express";
import { db, ideasTable } from "@workspace/db";
import { CreateIdeaBody, DeleteIdeaParams, UpdateIdeaParams, UpdateIdeaBody } from "@workspace/api-zod";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function serializeIdea(i: typeof ideasTable.$inferSelect) {
  const { clientId: _clientId, ...rest } = i;
  return {
    ...rest,
    createdAt: i.createdAt.toISOString(),
  };
}

router.get("/ideas", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.json([]);
    return;
  }
  const ideas = await db
    .select()
    .from(ideasTable)
    .where(eq(ideasTable.clientId, client.id))
    .orderBy(desc(ideasTable.createdAt));
  res.json(ideas.map(serializeIdea));
});

router.post("/ideas", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = CreateIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const [idea] = await db
    .insert(ideasTable)
    .values({
      clientId: client.id,
      title: data.title,
      notes: data.notes ?? "",
      platform: data.platform ?? null,
    })
    .returning();
  res.status(201).json(serializeIdea(idea));
});

router.delete("/ideas/:id", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
  const parsed = DeleteIdeaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = await db
    .delete(ideasTable)
    .where(and(eq(ideasTable.id, parsed.data.id), eq(ideasTable.clientId, client.id)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
  res.status(204).send();
});

router.patch("/ideas/:id", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
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
    .where(and(eq(ideasTable.id, paramParsed.data.id), eq(ideasTable.clientId, client.id)))
    .returning();
  if (!idea) {
    res.status(404).json({ error: "Idea not found" });
    return;
  }
  res.json(serializeIdea(idea));
});

export default router;
