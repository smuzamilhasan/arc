import { Router } from "express";
import { db, briefingDossiersTable, industryOverviewTable } from "@workspace/db";
import { GenerateDossierBody } from "@workspace/api-zod";
import { agentsGateError } from "../services/foundation";
import { desc, eq } from "drizzle-orm";
import { generateDossier } from "../services/investigator";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

function serializeDossier(d: typeof briefingDossiersTable.$inferSelect) {
  return {
    ...d,
    generatedAt: d.generatedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/dossier", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [dossier] = await db
    .select()
    .from(briefingDossiersTable)
    .where(eq(briefingDossiersTable.clientId, client.id))
    .orderBy(desc(briefingDossiersTable.id))
    .limit(1);
  if (!dossier) {
    res.status(404).json({ error: "No briefing dossier yet" });
    return;
  }
  res.json(serializeDossier(dossier));
});

router.post("/dossier/generate", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }

  const gateError = await agentsGateError(client);
  if (gateError) {
    res.status(403).json({ error: gateError });
    return;
  }

  const body = GenerateDossierBody.safeParse(req.body ?? {});
  const feedback = body.success ? body.data.feedback : undefined;

  const [overview] = await db
    .select()
    .from(industryOverviewTable)
    .where(eq(industryOverviewTable.clientId, client.id))
    .orderBy(desc(industryOverviewTable.id))
    .limit(1);

  try {
    const data = await generateDossier(client, feedback, overview);

    const values = {
      clientId: client.id,
      footprintSummary: data.footprintSummary,
      competitors: data.competitors,
      sources: data.sources,
      generatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(briefingDossiersTable)
      .where(eq(briefingDossiersTable.clientId, client.id))
      .orderBy(desc(briefingDossiersTable.id))
      .limit(1);

    let dossier: typeof briefingDossiersTable.$inferSelect;
    if (existing) {
      [dossier] = await db
        .update(briefingDossiersTable)
        .set(values)
        .where(eq(briefingDossiersTable.id, existing.id))
        .returning();
    } else {
      [dossier] = await db.insert(briefingDossiersTable).values(values).returning();
    }
    res.json(serializeDossier(dossier));
  } catch (err) {
    req.log.error({ err }, "Failed to generate briefing dossier");
    res.status(502).json({ error: "Briefing dossier generation failed. Please try again." });
  }
});

export default router;
