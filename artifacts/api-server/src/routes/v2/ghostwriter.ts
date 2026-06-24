// POST /api/v2/ghostwriter/draft
//
// Body: { brief: string, platform: "linkedin" | "x" | ..., format?: "post" | "thread" | "essay" }
// Returns: DraftResult — kind: "ok" | "refused" | "violation"
//
// Behind requireAuth + activeClient. v1 ghostwriter route is unchanged.

import { Router, type Request, type Response } from "express";
import {
  draftWithGhostwriterV2,
  type DraftRequest,
} from "../../services/ghostwriterV2Service";

const router: Router = Router();

router.post("/api/v2/ghostwriter/draft", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  const brief = typeof req.body?.brief === "string" ? req.body.brief.trim() : "";
  const platform = req.body?.platform;
  const format = req.body?.format;

  if (!brief) return res.status(400).json({ error: "brief required" });
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${[...VALID_PLATFORMS].join(", ")}` });
  }
  if (format && !VALID_FORMATS.has(format)) {
    return res.status(400).json({ error: `format must be one of: ${[...VALID_FORMATS].join(", ")}` });
  }

  const dr: DraftRequest = { clientId, brief, platform, format };

  try {
    const result = await draftWithGhostwriterV2(dr);
    if (result.kind === "ok") {
      return res.json({
        status: "ok",
        draft: result.draft,
        tokens_used: result.tokens_used,
        latency_ms: result.latency_ms,
      });
    }
    if (result.kind === "refused") {
      return res.status(200).json({ status: "refused", reason: result.reason });
    }
    return res.status(500).json({ status: "violation", details: result.details });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "ghostwriter.draft failed",
    });
  }
});

const VALID_PLATFORMS = new Set(["linkedin", "x", "newsletter", "youtube_caption", "blog"]);
const VALID_FORMATS = new Set(["post", "thread", "essay"]);

export default router;
