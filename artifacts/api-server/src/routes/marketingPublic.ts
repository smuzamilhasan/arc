import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { IntakeWebhookLeadBody, IntakeFormLeadBody } from "@workspace/api-zod";
import { captureLead, qualifyInBackground } from "../services/marketingData";

const router = Router();

// Public form intake is unauthenticated, so cap it by IP to stop a single
// source from flooding the funnel (and the AI qualifier behind it).
const intakeFormRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request): string => ipKeyGenerator(req.ip ?? "anonymous"),
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ error: "Too many submissions. Please try again later." });
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

// Inbound webhook from an external lead source (e.g. a CRM or form provider).
// Authenticated by a shared secret header, NOT by Clerk. Fail closed: if no
// secret is configured the endpoint is disabled.
router.post("/marketing/intake/webhook", async (req, res) => {
  const expected = process.env.MARKETING_WEBHOOK_SECRET;
  if (!expected) {
    res.status(503).json({ error: "Webhook intake is not configured." });
    return;
  }
  const provided = req.header("x-marketing-secret");
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Invalid webhook secret." });
    return;
  }
  const parsed = IntakeWebhookLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const lead = await captureLead({
    name: parsed.data.name ?? null,
    email: parsed.data.email,
    company: parsed.data.company ?? null,
    message: parsed.data.message ?? null,
    source: parsed.data.source ?? "webhook",
  });
  qualifyInBackground(lead.id);
  res.status(202).json({ received: true });
});

// Public web-form intake (e.g. arc's marketing site). IP rate-limited.
router.post("/marketing/intake/form", intakeFormRateLimit, async (req, res) => {
  const parsed = IntakeFormLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const lead = await captureLead({
    name: parsed.data.name ?? null,
    email: parsed.data.email,
    company: parsed.data.company ?? null,
    message: parsed.data.message ?? null,
    source: parsed.data.source ?? "form",
  });
  qualifyInBackground(lead.id);
  res.status(202).json({ received: true });
});

export default router;
