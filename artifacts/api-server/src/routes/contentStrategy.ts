import { Router } from "express";
import { db, contentStrategiesTable, platformStrategiesTable } from "@workspace/db";
import { UpdateContentStrategyBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { isBlueprintComplete } from "../services/platforms";
import { generateContentStrategy } from "../services/contentStrategy";

const router = Router();

function serializeContentStrategy(s: typeof contentStrategiesTable.$inferSelect) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function getPlatformStrategyForClient(clientId: number) {
  const [strategy] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, clientId))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  return strategy;
}

router.get("/content-strategy", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [strategy] = await db
    .select()
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .orderBy(desc(contentStrategiesTable.id))
    .limit(1);
  if (!strategy) {
    res.status(404).json({ error: "No content strategy yet" });
    return;
  }
  res.json(serializeContentStrategy(strategy));
});

router.post("/content-strategy/generate", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  if (!isBlueprintComplete(client)) {
    res.status(403).json({ error: "Complete your Blueprint to unlock Content." });
    return;
  }
  const platformStrategy = await getPlatformStrategyForClient(client.id);
  if (!platformStrategy) {
    res
      .status(403)
      .json({ error: "Generate your Platforms strategy to unlock Content." });
    return;
  }

  try {
    const data = await generateContentStrategy(client, platformStrategy);

    const values = {
      clientId: client.id,
      summary: data.summary,
      platformPlan: data.platformPlan,
      contentMix: data.contentMix,
      signatureSeries: data.signatureSeries,
      postFormats: data.postFormats,
      repurposing: data.repurposing,
      closing: data.closing,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(contentStrategiesTable)
      .where(eq(contentStrategiesTable.clientId, client.id))
      .orderBy(desc(contentStrategiesTable.id))
      .limit(1);

    let strategy: typeof contentStrategiesTable.$inferSelect;
    if (existing) {
      [strategy] = await db
        .update(contentStrategiesTable)
        .set(values)
        .where(eq(contentStrategiesTable.id, existing.id))
        .returning();
    } else {
      [strategy] = await db.insert(contentStrategiesTable).values(values).returning();
    }
    res.json(serializeContentStrategy(strategy));
  } catch (err) {
    req.log.error({ err }, "Failed to generate content strategy");
    res.status(502).json({ error: "Content strategy generation failed. Please try again." });
  }
});

router.put("/content-strategy", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = UpdateContentStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid content strategy input" });
    return;
  }
  const [existing] = await db
    .select()
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .orderBy(desc(contentStrategiesTable.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "No content strategy yet" });
    return;
  }
  const [strategy] = await db
    .update(contentStrategiesTable)
    .set({
      summary: parsed.data.summary,
      repurposing: parsed.data.repurposing,
      closing: parsed.data.closing,
      updatedAt: new Date(),
    })
    .where(eq(contentStrategiesTable.id, existing.id))
    .returning();
  res.json(serializeContentStrategy(strategy));
});

export default router;
