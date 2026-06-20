import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod/v4";
import { db, waitlistTable } from "@workspace/db";

const router = Router();

// Public, unauthenticated "Get early access" intake from the marketing landing.
// IP rate-limited so a single source can't flood the list.
const waitlistRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request): string => ipKeyGenerator(req.ip ?? "anonymous"),
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ error: "Too many requests. Please try again later." });
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const WaitlistBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  source: z.string().trim().max(200).optional(),
});

router.post("/waitlist", waitlistRateLimit, async (req, res) => {
  const parsed = WaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid email." });
    return;
  }
  const { email, source } = parsed.data;
  try {
    // Idempotent: a repeat signup is a success, not a duplicate-key error.
    await db
      .insert(waitlistTable)
      .values({ email, source: source ?? null })
      .onConflictDoNothing({ target: waitlistTable.email });
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Waitlist signup failed");
    res.status(500).json({ error: "Could not join the list right now." });
  }
});

export default router;
