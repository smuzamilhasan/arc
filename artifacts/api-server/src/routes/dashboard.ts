import { Router } from "express";
import { db, postsTable, ideasTable, auditResultsTable, narrativeProfilesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getCurrentClient } from "./client";

const router = Router();

router.get("/dashboard", async (req, res) => {
  const client = await getCurrentClient();

  const [allPosts, ideas] = await Promise.all([
    db.select().from(postsTable).orderBy(desc(postsTable.updatedAt)),
    db.select().from(ideasTable),
  ]);

  let latestAudit: typeof auditResultsTable.$inferSelect | undefined;
  let narrative: typeof narrativeProfilesTable.$inferSelect | undefined;
  if (client) {
    [latestAudit] = await db
      .select()
      .from(auditResultsTable)
      .where(eq(auditResultsTable.clientId, client.id))
      .orderBy(desc(auditResultsTable.id))
      .limit(1);
    [narrative] = await db
      .select()
      .from(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, client.id))
      .orderBy(desc(narrativeProfilesTable.id))
      .limit(1);
  }

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
    clientName: client?.fullName ?? null,
    onboardingComplete: client?.onboardingComplete ?? false,
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
