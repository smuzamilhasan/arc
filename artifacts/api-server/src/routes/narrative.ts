import { Router } from "express";
import { db, narrativeProfilesTable } from "@workspace/db";
import { GenerateNarrativeBody, UpdateNarrativeBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { generateNarrative } from "../services/narrative";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

function serializeNarrative(n: typeof narrativeProfilesTable.$inferSelect) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

router.get("/narrative", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);
  if (!narrative) {
    res.status(404).json({ error: "No narrative yet" });
    return;
  }
  res.json(serializeNarrative(narrative));
});

router.put("/narrative", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = UpdateNarrativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [existing] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "No narrative yet" });
    return;
  }

  const [narrative] = await db
    .update(narrativeProfilesTable)
    .set({
      coreNarrative: parsed.data.coreNarrative,
      pointOfView: parsed.data.pointOfView,
      themes: parsed.data.themes,
      recommendedPlatforms: parsed.data.recommendedPlatforms,
      contentHooks: parsed.data.contentHooks,
      updatedAt: new Date(),
    })
    .where(eq(narrativeProfilesTable.id, existing.id))
    .returning();

  res.json(serializeNarrative(narrative));
});

router.post("/narrative/generate", aiGenerationRateLimit, async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = GenerateNarrativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const answers = parsed.data.answers;

  try {
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

    const [existing] = await db
      .select()
      .from(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, client.id))
      .orderBy(desc(narrativeProfilesTable.id))
      .limit(1);

    let narrative: typeof narrativeProfilesTable.$inferSelect;
    if (existing) {
      [narrative] = await db
        .update(narrativeProfilesTable)
        .set(values)
        .where(eq(narrativeProfilesTable.id, existing.id))
        .returning();
    } else {
      [narrative] = await db.insert(narrativeProfilesTable).values(values).returning();
    }
    res.json(serializeNarrative(narrative));
  } catch (err) {
    req.log.error({ err }, "Failed to generate narrative");
    res.status(502).json({ error: "Narrative generation failed. Please try again." });
  }
});

export default router;
