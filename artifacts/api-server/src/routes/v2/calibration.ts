// Calibration routes — drive the /app/calibrate UI.
//
//   POST /api/v2/calibration/preview-from-handle  → run full Apify pipeline,
//                                                   return extractor result
//                                                   WITHOUT applying patch
//   POST /api/v2/calibration/preview-from-json    → same, but skip Apify and
//                                                   normalize an uploaded JSON
//                                                   payload directly
//   POST /api/v2/calibration/apply                → apply a previously-previewed
//                                                   ProfilePatch
//
// All routes behind requireAuth + activeClient.

import { Router, type Request, type Response } from "express";
import {
  previewFromHandle,
  previewFromJson,
  applyReviewedPatch,
} from "../../services/calibrationService";
import { profilePatchSchema } from "../../agents-v2/contracts/profilePatch";

const router: Router = Router();

const VALID_SOURCES = new Set([
  "linkedin",
  "x",
  "youtube_transcript",
]);

router.post(
  "/v2/calibration/preview-from-handle",
  async (req: Request, res: Response) => {
    const clientId = (req as Request & { activeClientId?: number }).activeClientId;
    if (!clientId) return res.status(400).json({ error: "No active client" });

    const source = req.body?.source;
    const handle = req.body?.handle;
    const maxItems = req.body?.maxItems;

    if (!source || !VALID_SOURCES.has(source)) {
      return res
        .status(400)
        .json({ error: `source must be one of: ${[...VALID_SOURCES].join(", ")}` });
    }
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return res.status(400).json({ error: "handle required" });
    }

    try {
      const result = await previewFromHandle({
        clientId,
        source,
        handle: handle.trim(),
        maxItems: typeof maxItems === "number" ? maxItems : 100,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "preview failed",
      });
    }
  }
);

router.post(
  "/v2/calibration/preview-from-json",
  async (req: Request, res: Response) => {
    const clientId = (req as Request & { activeClientId?: number }).activeClientId;
    if (!clientId) return res.status(400).json({ error: "No active client" });

    const source = req.body?.source;
    const rawItems = req.body?.rawItems;

    if (!source || !VALID_SOURCES.has(source)) {
      return res
        .status(400)
        .json({ error: `source must be one of: ${[...VALID_SOURCES].join(", ")}` });
    }
    if (!Array.isArray(rawItems)) {
      return res.status(400).json({ error: "rawItems must be an array" });
    }
    if (rawItems.length === 0) {
      return res.status(400).json({ error: "rawItems is empty" });
    }
    if (rawItems.length > 500) {
      return res.status(400).json({ error: "rawItems too large; cap is 500" });
    }

    try {
      const result = await previewFromJson({ clientId, source, rawItems });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "preview failed",
      });
    }
  }
);

router.post("/v2/calibration/apply", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  let patch;
  try {
    patch = profilePatchSchema.parse(req.body?.patch);
  } catch (err) {
    return res.status(400).json({
      error: `invalid patch: ${err instanceof Error ? err.message : "validation failed"}`,
    });
  }

  if (patch.client_id !== clientId) {
    return res
      .status(403)
      .json({ error: "patch.client_id does not match active client" });
  }

  try {
    const result = await applyReviewedPatch(patch);
    return res.json({ status: "ok", result });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "apply failed",
    });
  }
});

export default router;
