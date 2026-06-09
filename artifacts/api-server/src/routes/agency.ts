import { Router } from "express";
import { randomBytes } from "node:crypto";
import {
  db,
  agenciesTable,
  agencyMembersTable,
  agencyClientAccessTable,
  invitationsTable,
  clientProfileTable,
  insertClientProfileSchema,
  type Agency,
  type AgencyMember,
  type Invitation,
  type ClientProfile,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { z } from "zod/v4";
import { primaryEmail, clerkUserName } from "../middlewares/requireAdmin";
import { sendEmail } from "../services/email";
import { buildInviteEmail } from "../services/inviteEmail";
import { deleteClientData } from "../services/clientData";
import { bindInviteForUser } from "../services/inviteBinding";
import type { Request } from "express";

const router = Router();

function newToken(): string {
  return randomBytes(24).toString("hex");
}

function serializeAgency(a: Agency) {
  return {
    id: a.id,
    name: a.name,
    ownerUserId: a.ownerUserId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

async function getMembership(
  agencyId: number,
  userId: string,
): Promise<AgencyMember | undefined> {
  const [m] = await db
    .select()
    .from(agencyMembersTable)
    .where(
      and(
        eq(agencyMembersTable.agencyId, agencyId),
        eq(agencyMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return m;
}

// An invite is bound to the email it was sent to. Acceptance is only allowed
// when the authenticated caller actually owns that (verified) email on their
// Clerk account, so a forwarded token cannot be redeemed by someone else.
async function callerOwnsEmail(userId: string, email: string): Promise<boolean> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const target = email.trim().toLowerCase();
    return user.emailAddresses.some(
      (e) =>
        e.emailAddress.toLowerCase() === target &&
        e.verification?.status === "verified",
    );
  } catch {
    return false;
  }
}

// Looks up whether an arc account already exists for an email: a Clerk user who
// has that email VERIFIED and already owns a client_profile. Returns that
// profile so the invite can LINK it to the agency instead of prebuilding a
// duplicate. Verified-only mirrors the binding rule (an unverified address can't
// authorize linking someone's profile to an agency). Best-effort: returns null
// if Clerk lookup fails, so invite creation falls back to today's prebuild path.
async function findOwnedProfileForEmail(
  email: string,
): Promise<ClientProfile | null> {
  const target = email.trim().toLowerCase();
  let users;
  try {
    const list = await clerkClient.users.getUserList({ emailAddress: [target] });
    users = list.data;
  } catch {
    return null;
  }
  for (const u of users) {
    const verified = u.emailAddresses.some(
      (e) =>
        e.emailAddress.toLowerCase() === target &&
        e.verification?.status === "verified",
    );
    if (!verified) continue;
    const [profile] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.userId, u.id))
      .limit(1);
    if (profile) return profile;
  }
  return null;
}

function serializeInvitation(inv: Invitation) {
  return {
    id: inv.id,
    agencyId: inv.agencyId,
    email: inv.email,
    kind: inv.kind,
    clientId: inv.clientId,
    token: inv.token,
    status: inv.status,
    createdAt: inv.createdAt.toISOString(),
  };
}

// Sends the invite email to the invitee. Never throws — returns whether the
// email was delivered so invite creation can succeed even if delivery fails
// and the owner can fall back to copying the link manually.
async function sendInviteEmail(
  req: Request,
  inv: Invitation,
  agencyName: string,
  linkExisting = false,
): Promise<boolean> {
  try {
    let inviterName = "Your team";
    try {
      const inviter = await clerkClient.users.getUser(inv.invitedByUserId);
      inviterName = clerkUserName(inviter);
    } catch (err) {
      req.log.warn({ err }, "Could not resolve inviter name for invite email");
    }
    const { subject, html, text } = buildInviteEmail({
      token: inv.token,
      kind: inv.kind === "member" ? "member" : "client",
      inviterName,
      agencyName,
      linkExisting,
    });
    return await sendEmail({ to: inv.email, subject, html, text });
  } catch (err) {
    req.log.error({ err }, "Invite email send failed");
    return false;
  }
}

// Everything the nav + client switcher needs: the user's agencies, every
// client they can act on (own + agency-managed), and their personal profile id.
router.get("/agency/context", async (req, res) => {
  const userId = req.userId!;
  const memberships = await db
    .select()
    .from(agencyMembersTable)
    .where(eq(agencyMembersTable.userId, userId));
  const agencyIds = memberships.map((m) => m.agencyId);

  const agencies =
    agencyIds.length > 0
      ? await db
          .select()
          .from(agenciesTable)
          .where(inArray(agenciesTable.id, agencyIds))
      : [];

  const [ownProfile] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId))
    .limit(1);

  // Agency-managed clients via access grants.
  const grants =
    agencyIds.length > 0
      ? await db
          .select()
          .from(agencyClientAccessTable)
          .where(inArray(agencyClientAccessTable.agencyId, agencyIds))
      : [];
  const managedIds = grants.map((g) => g.clientId);
  const managed =
    managedIds.length > 0
      ? await db
          .select()
          .from(clientProfileTable)
          .where(inArray(clientProfileTable.id, managedIds))
      : [];

  const agencyByClient = new Map<number, number>();
  for (const g of grants) agencyByClient.set(g.clientId, g.agencyId);

  type ClientSummary = {
    id: number;
    fullName: string;
    headline: string;
    onboardingComplete: boolean;
    claimed: boolean;
    isOwn: boolean;
    agencyId: number | null;
  };
  const clients: ClientSummary[] = [];
  if (ownProfile) {
    clients.push({
      id: ownProfile.id,
      fullName: ownProfile.fullName,
      headline: ownProfile.headline,
      onboardingComplete: ownProfile.onboardingComplete,
      claimed: true,
      isOwn: true,
      agencyId: null,
    });
  }
  for (const c of managed) {
    if (ownProfile && c.id === ownProfile.id) continue;
    clients.push({
      id: c.id,
      fullName: c.fullName,
      headline: c.headline,
      onboardingComplete: c.onboardingComplete,
      claimed: c.userId !== null,
      isOwn: false,
      agencyId: agencyByClient.get(c.id) ?? null,
    });
  }

  res.json({
    personalClientId: ownProfile?.id ?? null,
    agencies: memberships.map((m) => {
      const a = agencies.find((x) => x.id === m.agencyId);
      return { id: m.agencyId, name: a?.name ?? "Agency", role: m.role };
    }),
    clients,
  });
});

