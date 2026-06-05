import type { Request, Response, NextFunction } from "express";
import {
  db,
  clientProfileTable,
  agencyMembersTable,
  agencyClientAccessTable,
  type ClientProfile,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // The client profile the request operates on: the caller's own profile,
      // or an agency-managed client selected via the active-client header.
      activeClient?: ClientProfile;
      activeClientId?: number;
    }
  }
}

export const ACTIVE_CLIENT_HEADER = "x-arc-client-id";

export async function getAgencyIdsForUser(userId: string): Promise<number[]> {
  const rows = await db
    .select({ agencyId: agencyMembersTable.agencyId })
    .from(agencyMembersTable)
    .where(eq(agencyMembersTable.userId, userId));
  return rows.map((r) => r.agencyId);
}

// A user may access a client profile if it is their own, or if it belongs to
// an agency they are a member of (via an access grant).
export async function userCanAccessClient(
  userId: string,
  clientId: number,
): Promise<boolean> {
  const [own] = await db
    .select({ id: clientProfileTable.id })
    .from(clientProfileTable)
    .where(
      and(eq(clientProfileTable.id, clientId), eq(clientProfileTable.userId, userId)),
    )
    .limit(1);
  if (own) return true;

  const agencyIds = await getAgencyIdsForUser(userId);
  if (agencyIds.length === 0) return false;
  const [grant] = await db
    .select({ id: agencyClientAccessTable.id })
    .from(agencyClientAccessTable)
    .where(
      and(
        eq(agencyClientAccessTable.clientId, clientId),
        inArray(agencyClientAccessTable.agencyId, agencyIds),
      ),
    )
    .limit(1);
  return Boolean(grant);
}

// Resolves req.activeClient. With the active-client header present, the request
// targets that specific client (after an access check). Without it, the request
// falls back to the caller's own profile, preserving single-client behavior.
export async function attachActiveClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      next();
      return;
    }
    const header = req.header(ACTIVE_CLIENT_HEADER);
    if (header) {
      const clientId = Number(header);
      if (!Number.isInteger(clientId) || clientId <= 0) {
        res.status(400).json({ error: "Invalid client id" });
        return;
      }
      const ok = await userCanAccessClient(userId, clientId);
      if (!ok) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const [client] = await db
        .select()
        .from(clientProfileTable)
        .where(eq(clientProfileTable.id, clientId))
        .limit(1);
      if (!client) {
        res.status(404).json({ error: "No client profile yet" });
        return;
      }
      req.activeClient = client;
      req.activeClientId = client.id;
    } else {
      const [own] = await db
        .select()
        .from(clientProfileTable)
        .where(eq(clientProfileTable.userId, userId))
        .limit(1);
      if (own) {
        req.activeClient = own;
        req.activeClientId = own.id;
      }
    }
    next();
  } catch (err) {
    req.log.error({ err }, "attachActiveClient failed");
    res.status(500).json({ error: "Internal error" });
  }
}
