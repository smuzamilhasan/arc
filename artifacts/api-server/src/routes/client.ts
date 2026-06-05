import { Router } from "express";
import {
  db,
  clientProfileTable,
  auditResultsTable,
  briefingDossiersTable,
  narrativeProfilesTable,
  postsTable,
  ideasTable,
  platformStrategiesTable,
  industryOverviewTable,
  contentStrategiesTable,
  assistantMessagesTable,
  plannerMessagesTable,
  assistantReviewsTable,
  profilePortraitsTable,
  managerRunsTable,
  schedulerConnectionsTable,
  agencyClientAccessTable,
  invitationsTable,
} from "@workspace/db";
import { UpsertClientBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";

const router = Router();

async function deleteClientData(clientId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(postsTable).where(eq(postsTable.clientId, clientId));
    await tx.delete(ideasTable).where(eq(ideasTable.clientId, clientId));
    await tx
      .delete(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, clientId));
    await tx
      .delete(auditResultsTable)
      .where(eq(auditResultsTable.clientId, clientId));
    await tx
      .delete(briefingDossiersTable)
      .where(eq(briefingDossiersTable.clientId, clientId));
    await tx
      .delete(contentStrategiesTable)
      .where(eq(contentStrategiesTable.clientId, clientId));
    await tx
      .delete(platformStrategiesTable)
      .where(eq(platformStrategiesTable.clientId, clientId));
    await tx
      .delete(industryOverviewTable)
      .where(eq(industryOverviewTable.clientId, clientId));
    await tx
      .delete(assistantMessagesTable)
      .where(eq(assistantMessagesTable.clientId, clientId));
    await tx
      .delete(plannerMessagesTable)
      .where(eq(plannerMessagesTable.clientId, clientId));
    await tx
      .delete(assistantReviewsTable)
      .where(eq(assistantReviewsTable.clientId, clientId));
    await tx
      .delete(profilePortraitsTable)
      .where(eq(profilePortraitsTable.clientId, clientId));
    await tx
      .delete(managerRunsTable)
      .where(eq(managerRunsTable.clientId, clientId));
    await tx
      .delete(schedulerConnectionsTable)
      .where(eq(schedulerConnectionsTable.clientId, clientId));
    // Agency linkage rows reference this client by id with no FK cascade, so
    // remove them here or they would dangle after the profile is deleted.
    await tx
      .delete(agencyClientAccessTable)
      .where(eq(agencyClientAccessTable.clientId, clientId));
    await tx
      .delete(invitationsTable)
      .where(eq(invitationsTable.clientId, clientId));
    await tx.delete(clientProfileTable).where(eq(clientProfileTable.id, clientId));
  });
}

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
  const client = req.activeClient;
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
    positioning: data.positioning ?? "",
    primaryAudience: data.primaryAudience ?? "",
    secondaryAudience: data.secondaryAudience ?? "",
    geographyCulture: data.geographyCulture ?? "",
    brandValues: data.brandValues ?? "",
    nonNegotiables: data.nonNegotiables ?? "",
    personalityTone: data.personalityTone ?? "",
    desiredFeeling: data.desiredFeeling ?? "",
    thesis: data.thesis ?? "",
    coreBeliefs: data.coreBeliefs ?? "",
    signatureFrameworks: data.signatureFrameworks ?? "",
    extractedInfo: data.extractedInfo ?? "",
    website: data.website ?? null,
    newsletter: data.newsletter ?? null,
    linkedinUrl: data.linkedinUrl ?? null,
    twitterUrl: data.twitterUrl ?? null,
    instagramUrl: data.instagramUrl ?? null,
    youtubeUrl: data.youtubeUrl ?? null,
    onboardingComplete: data.onboardingComplete ?? false,
    onboardingStep: data.onboardingStep ?? 1,
    foundationConsolidatedAck: data.foundationConsolidatedAck ?? false,
    updatedAt: new Date(),
  };

  const existing = req.activeClient;
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

router.post("/client/foundation-ack", async (req, res) => {
  const existing = req.activeClient;
  if (!existing) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const [client] = await db
    .update(clientProfileTable)
    .set({ foundationConsolidatedAck: true, updatedAt: new Date() })
    .where(eq(clientProfileTable.id, existing.id))
    .returning();
  res.json(serializeClient(client));
});

router.post("/client/reset", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(204).end();
    return;
  }
  await deleteClientData(client.id);
  res.status(204).end();
});

router.delete("/account", async (req, res) => {
  const userId = req.userId!;
  const client = await getClientForUser(userId);
  if (client) {
    await deleteClientData(client.id);
  }
  await clerkClient.users.deleteUser(userId);
  res.status(204).end();
});

export { getClientForUser, serializeClient };
export default router;