const createAgencyBody = z.object({ name: z.string().trim().min(1).max(120) });

router.post("/agency", async (req, res) => {
  const parsed = createAgencyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const userId = req.userId!;
  const [agency] = await db
    .insert(agenciesTable)
    .values({ name: parsed.data.name, ownerUserId: userId })
    .returning();
  await db
    .insert(agencyMembersTable)
    .values({ agencyId: agency.id, userId, role: "owner" });
  res.status(201).json(serializeAgency(agency));
});

router.get("/agency/:agencyId/members", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  if (!Number.isInteger(agencyId)) {
    res.status(400).json({ error: "Invalid agency id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const members = await db
    .select()
    .from(agencyMembersTable)
    .where(eq(agencyMembersTable.agencyId, agencyId));

  const enriched = await Promise.all(
    members.map(async (m) => {
      let email: string | null = null;
      let name: string | null = null;
      try {
        const user = await clerkClient.users.getUser(m.userId);
        email = primaryEmail(user);
        name = clerkUserName(user);
      } catch {
        // user lookup best-effort
      }
      return { userId: m.userId, role: m.role, email, name };
    }),
  );
  res.json({ members: enriched });
});

router.get("/agency/:agencyId/invitations", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  if (!Number.isInteger(agencyId)) {
    res.status(400).json({ error: "Invalid agency id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const invites = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.agencyId, agencyId),
        eq(invitationsTable.status, "pending"),
      ),
    );
  res.json({ invitations: invites.map(serializeInvitation) });
});

const inviteBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("member"), email: z.string().email() }),
  z.object({
    kind: z.literal("client"),
    email: z.string().email(),
    // Prefilled profile the agency builds at invite time. fullName required;
    // every other field optional and falls back to column defaults.
    profile: insertClientProfileSchema,
  }),
]);

