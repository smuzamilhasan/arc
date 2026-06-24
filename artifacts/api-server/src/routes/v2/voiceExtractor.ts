// POST /api/v2/voice-extractor/run
//
// Manually triggers voice extraction for the active client. Useful during
// development and for the operator (you) to kick off Muzamil's calibration run
// without waiting for an ingest event.
//
// Body: optional `{ clientId: number }` — defaults to the request's active
// client. Admin scope required to extract for a non-active client.

import { Router, type Request, type Response } from "express";
import { extractForClient } from "../../services/voiceExtractionService";

const router: Router = Router();

router.post("/v2/voice-extractor/run", async (req: Request, res: Response) => {
  const activeClientId = (req as Request & { activeClientId?: number }).activeClientId;
  const bodyClientId = typeof req.body?.clientId === "number" ? req.body.clientId : undefined;

  const targetClientId = bodyClientId ?? activeClientId;
  if (!targetClientId) {
    return res.status(400).json({
      error: "No client context. Provide clientId in body or set an active client.",
    });
  }

  // Authorization: regular users can only trigger for their active client.
  if (bodyClientId && bodyClientId !== activeClientId) {
    const isAdmin = (req as Request & { isAdmin?: boolean }).isAdmin === true;
    if (!isAdmin) {
      return res.status(403).json({ error: "Cannot trigger extraction for another client." });
    }
  }

  const result = await extractForClient(targetClientId);

  if (result.kind === "ok") {
    return res.json({
      status: "ok",
      clientId: result.client_id,
      sampleCount: result.sample_count,
      confidence: result.confidence,
      opsApplied: result.ops_applied,
    });
  }
  if (result.kind === "refused") {
    return res.status(200).json({
      status: "refused",
      clientId: result.client_id,
      reason: result.reason,
    });
  }
  if (result.kind === "skipped") {
    return res.status(200).json({
      status: "skipped",
      clientId: result.client_id,
      reason: result.reason,
    });
  }
  return res.status(500).json({
    status: "error",
    clientId: result.client_id,
    error: result.error,
  });
});

export default router;
