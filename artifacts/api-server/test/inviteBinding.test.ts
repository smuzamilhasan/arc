import { describe, it, expect, afterAll, vi } from "vitest";

// reconcileUserInvites resolves verified emails via Clerk. Mock it so the test
// can control which verified email a given userId owns. bindInviteForUser does
// not call Clerk, so the merge logic is exercised directly against the DB.
const userEmails: Record<string, string[]> = {};
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-user-id"] ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async (userId: string) => ({
        emailAddresses: (userEmails[userId] ?? []).map((emailAddress) => ({
          emailAddress,
          verification: { status: "verified" },
        })),
      }),
    },
  },
}));

import {
  db,
  pool,
  clientProfileTable,
  agenciesTable,
  agencyClientAccessTable,
  invitationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  bindInviteForUser,
  reconcileUserInvites,
  reconcilePersonalProfileByEmail,
} from "../src/services/inviteBinding";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let agencyId = 0;
const createdClientIds: number[] = [];
const createdInviteIds: number[] = [];

async function makeAgency() {
  const [a] = await db
    .insert(agenciesTable)
    .values({ name: `Test Agency ${suffix}`, ownerUserId: `owner-${suffix}` })
    .returning();
  agencyId = a.id;
}

async function makeProfile(opts: {
  userId: string | null;
  fullName: string;
  createdByAgencyId: number | null;
  rich: boolean;
  complete: boolean;
  verifiedEmail?: string | null;
}) {
  const [p] = await db
    .insert(clientProfileTable)
    .values({
      userId: opts.userId,
      fullName: opts.fullName,
      createdByAgencyId: opts.createdByAgencyId,
      verifiedEmail: opts.verifiedEmail ?? null,
      bio: opts.rich ? "x".repeat(500) : "",
      professionalJourney: opts.rich ? "y".repeat(400) : "",
      onboardingComplete: opts.complete,
      onboardingStep: opts.complete ? 1 : 1,
    })
    .returning();
  createdClientIds.push(p.id);
  return p;
}

async function makeInvite(email: string, clientId: number) {
  const [inv] = await db
    .insert(invitationsTable)
    .values({
      agencyId,
      email,
      kind: "client",
      clientId,
      token: `tok-${suffix}-${Math.random().toString(36).slice(2)}`,
      status: "pending",
      invitedByUserId: `owner-${suffix}`,
    })
    .returning();
  createdInviteIds.push(inv.id);
  return inv;
}

async function makeGrant(clientId: number) {
  await db.insert(agencyClientAccessTable).values({ agencyId, clientId });
}

async function getProfile(id: number) {
  const [p] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, id))
    .limit(1);
  return p;
}

afterAll(async () => {
  for (const id of createdInviteIds) {
    await db.delete(invitationsTable).where(eq(invitationsTable.id, id)).catch(() => {});
  }
  for (const id of createdClientIds) {
    await db
      .delete(agencyClientAccessTable)
      .where(eq(agencyClientAccessTable.clientId, id))
      .catch(() => {});
    await db.delete(clientProfileTable).where(eq(clientProfileTable.id, id)).catch(() => {});
  }
  if (agencyId) {
    await db.delete(agenciesTable).where(eq(agenciesTable.id, agencyId)).catch(() => {});
  }
  await pool.end();
});

