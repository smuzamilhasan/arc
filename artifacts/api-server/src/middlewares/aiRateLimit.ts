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

// Per-user concurrency guard shared by every audit entry point (the manual SSE
// run and the background auto-refresh). One run per user at a time, so a manual
// run and an automatic one can never collide or double-fire.
const auditInFlight = new Set<string>();

// True if an audit (manual or automatic) is already running for this user.
export function isAuditInFlight(userId: string): boolean {
  return auditInFlight.has(userId);
}

// Try to acquire the per-user audit lock. Returns false if one is already held,
// in which case the caller must NOT start a run.
export function acquireAuditLock(userId: string): boolean {
  if (auditInFlight.has(userId)) return false;
  auditInFlight.add(userId);
  return true;
}

// Release the per-user audit lock. Safe to call even if not held.
export function releaseAuditLock(userId: string): void {
  auditInFlight.delete(userId);
}

// Express guard for the audit SSE endpoint. Acquires the per-user lock for the
// lifetime of the request/response and releases it when the response ends.
export function auditConcurrencyLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.userId ?? "";
  if (!acquireAuditLock(userId)) {
    res.status(429).json({ error: "An audit is already running for your account. Please wait for it to finish." });
    return;
  }
  const cleanup = () => releaseAuditLock(userId);
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
}
