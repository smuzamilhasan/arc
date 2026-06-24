// Onboarder routes — start / answer / status.
//
//   POST /api/v2/onboarder/start    → begin (or resume) a session; returns first agent turn
//   POST /api/v2/onboarder/answer   → submit a user answer; returns next agent turn
//   GET  /api/v2/onboarder/status   → fetch the active session for the active client
//
// All routes are mounted behind requireAuth + activeClient.

import { Router, type Request, type Response } from "express";
import {
  startSession,
  submitAnswer,
  getActiveSession,
} from "../../services/onboardingSessionService";

const router: Router = Router();

router.post("/v2/onboarder/start", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  try {
    const result = await startSession(clientId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "onboarder.start failed",
    });
  }
});

router.post("/v2/onboarder/answer", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  const sessionId = Number(req.body?.sessionId);
  const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
  if (!sessionId || !answer) {
    return res.status(400).json({ error: "sessionId and answer required" });
  }

  try {
    const result = await submitAnswer(sessionId, answer);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "onboarder.answer failed",
    });
  }
});

router.get("/v2/onboarder/status", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  const session = await getActiveSession(clientId);
  if (!session) return res.json({ active: false });

  return res.json({
    active: true,
    sessionId: session.id,
    startedAt: session.startedAt,
    lastTurnAt: session.lastTurnAt,
    turnCount: session.turnCount,
    aggregateConfidence: session.aggregateConfidence,
    slotCoverage: session.slotCoverage,
    log: session.log,
  });
});

export default router;