describe("invite binding", () => {
  it("claims the prebuilt profile when the user has no profile yet", async () => {
    await makeAgency();
    const user = `u-claim-${suffix}`;
    const prebuilt = await makeProfile({
      userId: null,
      fullName: "Claim Me",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(prebuilt.id);
    const inv = await makeInvite(`claim-${suffix}@example.com`, prebuilt.id);

    const bound = await bindInviteForUser(user, inv);
    expect(bound).toBe(prebuilt.id);

    const after = await getProfile(prebuilt.id);
    expect(after.userId).toBe(user);
    const [invAfter] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, inv.id));
    expect(invAfter.status).toBe("accepted");
  });

  it("keeps the filled prebuilt and drops the user's sparse duplicate (Saad case)", async () => {
    const user = `u-saad-${suffix}`;
    const rich = await makeProfile({
      userId: null,
      fullName: "Rich Agency Profile",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(rich.id);
    const sparse = await makeProfile({
      userId: user,
      fullName: "Sparse Self Signup",
      createdByAgencyId: null,
      rich: false,
      complete: true,
    });
    const inv = await makeInvite(`saad-${suffix}@example.com`, rich.id);

    const bound = await bindInviteForUser(user, inv);
    expect(bound).toBe(rich.id);

    // Rich profile is now owned by the user; sparse duplicate is gone.
    const richAfter = await getProfile(rich.id);
    expect(richAfter.userId).toBe(user);
    const sparseAfter = await getProfile(sparse.id);
    expect(sparseAfter).toBeUndefined();
  });

  it("keeps the user's filled profile and drops the empty prebuilt", async () => {
    const user = `u-keepown-${suffix}`;
    const emptyPrebuilt = await makeProfile({
      userId: null,
      fullName: "Empty Prebuilt",
      createdByAgencyId: agencyId,
      rich: false,
      complete: false,
    });
    await makeGrant(emptyPrebuilt.id);
    const filledOwn = await makeProfile({
      userId: user,
      fullName: "Filled Own",
      createdByAgencyId: null,
      rich: true,
      complete: true,
    });
    const inv = await makeInvite(`keepown-${suffix}@example.com`, emptyPrebuilt.id);

    const bound = await bindInviteForUser(user, inv);
    expect(bound).toBe(filledOwn.id);

    // Own profile kept + attached to the agency; empty prebuilt removed.
    const ownAfter = await getProfile(filledOwn.id);
    expect(ownAfter.userId).toBe(user);
    expect(ownAfter.createdByAgencyId).toBe(agencyId);
    const prebuiltAfter = await getProfile(emptyPrebuilt.id);
    expect(prebuiltAfter).toBeUndefined();
    // Grant + invitation now point at the kept profile.
    const [grant] = await db
      .select()
      .from(agencyClientAccessTable)
      .where(eq(agencyClientAccessTable.clientId, filledOwn.id));
    expect(grant).toBeDefined();
    const [invAfter] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, inv.id));
    expect(invAfter.status).toBe("accepted");
    expect(invAfter.clientId).toBe(filledOwn.id);
  });

  it("does not steal a prebuilt profile already claimed by another account", async () => {
    const other = `u-other-${suffix}`;
    const me = `u-me-${suffix}`;
    const claimed = await makeProfile({
      userId: other,
      fullName: "Already Claimed",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(claimed.id);
    const inv = await makeInvite(`steal-${suffix}@example.com`, claimed.id);

    const bound = await bindInviteForUser(me, inv);
    expect(bound).toBeNull();
    const after = await getProfile(claimed.id);
    expect(after.userId).toBe(other);
  });

  it("reconcile binds only one invite when the email has several pending", async () => {
    const user = `u-multi-${suffix}`;
    const email = `multi-${suffix}@example.com`;
    userEmails[user] = [email];
    const first = await makeProfile({
      userId: null,
      fullName: "First Prebuilt",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(first.id);
    await makeInvite(email, first.id);
    const second = await makeProfile({
      userId: null,
      fullName: "Second Prebuilt",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(second.id);
    await makeInvite(email, second.id);

    const bound = await reconcileUserInvites(user);
    expect(bound).not.toBeNull();
    // Exactly one prebuilt was claimed; the other remains intact and unclaimed
    // (never deleted by a later bind).
    const firstAfter = await getProfile(first.id);
    const secondAfter = await getProfile(second.id);
    expect(firstAfter).toBeDefined();
    expect(secondAfter).toBeDefined();
    const claimedCount = [firstAfter, secondAfter].filter(
      (p) => p.userId === user,
    ).length;
    expect(claimedCount).toBe(1);
  });

  it("links an existing account: attaches the agency grant to the user's own profile without a duplicate", async () => {
    const user = `u-link-${suffix}`;
    // The invite points straight at a profile the user ALREADY owns (the agency
    // detected the existing account at invite time). No grant exists yet.
    const own = await makeProfile({
      userId: user,
      fullName: "Existing Account",
      createdByAgencyId: null,
      rich: true,
      complete: true,
    });
    const inv = await makeInvite(`link-${suffix}@example.com`, own.id);

    const bound = await bindInviteForUser(user, inv);
    expect(bound).toBe(own.id);

    // Profile is unchanged-owner and now has the agency grant; invite accepted.
    const after = await getProfile(own.id);
    expect(after.userId).toBe(user);
    const [grant] = await db
      .select()
      .from(agencyClientAccessTable)
      .where(eq(agencyClientAccessTable.clientId, own.id));
    expect(grant).toBeDefined();
    const [invAfter] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, inv.id));
    expect(invAfter.status).toBe("accepted");
  });

  it("reconcileUserInvites binds via the user's verified email", async () => {
    const user = `u-recon-${suffix}`;
    const email = `recon-${suffix}@example.com`;
    userEmails[user] = [email];
    const prebuilt = await makeProfile({
      userId: null,
      fullName: "Recon Target",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
    });
    await makeGrant(prebuilt.id);
    await makeInvite(email, prebuilt.id);

    const bound = await reconcileUserInvites(user);
    expect(bound).toBe(prebuilt.id);
    const after = await getProfile(prebuilt.id);
    expect(after.userId).toBe(user);
  });
});

describe("personal profile self-heal by verified email", () => {
  it("re-points a personal profile to a second identity sharing its verified email", async () => {
    const original = `u-orig-${suffix}`;
    const second = `u-second-${suffix}`;
    const shared = `shared-${suffix}@example.com`;
    userEmails[second] = [shared];
    const profile = await makeProfile({
      userId: original,
      fullName: "Returning User",
      createdByAgencyId: null,
      rich: true,
      complete: true,
      verifiedEmail: shared,
    });

    const resolved = await reconcilePersonalProfileByEmail(second);
    expect(resolved?.id).toBe(profile.id);
    const after = await getProfile(profile.id);
    expect(after.userId).toBe(second);
    // Content is untouched — only ownership changed.
    expect(after.fullName).toBe("Returning User");
    expect(after.onboardingComplete).toBe(true);
  });

  it("backfills the canonical verified email for an owned profile missing it", async () => {
    const user = `u-backfill-${suffix}`;
    const email = `backfill-${suffix}@example.com`;
    userEmails[user] = [email];
    const profile = await makeProfile({
      userId: user,
      fullName: "Owner Missing Email",
      createdByAgencyId: null,
      rich: true,
      complete: true,
      verifiedEmail: null,
    });

    const resolved = await reconcilePersonalProfileByEmail(user);
    expect(resolved?.id).toBe(profile.id);
    const after = await getProfile(profile.id);
    expect(after.verifiedEmail).toBe(email);
  });

  it("never matches a profile whose email the caller has not verified", async () => {
    const owner = `u-isolated-owner-${suffix}`;
    const stranger = `u-stranger-${suffix}`;
    userEmails[stranger] = [`stranger-${suffix}@example.com`];
    const profile = await makeProfile({
      userId: owner,
      fullName: "Someone Else",
      createdByAgencyId: null,
      rich: true,
      complete: true,
      verifiedEmail: `private-${suffix}@example.com`,
    });

    const resolved = await reconcilePersonalProfileByEmail(stranger);
    expect(resolved).toBeUndefined();
    const after = await getProfile(profile.id);
    expect(after.userId).toBe(owner);
  });

  it("does not re-point an agency-managed profile via email match", async () => {
    const owner = `u-agency-owner-${suffix}`;
    const other = `u-agency-other-${suffix}`;
    const shared = `agencyshared-${suffix}@example.com`;
    userEmails[other] = [shared];
    const profile = await makeProfile({
      userId: owner,
      fullName: "Agency Managed",
      createdByAgencyId: agencyId,
      rich: true,
      complete: true,
      verifiedEmail: shared,
    });

    const resolved = await reconcilePersonalProfileByEmail(other);
    expect(resolved).toBeUndefined();
    const after = await getProfile(profile.id);
    expect(after.userId).toBe(owner);
  });
});
