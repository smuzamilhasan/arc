import { Router } from "express";
import { db, brandProfileTable } from "@workspace/db";
import { UpsertBrandProfileBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/brand-profile", async (req, res) => {
  const profiles = await db.select().from(brandProfileTable).limit(1);
  if (profiles.length === 0) {
    res.status(404).json({ error: "Brand profile not found" });
    return;
  }
  const p = profiles[0];
  res.json({
    ...p,
    updatedAt: p.updatedAt.toISOString(),
  });
});

router.put("/brand-profile", async (req, res) => {
  const parsed = UpsertBrandProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const existing = await db.select().from(brandProfileTable).limit(1);

  if (existing.length === 0) {
    const [created] = await db
      .insert(brandProfileTable)
      .values({
        name: data.name,
        tagline: data.tagline,
        mission: data.mission,
        values: data.values ?? [],
        targetAudience: data.targetAudience,
        toneOfVoice: data.toneOfVoice,
        bio: data.bio,
        website: data.website ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        twitterUrl: data.twitterUrl ?? null,
        instagramUrl: data.instagramUrl ?? null,
        updatedAt: new Date(),
      })
      .returning();
    res.json({ ...created, updatedAt: created.updatedAt.toISOString() });
  } else {
    const [updated] = await db
      .update(brandProfileTable)
      .set({
        name: data.name,
        tagline: data.tagline,
        mission: data.mission,
        values: data.values ?? [],
        targetAudience: data.targetAudience,
        toneOfVoice: data.toneOfVoice,
        bio: data.bio,
        website: data.website ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        twitterUrl: data.twitterUrl ?? null,
        instagramUrl: data.instagramUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(brandProfileTable.id, existing[0].id))
      .returning();
    res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
  }
});

export default router;
