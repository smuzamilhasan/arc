// Progressive-profiling routes.
//
//   GET  /api/v2/profile/completeness        → overall % + per-section + missing
//   GET  /api/v2/profile/next-questions      → top gaps to ask now (?touchpoint=&n=)
//   POST /api/v2/profile/answer              → capture a freeform answer { fieldKey, answer }
//
// Behind requireAuth + activeClient.

import { Router, type Request, type Response } from "express";
import {
  loadSnapshot,
  computeCompleteness,
  nextQuestions,
  captureAnswer,
} from "../../services/profile/progressService";
import type { FieldTouchpoint } from "../../services/profile/fieldRegistry";

const router: Router = Router();

const VALID_TOUCHPOINTS = new Set<FieldTouchpoint>(["onboarding", "micro", "inline", "research"]);

router.get("/v2/profile/completeness", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });
  try {
    const snapshot = await loadSnapshot(clientId);
    return res.json(computeCompleteness(snapshot));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "completeness failed" });
  }
});

router.get("/v2/profile/next-questions", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  const tp = (req.query.touchpoint as FieldTouchpoint) || "micro";
  if (!VALID_TOUCHPOINTS.has(tp)) {
    return res.status(400).json({ error: `touchpoint must be one of ${[...VALID_TOUCHPOINTS].join(", ")}` });
  }
  const n = Math.min(Math.max(Number(req.query.n) || 1, 1), 5);

  try {
    const snapshot = await loadSnapshot(clientId);
    return res.json({ questions: nextQuestions(snapshot, tp, n) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "next-questions failed" });
  }
});

router.post("/v2/profile/answer", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  const fieldKey = typeof req.body?.fieldKey === "string" ? req.body.fieldKey : "";
  const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
  if (!fieldKey || !answer) return res.status(400).json({ error: "fieldKey and answer required" });

  try {
    const result = await captureAnswer(clientId, fieldKey, answer);
    if (result.ok) {
      const snapshot = await loadSnapshot(clientId);
      return res.json({ status: "ok", field: result.field, completeness: computeCompleteness(snapshot) });
    }
    return res.status(200).json({ status: "skipped", reason: result.reason });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "answer failed" });
  }
});

export default router;
