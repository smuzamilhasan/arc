import type { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/express";

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function primaryEmail(user: ClerkUser): string | null {
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  return (primary ?? user.emailAddresses[0])?.emailAddress?.toLowerCase() ?? null;
}

export function clerkUserName(user: ClerkUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || primaryEmail(user) || "Unknown";
}

export async function isAdmin(userId: string): Promise<boolean> {
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  const user = await clerkClient.users.getUser(userId);
  const email = primaryEmail(user);
  return email !== null && admins.includes(email);
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.userId || !(await isAdmin(req.userId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "Admin check failed");
    res.status(403).json({ error: "Forbidden" });
  }
}
