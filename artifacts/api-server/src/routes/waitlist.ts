import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod/v4";
import { db, waitlistTable, type WaitlistEntry } from "@workspace/db";

const router = Router();

// Mirror a genuinely-new waitlist signup into the master CRM (Airtable, via a
// Make webhook). Fire-and-forget: never blocks the response, never throws to
// the caller, and is a no-op until MAKE_WAITLIST_WEBHOOK_URL is configured.
async function notifyCrm(entry: WaitlistEntry, req: Request): Promise<void> {
  const url = process.env.MAKE_WAITLIST_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: entry.email,
        source: entry.source,
        postgres_id: entry.id,
        created_at: entry.createdAt,
        site: "buildmyarc.com",
        form: "buildmyarc-waitlist",
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Non-fatal: the row is safely in Postgres; the weekly reconciliation
    // (or a manual backfill) will catch anything the webhook drops.
    req.log.warn({ err }, "CRM waitlist webhook failed (non-fatal)");
  }
}

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
    // `.returning()` gives us the inserted row only when it was genuinely new
    // (empty on conflict), so we mirror to the CRM exactly once per email.
    const [inserted] = await db
      .insert(waitlistTable)
      .values({ email, source: source ?? null })
      .onConflictDoNothing({ target: waitlistTable.email })
      .returning();
    res.status(201).json({ ok: true });

    if (inserted) {
      void notifyCrm(inserted, req);
    }
  } catch (err) {
    req.log.error({ err }, "Waitlist signup failed");
    res.status(500).json({ error: "Could not join the list right now." });
  }
});

export default router;
