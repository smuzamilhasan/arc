import { Router } from "express";
import { db, clientProfileTable } from "@workspace/db";
import { UpsertClientBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router = Router();

function serializeClient(c: typeof clientProfileTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function getCurrentClient() {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .orderBy(desc(clientProfileTable.id))
    .limit(1);
  return client;
}

router.get("/client", async (req, res) => {
  const client = await getCurrentClient();
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  res.json(serializeClient(client));
});

router.put("/client", async (req, res) => {
  const parsed = UpsertClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const values = {
    fullName: data.fullName,
    location: data.location ?? "",
    headline: data.headline ?? "",
    currentRole: data.currentRole ?? "",
    company: data.company ?? "",
    industry: data.industry ?? "",
    yearsExperience: data.yearsExperience ?? 0,
    achievements: data.achievements ?? [],
    goals: data.goals ?? "",
    bio: data.bio ?? "",
    dateOfBirth: data.dateOfBirth ?? null,
    placeOfBirth: data.placeOfBirth ?? "",
    earlyLife: data.earlyLife ?? "",
    schooling: data.schooling ?? "",
    university: data.university ?? "",
    professionalJourney: data.professionalJourney ?? "",
    signatureAchievements: data.signatureAchievements ?? "",
    awards: data.awards ?? "",
    quantifiableResults: data.quantifiableResults ?? "",
    audienceImpact: data.audienceImpact ?? "",
    passions: data.passions ?? "",
    beliefs: data.beliefs ?? "",
    frustrations: data.frustrations ?? "",
    desiredChange: data.desiredChange ?? "",
    extractedInfo: data.extractedInfo ?? "",
    website: data.website ?? null,
    newsletter: data.newsletter ?? null,
    linkedinUrl: data.linkedinUrl ?? null,
    twitterUrl: data.twitterUrl ?? null,
    instagramUrl: data.instagramUrl ?? null,
    youtubeUrl: data.youtubeUrl ?? null,
    onboardingComplete: data.onboardingComplete ?? false,
    updatedAt: new Date(),
  };

  const existing = await getCurrentClient();
  let client: typeof clientProfileTable.$inferSelect;
  if (existing) {
    [client] = await db
      .update(clientProfileTable)
      .set(values)
      .where(eq(clientProfileTable.id, existing.id))
      .returning();
  } else {
    [client] = await db.insert(clientProfileTable).values(values).returning();
  }
  res.json(serializeClient(client));
});

export { getCurrentClient, serializeClient };
export default router;
