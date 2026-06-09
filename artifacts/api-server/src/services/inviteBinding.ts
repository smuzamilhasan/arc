// Email -> profile binding for agency-invited clients.
//
// An agency prebuilds an (unclaimed) client profile and sends an invitation to
// an email. The invitee is supposed to claim that exact profile. But if they
// sign up WITHOUT going through the invite link (e.g. straight via Google
// OAuth), the app would create them a fresh personal profile and the prebuilt
// one would be orphaned forever (client_profile.userId is unique, so the
// accept flow could never claim it afterwards).
//
// This service makes the invited email the source of truth: whenever a user is
// resolved, we look up their VERIFIED Clerk emails, find any pending client
// invitation addressed to one of them, and bind their account to the SAME
// prebuilt profile — claiming it, or, if the user already created a duplicate,
// merging the two (keeping whichever profile actually has data). This both
// self-heals existing duplicates and prevents new ones regardless of how the
// invitee signed up.
import {
  db,
  clientProfileTable,
  agencyClientAccessTable,
  invitationsTable,
  type ClientProfile,
  type Invitation,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { deleteClientData } from "./clientData";

// Substantive, user-meaningful text fields. Used to decide which of two
// profiles is "more filled" when a duplicate must be merged.
const CONTENT_FIELDS: (keyof ClientProfile)[] = [
  "headline",
  "bio",
  "location",
  "currentRole",
  "company",
  "industry",
  "goals",
  "placeOfBirth",
  "earlyLife",
  "schooling",
  "university",
  "professionalJourney",
  "signatureAchievements",
  "awards",
  "quantifiableResults",
  "audienceImpact",
  "passions",
  "beliefs",
  "frustrations",
  "desiredChange",
  "positioning",
  "primaryAudience",
  "secondaryAudience",
  "geographyCulture",
  "brandValues",
  "nonNegotiables",
  "personalityTone",
  "desiredFeeling",
  "thesis",
  "coreBeliefs",
  "signatureFrameworks",
  "extractedInfo",
];

// Higher score = more complete. Content length dominates so the profile that
// actually holds the client's data is kept; completeness/step are tiebreakers.
export function profileFillScore(p: ClientProfile): number {
  let contentLen = 0;
  for (const f of CONTENT_FIELDS) {
    const v = p[f];
    if (typeof v === "string") contentLen += v.trim().length;
  }
  if (Array.isArray(p.achievements)) contentLen += p.achievements.length * 20;
  return (
    contentLen +
    (p.onboardingComplete ? 10000 : 0) +
    (p.onboardingStep ?? 0) * 50
  );
}

async function getOwnedProfile(userId: string): Promise<ClientProfile | undefined> {
  const [own] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId))
    .limit(1);
  return own;
}

// The transaction executor drizzle hands to a `db.transaction` callback.
type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function acceptInvitation(
  tx: TxExecutor,
  invId: number,
  userId: string,
  clientId: number,
) {
  await tx
    .update(invitationsTable)
    .set({
      clientId,
      status: "accepted",
      acceptedByUserId: userId,
      acceptedAt: new Date(),
    })
    .where(eq(invitationsTable.id, invId));
}

async function ensureGrant(tx: TxExecutor, agencyId: number, clientId: number) {
  const [g] = await tx
    .select({ id: agencyClientAccessTable.id })
    .from(agencyClientAccessTable)
    .where(
      and(
        eq(agencyClientAccessTable.agencyId, agencyId),
        eq(agencyClientAccessTable.clientId, clientId),
      ),
    )
    .limit(1);
  if (!g) {
    await tx.insert(agencyClientAccessTable).values({ agencyId, clientId });
  }
}

