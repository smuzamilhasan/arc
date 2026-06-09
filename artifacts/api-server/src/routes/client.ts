import { Router } from "express";
import { db, clientProfileTable } from "@workspace/db";
import { UpsertClientBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { deleteClientData } from "../services/clientData";
import { reconcileUserInvites } from "../services/inviteBinding";
import { ACTIVE_CLIENT_HEADER } from "../middlewares/activeClient";

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
  // On the user's own profile path (no active-client header), bind any pending
  // agency invitation addressed to their verified email before resolving. This
  // claims/merges the invited profile so an invitee always lands on the same
  // record regardless of how they signed up, and self-heals past duplicates.
  if (req.userId && !req.header(ACTIVE_CLIENT_HEADER)) {
    await reconcileUserInvites(req.userId);
    const fresh = await getClientForUser(req.userId);
    if (fresh) {
      res.json(serializeClient(fresh));
      return;
    }
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
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

  let existing = req.activeClient;
  // Before creating a brand-new personal profile, bind any pending agency invite
  // for this user's verified email so onboarding writes into the invited profile
  // instead of spawning a duplicate.
  if (!existing && req.userId && !req.header(ACTIVE_CLIENT_HEADER)) {
    await reconcileUserInvites(req.userId);
    existing = await getClientForUser(req.userId);
  }
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
