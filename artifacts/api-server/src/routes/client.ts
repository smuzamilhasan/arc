import { Router } from "express";
import {
  db,
  clientProfileTable,
  auditResultsTable,
  narrativeProfilesTable,
  postsTable,
  ideasTable,
} from "@workspace/db";
import { UpsertClientBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

function serializeClient(c: typeof clientProfileTable.$inferSelect) {
  const { userId: _userId, ...rest } = c;
  return {
    ...rest,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function getClientForUser(userId: string) {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId))
    .limit(1);
  return client;
}

router.get("/client", async (req, res) => {
  const client = await getClientForUser(req.userId!);
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

  const existing = await getClientForUser(req.userId!);
  let client: typeof clientProfileTable.$inferSelect;
  if (existing) {
    [client] = await db
      .update(clientProfileTable)
      .set(values)
      .where(eq(clientProfileTable.id, existing.id))
      .returning();
  } else {
    [client] = await db
      .insert(clientProfileTable)
      .values({ ...values, userId: req.userId! })
      .returning();
  }
  res.json(serializeClient(client));
});

router.post("/client/reset", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(204).end();
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(postsTable).where(eq(postsTable.clientId, client.id));
    await tx.delete(ideasTable).where(eq(ideasTable.clientId, client.id));
    await tx.delete(narrativeProfilesTable).where(eq(narrativeProfilesTable.clientId, client.id));
    await tx.delete(auditResultsTable).where(eq(auditResultsTable.clientId, client.id));
    await tx.delete(clientProfileTable).where(eq(clientProfileTable.id, client.id));
  });
  res.status(204).end();
});

export { getClientForUser, serializeClient };
export default router;
