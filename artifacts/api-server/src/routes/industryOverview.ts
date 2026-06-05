import { Router } from "express";
import {
  db,
  industryOverviewTable,
  auditResultsTable,
  narrativeProfilesTable,
  platformStrategiesTable,
} from "@workspace/db";
import { GenerateIndustryOverviewBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { generateIndustryOverview } from "../services/industryOverview";
import { isBlueprintComplete } from "../services/platforms";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

function serializeIndustryOverview(o: typeof industryOverviewTable.$inferSelect) {
  return {
    ...o,
    generatedAt: o.generatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  };
}

// True only once the entire foundation is in place: a complete Blueprint plus an
// audit, a narrative, and a platform strategy. Mirrors isFoundationComplete in
// the web app's src/lib/blueprint.ts so the capstone lock is enforced
// server-side too — the panel cannot be generated until everything before it is.
async function isFoundationComplete(
  client: Parameters<typeof isBlueprintComplete>[0] & { id: number },
): Promise<boolean> {
  if (!isBlueprintComplete(client)) return false;
  const [audit] = await db
    .select({ id: auditResultsTable.id })
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, client.id))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  if (!audit) return false;
  const [narrative] = await db
    .select({ coreNarrative: narrativeProfilesTable.coreNarrative })
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);
  if (!narrative || !narrative.coreNarrative) return false;
  const [platforms] = await db
    .select({ id: platformStrategiesTable.id })
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);
  if (!platforms) return false;
  return true;
}

router.get("/industry-overview", async (req, res) => {
  const client = await getClientForUser(req.userId!);
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
  const client = await getClientForUser(req.userId!);
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
