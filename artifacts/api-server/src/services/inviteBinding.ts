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
import { and, eq, inArray, isNull } from "drizzle-orm";
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

// All of the caller's VERIFIED Clerk emails, trimmed + lowercased. Best-effort:
// returns [] if Clerk lookup fails.
export async function getVerifiedEmails(userId: string): Promise<string[]> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.trim().toLowerCase());
  } catch (err) {
    logger.error({ err, userId }, "getVerifiedEmails: clerk lookup failed");
    return [];
  }
}

// The caller's canonical verified email (primary if verified, else the first
// verified one), trimmed + lowercased. Used to stamp a profile's owner email.
export async function getCanonicalVerifiedEmail(
  userId: string,
): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const verified = user.emailAddresses.filter(
      (e) => e.verification?.status === "verified",
    );
    if (verified.length === 0) return null;
    const primary =
      verified.find((e) => e.id === user.primaryEmailAddressId) ?? verified[0];
    return primary.emailAddress.trim().toLowerCase();
  } catch (err) {
    logger.error(
      { err, userId },
      "getCanonicalVerifiedEmail: clerk lookup failed",
    );
    return null;
  }
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

  // The invite targets a profile this user already owns. This is the "link an
  // existing account" path (the agency invited an email that already had an arc
  // profile, so the invitation points straight at it) and also the idempotent
  // re-run of an already-claimed prebuild. Either way: attach the agency grant
  // (the grant is created only on accept for link invites) and mark accepted.
  if (prebuilt.userId === userId) {
    await db.transaction(async (tx) => {
      await ensureGrant(tx, inv.agencyId, prebuilt.id);
      if (inv.status !== "accepted") {
        await acceptInvitation(tx, inv.id, userId, prebuilt.id);
      }
    });
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
  const emails = await getVerifiedEmails(userId);
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

// Email-as-source-of-truth self-heal for PERSONAL (non-agency) profiles.
//
// Resolves the caller's own profile. If they already own one, lazily backfills
// its canonical verified email and returns it. If they own none, it looks for
// an existing personal profile whose canonical verified email is one of the
// CALLER'S OWN verified emails and re-points its ownership to the current
// account. This covers the case where the same person ends up with two Clerk
// identities sharing one verified email (e.g. a Google sign-up and a later
// email/password account): without it, the second identity is treated as a
// brand-new user and bounced into onboarding, and a duplicate/empty profile is
// created.
//
// Safety guarantees:
// - Only matches profiles whose verified_email is one the CALLER has verified,
//   so it can never bind a profile belonging to a different person.
// - Only re-points purely personal profiles (created_by_agency_id IS NULL);
//   agency-managed profiles stay owned by the existing invite-binding path.
// - Only changes ownership; never overwrites profile content and never replaces
//   a filled profile with an empty one.
// Best-effort: never throws (Clerk/db errors are logged and undefined returned).
export async function reconcilePersonalProfileByEmail(
  userId: string,
): Promise<ClientProfile | undefined> {
  try {
    // Already owns a profile: backfill its canonical email if missing, return it.
    const owned = await getOwnedProfile(userId);
    if (owned) {
      if (!owned.verifiedEmail) {
        const email = await getCanonicalVerifiedEmail(userId);
        if (email) {
          const [updated] = await db
            .update(clientProfileTable)
            .set({ verifiedEmail: email, updatedAt: new Date() })
            .where(eq(clientProfileTable.id, owned.id))
            .returning();
          return updated ?? owned;
        }
      }
      return owned;
    }

    const emails = await getVerifiedEmails(userId);
    if (emails.length === 0) return undefined;

    // Find personal profiles whose canonical email is one of the caller's
    // verified emails. Exclude agency-managed profiles.
    const candidates = await db
      .select()
      .from(clientProfileTable)
      .where(
        and(
          inArray(clientProfileTable.verifiedEmail, emails),
          isNull(clientProfileTable.createdByAgencyId),
        ),
      );
    if (candidates.length === 0) return undefined;

    // Prefer the most-filled profile if duplicates exist.
    candidates.sort((a, b) => profileFillScore(b) - profileFillScore(a));
    const match = candidates[0];

    // Already owned by the caller (shouldn't happen since owned was undefined),
    // nothing to do.
    if (match.userId === userId) return match;

    // Re-point ownership to the current account. Same person (shares a verified
    // email), so this is safe. The caller owns no profile, so the unique userId
    // update cannot collide.
    logger.info(
      { userId, clientId: match.id, previousOwner: match.userId },
      "personal profile self-heal: re-pointing profile to current account by verified email",
    );
    const [updated] = await db
      .update(clientProfileTable)
      .set({ userId, updatedAt: new Date() })
      .where(eq(clientProfileTable.id, match.id))
      .returning();
    return updated ?? match;
  } catch (err) {
    logger.error(
      { err, userId },
      "reconcilePersonalProfileByEmail: self-heal failed",
    );
    return undefined;
  }
}
