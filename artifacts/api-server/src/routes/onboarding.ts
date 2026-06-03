import { Router } from "express";
import { ExtractPublicInfoBody, GenerateBioBody } from "@workspace/api-zod";
import { extractPublicInfo, generateBio } from "../services/profile";

const router = Router();

router.post("/onboarding/extract", async (req, res) => {
  const parsed = ExtractPublicInfoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const data = await extractPublicInfo(parsed.data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to extract public info");
    res.status(502).json({ error: "Could not gather public info. Please try again or paste your details." });
  }
});

router.post("/onboarding/generate-bio", async (req, res) => {
  const parsed = GenerateBioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const data = await generateBio(parsed.data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to generate bio");
    res.status(502).json({ error: "Could not generate a headline and bio. Please try again." });
  }
});

export default router;
