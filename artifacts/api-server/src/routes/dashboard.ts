import { Router } from "express";
import { db, postsTable, ideasTable, auditResultsTable, narrativeProfilesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getClientForUser } from "./client";

const router = Router();

router.get("/dashboard", async (req, res) => {
  const client = await getClientForUser(req.userId!);

  if (!client) {
    res.json({
      clientName: null,
      onboardingComplete: false,
      seoScore: null,
      geoScore: null,
      auditComplete: false,
      narrativeComplete: false,
      totalPosts: 0,
      draftCount: 0,
      scheduledCount: 0,
      publishedCount: 0,
      ideaCount: 0,
      postsByPlatform: [],
      recentPosts: [],
    });
    return;
  }

  const [allPosts, ideas] = await Promise.all([
    db.select().from(postsTable).where(eq(postsTable.clientId, client.id)).orderBy(desc(postsTable.updatedAt)),
    db.select().from(ideasTable).where(eq(ideasTable.clientId, client.id)),
  ]);

  const [latestAudit] = await db
    .select()
    .from(auditResultsTable)
    .where(eq(auditResultsTable.clientId, client.id))
    .orderBy(desc(auditResultsTable.id))
    .limit(1);
  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);

  const totalPosts = allPosts.length;
  const draftCount = allPosts.filter((p) => p.status === "draft").length;
  const scheduledCount = allPosts.filter((p) => p.status === "scheduled").length;
  const publishedCount = allPosts.filter((p) => p.status === "published").length;

  const platformMap: Record<string, number> = {};
  for (const post of allPosts) {
    platformMap[post.platform] = (platformMap[post.platform] ?? 0) + 1;
  }
  const postsByPlatform = Object.entries(platformMap).map(([platform, count]) => ({ platform, count }));

  const recentPosts = allPosts.slice(0, 5).map((p) => ({
    ...p,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  res.json({
    clientName: client.fullName,
    onboardingComplete: client.onboardingComplete,
    seoScore: latestAudit?.seoScore ?? null,
    geoScore: latestAudit?.geoScore ?? null,
    auditComplete: Boolean(latestAudit),
    narrativeComplete: Boolean(narrative && narrative.coreNarrative),
    totalPosts,
    draftCount,
    scheduledCount,
    publishedCount,
    ideaCount: ideas.length,
    postsByPlatform,
    recentPosts,
  });
});

export default router;
