import { Router } from "express";
import {
  db,
  profilePortraitsTable,
  narrativeProfilesTable,
  platformStrategiesTable,
  contentStrategiesTable,
  type ClientProfile,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { SystemContext } from "../services/assistant";
import { generatePortrait, portraitSourceHash } from "../services/portrait";
import { GeneratePortraitBody } from "@workspace/api-zod";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

// Load only the foundational pieces needed for the portrait (profile +
// narrative + platform/content strategy). Posts/ideas/audit are intentionally
// omitted — the portrait describes the person, not their content queue.
async function loadFoundation(client: ClientProfile): Promise<SystemContext> {
  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);
  const [platforms] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  const [contentStrategy] = await db
    .select()
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .orderBy(desc(contentStrategiesTable.id))
    .limit(1);
  return { client, narrative, platforms, contentStrategy, posts: [], ideas: [] };
}

function serializePortrait(
  p: typeof profilePortraitsTable.$inferSelect,
  stale: boolean,
) {
  return {
    id: p.id,
    clientId: p.clientId,
    headline: p.headline,
    summary: p.summary,
    sections: p.sections,
    stale,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/portrait", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [portrait] = await db
    .select()
    .from(profilePortraitsTable)
    .where(eq(profilePortraitsTable.clientId, client.id))
    .orderBy(desc(profilePortraitsTable.id))
    .limit(1);
  if (!portrait) {
    res.status(404).json({ error: "No portrait yet" });
    return;
  }
  const ctx = await loadFoundation(client);
  const stale = portraitSourceHash(ctx) !== portrait.sourceHash;
  res.json(serializePortrait(portrait, stale));
});

router.post("/portrait/generate", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }

  const body = GeneratePortraitBody.safeParse(req.body ?? {});
  const feedback = body.success ? body.data.feedback : undefined;

  try {
    const ctx = await loadFoundation(client);
    const data = await generatePortrait(ctx, feedback);
    const values = {
      clientId: client.id,
      headline: data.headline,
      summary: data.summary,
      sections: data.sections,
      sourceHash: portraitSourceHash(ctx),
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(profilePortraitsTable)
      .where(eq(profilePortraitsTable.clientId, client.id))
      .orderBy(desc(profilePortraitsTable.id))
      .limit(1);

    let portrait: typeof profilePortraitsTable.$inferSelect;
    if (existing) {
      [portrait] = await db
        .update(profilePortraitsTable)
        .set(values)
        .where(eq(profilePortraitsTable.id, existing.id))
        .returning();
    } else {
      [portrait] = await db.insert(profilePortraitsTable).values(values).returning();
    }
    res.json(serializePortrait(portrait, false));
  } catch (err) {
    req.log.error({ err }, "Failed to generate portrait");
    res.status(502).json({ error: "Portrait generation failed. Please try again." });
  }
});

export default router;