router.post("/agency/:agencyId/invite", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  if (!Number.isInteger(agencyId)) {
    res.status(400).json({ error: "Invalid agency id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = inviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  // Managing the team (adding teammates) is owner-only; members may only
  // invite/manage clients.
  if (data.kind === "member" && membership.role !== "owner") {
    res.status(403).json({ error: "Only the agency owner can invite members" });
    return;
  }
  const token = newToken();
  const [agency] = await db
    .select()
    .from(agenciesTable)
    .where(eq(agenciesTable.id, agencyId))
    .limit(1);
  const agencyName = agency?.name ?? "Your agency";

  if (data.kind === "client") {
    // If an arc account already exists for this email, link THEIR profile to the
    // agency instead of prebuilding a duplicate. Crucially we do NOT create the
    // access grant yet: linking someone's own profile to an agency requires their
    // consent, so the grant is attached only when they accept (bindInviteForUser).
    // The invitation points at the existing profile; no new profile is created.
    const existingProfile = await findOwnedProfileForEmail(data.email);
    if (existingProfile) {
      const [inv] = await db
        .insert(invitationsTable)
        .values({
          agencyId,
          email: data.email.toLowerCase(),
          kind: "client",
          clientId: existingProfile.id,
          token,
          invitedByUserId: req.userId!,
        })
        .returning();
      const emailSent = await sendInviteEmail(req, inv, agencyName, true);
      res.status(201).json({
        ...serializeInvitation(inv),
        clientId: existingProfile.id,
        emailSent,
      });
      return;
    }

    // No existing account: create the unclaimed, agency-prebuilt profile + grant
    // + invitation. On accept (or background reconcile), the invitee claims it.
    const [profile] = await db
      .insert(clientProfileTable)
      .values({ ...data.profile, userId: null, createdByAgencyId: agencyId })
      .returning();
    await db
      .insert(agencyClientAccessTable)
      .values({ agencyId, clientId: profile.id });
    const [inv] = await db
      .insert(invitationsTable)
      .values({
        agencyId,
        email: data.email.toLowerCase(),
        kind: "client",
        clientId: profile.id,
        token,
        invitedByUserId: req.userId!,
      })
      .returning();
    const emailSent = await sendInviteEmail(req, inv, agencyName);
    res
      .status(201)
      .json({ ...serializeInvitation(inv), clientId: profile.id, emailSent });
    return;
  }

  const [inv] = await db
    .insert(invitationsTable)
    .values({
      agencyId,
      email: data.email.toLowerCase(),
      kind: "member",
      token,
      invitedByUserId: req.userId!,
    })
    .returning();
  const emailSent = await sendInviteEmail(req, inv, agencyName);
  res.status(201).json({ ...serializeInvitation(inv), emailSent });
});

router.delete("/agency/:agencyId/invitations/:id", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  const id = Number(req.params.id);
  if (!Number.isInteger(agencyId) || !Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [target] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(eq(invitationsTable.id, id), eq(invitationsTable.agencyId, agencyId)),
    )
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  // Member invites are part of team management (owner-only); client invites
  // can be managed by any member.
  if (target.kind === "member" && membership.role !== "owner") {
    res.status(403).json({ error: "Only the agency owner can manage member invites" });
    return;
  }
  await db
    .update(invitationsTable)
    .set({ status: "revoked" })
    .where(
      and(eq(invitationsTable.id, id), eq(invitationsTable.agencyId, agencyId)),
    );
  res.status(204).end();
});

router.delete("/agency/:agencyId/members/:memberUserId", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  const memberUserId = req.params.memberUserId;
  if (!Number.isInteger(agencyId)) {
    res.status(400).json({ error: "Invalid agency id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [agency] = await db
    .select()
    .from(agenciesTable)
    .where(eq(agenciesTable.id, agencyId))
    .limit(1);
  if (agency && agency.ownerUserId === memberUserId) {
    res.status(400).json({ error: "Cannot remove the agency owner" });
    return;
  }
  await db
    .delete(agencyMembersTable)
    .where(
      and(
        eq(agencyMembersTable.agencyId, agencyId),
        eq(agencyMembersTable.userId, memberUserId),
      ),
    );
  res.status(204).end();
});

// Remove a client from the agency. Any member can manage clients. An unclaimed
// prebuilt profile (userId null) is deleted outright along with all its data;
// a profile already claimed by a real user is only detached from the agency
// roster (its access grant + pending invites are removed) so we never destroy
// a real user's account.
router.delete("/agency/:agencyId/clients/:clientId", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(agencyId) || !Number.isInteger(clientId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const membership = await getMembership(agencyId, req.userId!);
  if (!membership) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // The client must actually belong to this agency's roster.
  const [grant] = await db
    .select()
    .from(agencyClientAccessTable)
    .where(
      and(
        eq(agencyClientAccessTable.agencyId, agencyId),
        eq(agencyClientAccessTable.clientId, clientId),
      ),
    )
    .limit(1);
  if (!grant) {
    res.status(404).json({ error: "Client not found in this agency" });
    return;
  }
  const [profile] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);

  if (!profile || profile.userId === null) {
    // Unclaimed prebuilt profile: nothing real depends on it, delete fully.
    await deleteClientData(clientId);
    res.status(204).end();
    return;
  }

  // Claimed by a real user: only detach from this agency.
  await db
    .delete(agencyClientAccessTable)
    .where(
      and(
        eq(agencyClientAccessTable.agencyId, agencyId),
        eq(agencyClientAccessTable.clientId, clientId),
      ),
    );
  await db
    .update(invitationsTable)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitationsTable.agencyId, agencyId),
        eq(invitationsTable.clientId, clientId),
        eq(invitationsTable.status, "pending"),
      ),
    );
  res.status(204).end();
});

