import { Router } from "express";
import {
  db,
  contentStrategiesTable,
  platformStrategiesTable,
  narrativeProfilesTable,
  postsTable,
  ideasTable,
} from "@workspace/db";
import { GenerateContentPlanBody, ApplyContentPlanBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { isBlueprintComplete } from "../services/platforms";
import { generateContentPlan } from "../services/planner";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const router = Router();

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
  return {
    ...rest,
    createdAt: i.createdAt.toISOString(),
  };
}

router.post("/planner/generate", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  if (!isBlueprintComplete(client)) {
    res.status(403).json({ error: "Complete your Blueprint to unlock planning." });
    return;
  }

  const [contentStrategy] = await db
    .select()
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .orderBy(desc(contentStrategiesTable.id))
    .limit(1);
  if (!contentStrategy) {
    res
      .status(403)
      .json({ error: "Generate your content strategy before planning a calendar." });
    return;
  }

  const [platformStrategy] = await db
    .select()
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .orderBy(desc(platformStrategiesTable.id))
    .limit(1);

  const [narrative] = await db
    .select()
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .orderBy(desc(narrativeProfilesTable.id))
    .limit(1);

  const body = GenerateContentPlanBody.safeParse(req.body ?? {});
  const input = body.success ? body.data : {};

  try {
    const proposal = await generateContentPlan(
      client,
      narrative,
      contentStrategy,
      platformStrategy,
      {
        startDate: input.startDate,
        weeks: input.weeks,
        feedback: input.feedback,
      },
    );
    res.json(proposal);
  } catch (err) {
    req.log.error({ err }, "Failed to generate content plan");
    res.status(502).json({ error: "Planning failed. Please try again." });
  }
});

router.post("/planner/apply", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }

  const parsed = ApplyContentPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid plan input" });
    return;
  }
  const { slots, ideas } = parsed.data;

  // Persist the confirmed slots as scheduled draft posts and the confirmed
  // ideas into the backlog, all scoped to this client, in one transaction.
  const result = await db.transaction(async (tx) => {
    const createdPosts =
      slots.length > 0
        ? await tx
            .insert(postsTable)
            .values(
              slots.map((s) => {
                const date = new Date(s.targetDate);
                const scheduledAt = Number.isNaN(date.getTime()) ? null : date;
                const tags = [s.contentType, s.format]
                  .map((t) => (t ?? "").trim())
                  .filter(Boolean);
                return {
                  clientId: client.id,
                  title: s.title,
                  content: s.brief,
                  platform: s.platform,
                  status: scheduledAt ? "scheduled" : "draft",
                  scheduledAt,
                  tags,
                };
              }),
            )
            .returning()
        : [];

    const createdIdeas =
      ideas.length > 0
        ? await tx
            .insert(ideasTable)
            .values(
              ideas.map((i) => ({
                clientId: client.id,
                title: i.title,
                notes: i.notes ?? "",
                platform: i.platform ?? null,
              })),
            )
            .returning()
        : [];

    return { createdPosts, createdIdeas };
  });

  res.json({
    posts: result.createdPosts.map(serializePost),
    ideas: result.createdIdeas.map(serializeIdea),
  });
});

export default router;
