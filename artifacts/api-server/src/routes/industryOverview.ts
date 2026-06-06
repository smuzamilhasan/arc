import { Router } from "express";
import { db, industryOverviewTable } from "@workspace/db";
import { GenerateIndustryOverviewBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { generateIndustryOverview } from "../services/industryOverview";
import { isFoundationComplete } from "../services/foundation";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

function serializeIndustryOverview(o: typeof industryOverviewTable.$inferSelect) {
  return {
    ...o,
    generatedAt: o.generatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  };
}

router.get("/industry-overview", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [overview] = await db
    .select()
    .from(industryOverviewTable)
    .where(eq(industryOverviewTable.clientId, client.id))
    .orderBy(desc(industryOverviewTable.id))
    .limit(1);
  if (!overview) {
    res.status(404).json({ error: "No industry overview yet" });
    return;
  }
  res.json(serializeIndustryOverview(overview));
});

router.post("/industry-overview/generate", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  if (!(await isFoundationComplete(client))) {
    res.status(403).json({
      error: "Complete your Blueprint, Audit, Narrative, and Platforms to unlock the Industry Overview.",
    });
    return;
  }

  const body = GenerateIndustryOverviewBody.safeParse(req.body ?? {});
  const feedback = body.success ? body.data.feedback : undefined;

  try {
    const data = await generateIndustryOverview(client, feedback);

    const values = {
      clientId: client.id,
      industry: data.industry,
      geographyFocus: data.geographyFocus,
      landscapeContext: data.landscapeContext,
      competitors: data.competitors,
      thoughtLeaders: data.thoughtLeaders,
      playbook: data.playbook,
      sources: data.sources,
      generatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(industryOverviewTable)
      .where(eq(industryOverviewTable.clientId, client.id))
      .orderBy(desc(industryOverviewTable.id))
      .limit(1);

    let overview: typeof industryOverviewTable.$inferSelect;
    if (existing) {
      [overview] = await db
        .update(industryOverviewTable)
        .set(values)
        .where(eq(industryOverviewTable.id, existing.id))
        .returning();
    } else {
      [overview] = await db.insert(industryOverviewTable).values(values).returning();
    }
    res.json(serializeIndustryOverview(overview));
  } catch (err) {
    req.log.error({ err }, "Failed to generate industry overview");
    res.status(502).json({ error: "Industry overview generation failed. Please try again." });
  }
});

export default router;
