import { Router } from "express";
import { db, auditResultsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { runAndSaveAudit, type AuditProgress } from "../services/audit";
import {
  auditRateLimit,
  auditConcurrencyLimit,
  isAuditInFlight,
  acquireAuditLock,
  releaseAuditLock,
} from "../middlewares/aiRateLimit";
import { logger } from "../lib/logger";

const router = Router();

// Audits older than this are considered stale and eligible for an automatic
// refresh when the client next signs in.
const AUTO_REFRESH_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

function serializeAudit(a: typeof auditResultsTable.$inferSelect) {
  return { ...a, createdAt: a.createdAt.toISOString() };
}

async function getLatestAuditForClient(clientId: number) {
  const [audit] = await db
    .select()
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, clientId))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  return audit;
}

router.get("/audit/latest", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const audit = await getLatestAuditForClient(client.id);
  if (!audit) {
    res.status(404).json({ error: "No audit yet" });
    return;
  }
  res.json(serializeAudit(audit));
});

// Lightweight poll the audit page uses to show a "refreshing" indicator while a
// background auto-refresh (or any audit) is running for this user.
router.get("/audit/refresh-status", async (req, res) => {
  res.json({ refreshing: isAuditInFlight(req.userId!) });
});

router.post("/audit/run", auditRateLimit, auditConcurrencyLimit, async (req, res) => {
  const client = await getClientForUser(req.userId!);
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
    const feedback = typeof req.body?.feedback === "string" ? req.body.feedback : undefined;
    const saved = await runAndSaveAudit(client, send, feedback);

    send({ type: "complete", message: "Audit complete" });
    res.write(`data: ${JSON.stringify({ type: "result", result: serializeAudit(saved) })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Audit run failed");
    send({ type: "error", message: (err as Error).message || "Audit failed" });
  } finally {
    res.end();
  }
});

// Staleness-aware auto-refresh, triggered on sign-in. If the client already has
// at least one audit, it is 14+ days old, and no audit is currently running, a
// fresh audit starts in the background (detached from this request) and we
// respond immediately. Otherwise nothing is started. Never silently starts the
// first-ever audit.
router.post("/audit/auto-refresh", auditRateLimit, async (req, res) => {
  const userId = req.userId!;
  const client = await getClientForUser(userId);
  if (!client) {
    res.json({ started: false, reason: "no_client" });
    return;
  }

  const latest = await getLatestAuditForClient(client.id);
  if (!latest) {
    res.json({ started: false, reason: "no_prior_audit" });
    return;
  }

  const ageMs = Date.now() - latest.createdAt.getTime();
  if (ageMs < AUTO_REFRESH_INTERVAL_MS) {
    res.json({ started: false, reason: "fresh" });
    return;
  }

  if (!acquireAuditLock(userId)) {
    res.json({ started: false, reason: "in_flight" });
    return;
  }

  req.log.info({ clientId: client.id }, "Auto-refresh audit started");
  res.json({ started: true });

  // Detached background run. Keeps the event loop alive via its pending async
  // work; on failure it logs and releases the lock without inserting a row, so
  // the previous audit stays as the latest.
  void (async () => {
    try {
      await runAndSaveAudit(client, () => {});
      logger.info({ clientId: client.id }, "Auto-refresh audit completed");
    } catch (err) {
      logger.error({ err, clientId: client.id }, "Auto-refresh audit failed");
    } finally {
      releaseAuditLock(userId);
    }
  })();
});

export default router;