// Binds a single client invitation to the user, returning the client id the
// user now owns, or null if it cannot be bound (e.g. the prebuilt profile is
// already claimed by a DIFFERENT account — we never steal another user's data).
export async function bindInviteForUser(
  userId: string,
  inv: Invitation,
): Promise<number | null> {
  if (inv.kind !== "client" || !inv.clientId) return null;

  const [prebuilt] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, inv.clientId))
    .limit(1);
  if (!prebuilt) return null;

  // Already bound to this user — just ensure the invite is marked accepted.
  if (prebuilt.userId === userId) {
    if (inv.status !== "accepted") {
      await db.transaction((tx) =>
        acceptInvitation(tx, inv.id, userId, prebuilt.id),
      );
    }
    return prebuilt.id;
  }

  // Claimed by someone else: do not steal.
  if (prebuilt.userId && prebuilt.userId !== userId) {
    logger.warn(
      { invitationId: inv.id, clientId: prebuilt.id },
      "invite binding skipped: prebuilt profile claimed by another account",
    );
    return null;
  }

  // prebuilt is unclaimed (userId is null).
  const owned = await getOwnedProfile(userId);

  // No duplicate yet — simply claim the prebuilt profile.
  if (!owned) {
    await db.transaction(async (tx) => {
      await tx
        .update(clientProfileTable)
        .set({ userId, updatedAt: new Date() })
        .where(eq(clientProfileTable.id, prebuilt.id));
      await acceptInvitation(tx, inv.id, userId, prebuilt.id);
    });
    return prebuilt.id;
  }

  if (owned.id === prebuilt.id) {
    await db.transaction((tx) =>
      acceptInvitation(tx, inv.id, userId, prebuilt.id),
    );
    return prebuilt.id;
  }

  // The user already created a duplicate personal profile. Merge: keep whichever
  // profile actually has data, attach it to the agency, and drop the other. The
  // delete + reassign + accept run in one transaction so a partial failure can
  // never leave the account pointing at a deleted profile or an orphaned grant.
  const keepPrebuilt = profileFillScore(prebuilt) >= profileFillScore(owned);

  if (keepPrebuilt) {
    // Keep the prebuilt (filled) profile and point the user's account at it.
    // Delete the sparse owned profile first to free the unique userId.
    logger.info(
      { userId, keep: prebuilt.id, drop: owned.id },
      "invite binding merge: keeping prebuilt profile, dropping duplicate",
    );
    await db.transaction(async (tx) => {
      await deleteClientData(owned.id, tx);
      await tx
        .update(clientProfileTable)
        .set({ userId, updatedAt: new Date() })
        .where(eq(clientProfileTable.id, prebuilt.id));
      await acceptInvitation(tx, inv.id, userId, prebuilt.id);
    });
    return prebuilt.id;
  }

  // Keep the user's own (filled) profile: attach the agency to it and drop the
  // empty prebuilt. Repoint the grant + invitation BEFORE deleting the prebuilt
  // so cleanup of the prebuilt does not remove this invitation.
  logger.info(
    { userId, keep: owned.id, drop: prebuilt.id },
    "invite binding merge: keeping owned profile, dropping prebuilt",
  );
  await db.transaction(async (tx) => {
    await tx
      .update(clientProfileTable)
      .set({ createdByAgencyId: inv.agencyId, updatedAt: new Date() })
      .where(eq(clientProfileTable.id, owned.id));
    await ensureGrant(tx, inv.agencyId, owned.id);
    await acceptInvitation(tx, inv.id, userId, owned.id);
    await deleteClientData(prebuilt.id, tx);
  });
  return owned.id;
}

// Resolves the user's verified Clerk emails, finds any PENDING client
// invitations addressed to them, and binds each. Idempotent: once an invite is
// accepted it is no longer pending, so repeat calls are no-ops. Best-effort —
// never throws; binding failures are logged and the caller continues.
export async function reconcileUserInvites(
  userId: string,
): Promise<number | null> {
  let emails: string[];
  try {
    const user = await clerkClient.users.getUser(userId);
    emails = user.emailAddresses
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.trim().toLowerCase());
  } catch (err) {
    logger.error({ err, userId }, "reconcileUserInvites: clerk lookup failed");
    return null;
  }
  if (emails.length === 0) return null;

  const pending = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.kind, "client"),
        eq(invitationsTable.status, "pending"),
      ),
    );
  const matching = pending.filter((i) =>
    emails.includes(i.email.trim().toLowerCase()),
  );
  if (matching.length === 0) return null;

  // A user can own exactly one client profile, so bind only the first matching
  // invite and leave any others pending. Binding more than one here would make a
  // later invite's merge delete the profile an earlier invite just bound.
  for (const inv of matching) {
    try {
      const id = await bindInviteForUser(userId, inv);
      if (id) return id;
    } catch (err) {
      logger.error(
        { err, userId, invitationId: inv.id },
        "reconcileUserInvites: bind failed",
      );
    }
  }
  return null;
}
