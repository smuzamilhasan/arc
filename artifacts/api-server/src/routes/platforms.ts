import { Router } from "express";
import { db, platformStrategiesTable } from "@workspace/db";
import { UpdatePlatformsBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { generatePlatformStrategy, isBlueprintComplete } from "../services/platforms";

const router = Router();

function serializePlatformStrategy(s: typeof platformStrategiesTable.$inferSelect) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/platforms", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [strategy] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  if (!strategy) {
    res.status(404).json({ error: "No platform strategy yet" });
    return;
  }
  res.json(serializePlatformStrategy(strategy));
});

router.post("/platforms/generate", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  if (!isBlueprintComplete(client)) {
    res.status(403).json({ error: "Complete your Blueprint to unlock Platforms." });
    return;
  }

  try {
    const data = await generatePlatformStrategy(client);

    const values = {
      clientId: client.id,
      summary: data.summary,
      online: data.online,
      offline: data.offline,
      closing: data.closing,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(platformStrategiesTable)
      .where(eq(platformStrategiesTable.clientId, client.id))
      .orderBy(desc(platformStrategiesTable.id))
      .limit(1);

    let strategy: typeof platformStrategiesTable.$inferSelect;
    if (existing) {
      [strategy] = await db
        .update(platformStrategiesTable)
        .set(values)
        .where(eq(platformStrategiesTable.id, existing.id))
        .returning();
    } else {
      [strategy] = await db.insert(platformStrategiesTable).values(values).returning();
    }
    res.json(serializePlatformStrategy(strategy));
  } catch (err) {
    req.log.error({ err }, "Failed to generate platform strategy");
    res.status(502).json({ error: "Platform strategy generation failed. Please try again." });
  }
});

router.put("/platforms", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = UpdatePlatformsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid platform strategy input" });
    return;
  }
  const [existing] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "No platform strategy yet" });
    return;
  }
  const [strategy] = await db
    .update(platformStrategiesTable)
    .set({
      summary: parsed.data.summary,
      closing: parsed.data.closing,
      updatedAt: new Date(),
    })
    .where(eq(platformStrategiesTable.id, existing.id))
    .returning();
  res.json(serializePlatformStrategy(strategy));
});

export default router;