// Preview an invitation (so the accept page can show context before accepting).
router.get("/invitations/:token", async (req, res) => {
  const token = req.params.token;
  const [inv] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token))
    .limit(1);
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  const [agency] = await db
    .select()
    .from(agenciesTable)
    .where(eq(agenciesTable.id, inv.agencyId))
    .limit(1);
  // A "link existing account" invite points at a profile already owned by a
  // user; a prebuild invite points at an unclaimed profile (userId null). Surface
  // linkExisting so the accept page shows "connect your account" rather than
  // "claim a prepared profile", and suppress the profile name for link invites
  // so a forwarded token can't reveal the existing account holder's name.
  let clientFullName: string | null = null;
  let linkExisting = false;
  if (inv.clientId) {
    const [c] = await db
      .select({
        fullName: clientProfileTable.fullName,
        userId: clientProfileTable.userId,
      })
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, inv.clientId))
      .limit(1);
    linkExisting = inv.kind === "client" && c?.userId != null;
    clientFullName = linkExisting ? null : c?.fullName ?? null;
  }
  res.json({
    kind: inv.kind,
    email: inv.email,
    status: inv.status,
    agencyName: agency?.name ?? "Agency",
    clientFullName,
    linkExisting,
  });
});

router.post("/invitations/:token/accept", async (req, res) => {
  const token = req.params.token;
  const userId = req.userId!;
  const [inv] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token))
    .limit(1);
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (inv.status !== "pending") {
    res.status(410).json({ error: "Invitation is no longer active" });
    return;
  }
  // Bind acceptance to the invited email so a forwarded token cannot be
  // redeemed by a different account.
  if (!(await callerOwnsEmail(userId, inv.email))) {
    res.status(403).json({
      error: "This invitation was sent to a different email address",
    });
    return;
  }

  if (inv.kind === "member") {
    const existing = await getMembership(inv.agencyId, userId);
    if (!existing) {
      await db
        .insert(agencyMembersTable)
        .values({ agencyId: inv.agencyId, userId, role: "member" });
    }
    await db
      .update(invitationsTable)
      .set({ status: "accepted", acceptedByUserId: userId, acceptedAt: new Date() })
      .where(eq(invitationsTable.id, inv.id));
    res.json({ kind: "member", agencyId: inv.agencyId });
    return;
  }

  // kind === "client": claim the prebuilt profile.
  if (!inv.clientId) {
    res.status(400).json({ error: "Invitation has no client profile" });
    return;
  }
  // Claim or merge: bindInviteForUser claims the prebuilt profile, or, if the
  // user already created a duplicate (e.g. they signed up directly instead of
  // through this link), merges the two keeping whichever has data. It also
  // marks the invitation accepted. Returns null only if the prebuilt profile is
  // already owned by a different account.
  const boundClientId = await bindInviteForUser(userId, inv);
  if (boundClientId == null) {
    res.status(409).json({ error: "This profile was already claimed" });
    return;
  }
  res.json({ kind: "client", agencyId: inv.agencyId, clientId: boundClientId });
});

export default router;
