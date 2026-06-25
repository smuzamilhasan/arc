// GET /api/v2/profile — the full v2 operating profile for the active client.
// Read-only; used by the /app/profile-v2 viewer.

import { Router, type Request, type Response } from "express";
import { getProfileV2 } from "../../services/profileV2Service";

const router: Router = Router();

router.get("/v2/profile", async (req: Request, res: Response) => {
  const clientId = (req as Request & { activeClientId?: number }).activeClientId;
  if (!clientId) return res.status(400).json({ error: "No active client" });

  try {
    const profile = await getProfileV2(clientId);
    if (!profile) return res.status(404).json({ error: "No profile" });
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "profile read failed" });
  }
});

export default router;
