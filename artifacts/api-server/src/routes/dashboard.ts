import { Router } from "express";
import { db, brandProfileTable, postsTable, ideasTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard", async (req, res) => {
  const [profiles, allPosts, ideas] = await Promise.all([
    db.select().from(brandProfileTable).limit(1),
    db.select().from(postsTable).orderBy(desc(postsTable.updatedAt)),
    db.select().from(ideasTable),
  ]);

  const brandProfileComplete = profiles.length > 0;
  const totalPosts = allPosts.length;
  const draftCount = allPosts.filter((p) => p.status === "draft").length;
  const scheduledCount = allPosts.filter((p) => p.status === "scheduled").length;
  const publishedCount = allPosts.filter((p) => p.status === "published").length;
  const ideaCount = ideas.length;

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
    totalPosts,
    draftCount,
    scheduledCount,
    publishedCount,
    ideaCount,
    brandProfileComplete,
    postsByPlatform,
    recentPosts,
  });
});

export default router;
