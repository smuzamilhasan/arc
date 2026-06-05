import { Router } from "express";
import {
  db,
  clientProfileTable,
  auditResultsTable,
  narrativeProfilesTable,
  postsTable,
  ideasTable,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  isAdmin,
  primaryEmail,
  clerkUserName,
  requireAdmin,
} from "../middlewares/requireAdmin";
import { serializeClient } from "./client";

const router = Router();

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

function serializeAudit(a: typeof auditResultsTable.$inferSelect) {
  return { ...a, createdAt: a.createdAt.toISOString() };
}

function serializeNarrative(n: typeof narrativeProfilesTable.$inferSelect) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

function serializePost(p: typeof postsTable.$inferSelect) {
  const { clientId: _clientId, ...rest } = p;
  return {
    ...rest,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeIdea(i: typeof ideasTable.$inferSelect) {
  const { clientId: _clientId, ...rest } = i;
  return { ...rest, createdAt: i.createdAt.toISOString() };
}

router.get("/admin/access", async (req, res) => {
  const admin = await isAdmin(req.userId!).catch(() => false);
  res.json({ isAdmin: admin });
});

router.get("/admin/users", requireAdmin, async (_req, res) => {
  const clients = await db
    .select()
    .from(clientProfileTable)
    .orderBy(desc(clientProfileTable.createdAt));

  const ids = clients.map((c) => c.id);

  const [posts, ideas, audits, narratives] = ids.length
    ? await Promise.all([
        db
          .select({ clientId: postsTable.clientId })
          .from(postsTable)
          .where(inArray(postsTable.clientId, ids)),
        db
          .select({ clientId: ideasTable.clientId })
          .from(ideasTable)
          .where(inArray(ideasTable.clientId, ids)),
        db
          .select({
            clientId: auditResultsTable.clientId,
            seoScore: auditResultsTable.seoScore,
            geoScore: auditResultsTable.geoScore,
            id: auditResultsTable.id,
          })
          .from(auditResultsTable)
          .where(inArray(auditResultsTable.clientId, ids))
          .orderBy(desc(auditResultsTable.id)),
        db
          .select({
            clientId: narrativeProfilesTable.clientId,
            coreNarrative: narrativeProfilesTable.coreNarrative,
          })
          .from(narrativeProfilesTable)
          .where(inArray(narrativeProfilesTable.clientId, ids)),
      ])
    : [[], [], [], []];

  const postCounts = new Map<number, number>();
  for (const p of posts)
    postCounts.set(p.clientId, (postCounts.get(p.clientId) ?? 0) + 1);

  const ideaCounts = new Map<number, number>();
  for (const i of ideas)
    ideaCounts.set(i.clientId, (ideaCounts.get(i.clientId) ?? 0) + 1);

  // audits are ordered newest-first, so the first seen per client is the latest
  const latestAudit = new Map<number, { seoScore: number; geoScore: number }>();
  for (const a of audits)
    if (!latestAudit.has(a.clientId))
      latestAudit.set(a.clientId, { seoScore: a.seoScore, geoScore: a.geoScore });

  const hasNarrative = new Set<number>();
  for (const n of narratives) if (n.coreNarrative) hasNarrative.add(n.clientId);

  const userIds = [
    ...new Set(
      clients.map((c) => c.userId).filter((id): id is string => id !== null),
    ),
  ];
  const clerkMap = new Map<string, ClerkUser>();
  if (userIds.length) {
    try {
      const list = await clerkClient.users.getUserList({
        userId: userIds,
        limit: Math.min(userIds.length, 500),
      });
      for (const u of list.data) clerkMap.set(u.id, u);
    } catch {
      // If Clerk lookup fails, fall back to profile names only.
    }
  }

  const summaries = clients.map((c) => {
    const clerkUser = c.userId ? clerkMap.get(c.userId) : undefined;
    const audit = latestAudit.get(c.id);
    return {
      clientId: c.id,
      userId: c.userId,
      email: clerkUser ? primaryEmail(clerkUser) : null,
      name: c.fullName || (clerkUser ? clerkUserName(clerkUser) : "Unknown"),
      onboardingComplete: c.onboardingComplete,
      seoScore: audit?.seoScore ?? null,
      geoScore: audit?.geoScore ?? null,
      auditComplete: Boolean(audit),
      narrativeComplete: hasNarrative.has(c.id),
      postCount: postCounts.get(c.id) ?? 0,
      ideaCount: ideaCounts.get(c.id) ?? 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  res.json(summaries);
});

router.get("/admin/users/:clientId", requireAdmin, async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  if (!client) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [posts, ideas, audits, narratives] = await Promise.all([
    db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, clientId))
      .orderBy(desc(postsTable.updatedAt)),
    db
      .select()
      .from(ideasTable)
      .where(eq(ideasTable.clientId, clientId))
      .orderBy(desc(ideasTable.createdAt)),
    db
      .select()
      .from(auditResultsTable)
      .where(eq(auditResultsTable.clientId, clientId))
      .orderBy(desc(auditResultsTable.id))
      .limit(1),
    db
      .select()
      .from(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, clientId))
      .orderBy(desc(narrativeProfilesTable.id))
      .limit(1),
  ]);

  let clerkUser: ClerkUser | null = null;
  if (client.userId) {
    try {
      clerkUser = await clerkClient.users.getUser(client.userId);
    } catch {
      clerkUser = null;
    }
  }

  res.json({
    clientId: client.id,
    userId: client.userId,
    email: clerkUser ? primaryEmail(clerkUser) : null,
    profile: serializeClient(client),
    audit: audits[0] ? serializeAudit(audits[0]) : null,
    narrative: narratives[0] ? serializeNarrative(narratives[0]) : null,
    posts: posts.map(serializePost),
    ideas: ideas.map(serializeIdea),
  });
});

export default router;
