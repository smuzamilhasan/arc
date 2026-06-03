import { Router } from "express";
import { db, auditResultsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getCurrentClient } from "./client";
import { runAudit, type AuditProgress } from "../services/audit";

const router = Router();

function serializeAudit(a: typeof auditResultsTable.$inferSelect) {
  return { ...a, createdAt: a.createdAt.toISOString() };
}

router.get("/audit/latest", async (req, res) => {
  const client = await getCurrentClient();
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [audit] = await db
    .select()
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, client.id))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  if (!audit) {
    res.status(404).json({ error: "No audit yet" });
    return;
  }
  res.json(serializeAudit(audit));
});

router.post("/audit/run", async (req, res) => {
  const client = await getCurrentClient();
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: AuditProgress) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    send({ type: "progress", step: "start", message: `Auditing the presence of ${client.fullName}` });
    const data = await runAudit(client, send);

    const [saved] = await db
      .insert(auditResultsTable)
      .values({
        clientId: client.id,
        seoScore: data.seoScore,
        geoScore: data.geoScore,
        seoFindings: data.seoFindings,
        geoFindings: data.geoFindings,
        recommendations: data.recommendations,
        status: "complete",
      })
      .returning();

    send({ type: "complete", message: "Audit complete" });
    res.write(`data: ${JSON.stringify({ type: "result", result: serializeAudit(saved) })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Audit run failed");
    send({ type: "error", message: (err as Error).message || "Audit failed" });
  } finally {
    res.end();
  }
});

export default router;
