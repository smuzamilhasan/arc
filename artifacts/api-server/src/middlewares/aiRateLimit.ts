import { rateLimit } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

// Key requests by the authenticated user ID, not by IP.
// requireAuth runs before these limiters, so req.userId is always set.
function userKeyGenerator(req: Request): string {
  return req.userId ?? req.ip ?? "anonymous";
}

function tooManyRequestsHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: "Too many requests. Please wait before trying again.",
  });
}

// Standard limiter for AI generation endpoints that are moderately expensive:
// narrative, platforms, content-strategy, onboarding helpers, assistant messages.
// 20 calls per user per hour.
export const aiGenerationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: userKeyGenerator,
  handler: tooManyRequestsHandler,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipFailedRequests: false,
});

// Strict limiter for the audit endpoint — one run triggers up to 7 provider
// calls with live web-search grounding, so abuse is very high cost.
// 5 audit runs per user per hour.
export const auditRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: userKeyGenerator,
  handler: tooManyRequestsHandler,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipFailedRequests: false,
});

// Per-user concurrency guard for the audit SSE endpoint.
// Prevents a single user from running multiple audits simultaneously.
const auditInFlight = new Set<string>();

export function auditConcurrencyLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.userId ?? "";
  if (auditInFlight.has(userId)) {
    res.status(429).json({ error: "An audit is already running for your account. Please wait for it to finish." });
    return;
  }
  auditInFlight.add(userId);
  const cleanup = () => auditInFlight.delete(userId);
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
}
