import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// Mock Clerk so requests can be driven as distinct authenticated users via a
// test-only header, matching the rest of the api-server integration tests.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-user-id"] ?? null,
  }),
}));

import app from "../src/app";
import {
  db,
  pool,
  clientProfileTable,
  postsTable,
  ideasTable,
  contentStrategiesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const USER_A = `test-planner-a-${suffix}`;
const USER_B = `test-planner-b-${suffix}`;

function as(userId: string) {
  return { "x-test-user-id": userId };
}

// Every field isBlueprintComplete() requires, so the gated /planner routes
// treat the seeded client as fully onboarded.
const BLUEPRINT_FIELDS = {
  positioning: "The go-to person for X",
  primaryAudience: "Founders",
  brandValues: "Honesty",
  personalityTone: "Direct",
  thesis: "Distribution beats product",
  coreBeliefs: "Ship early",
  signatureFrameworks: "The Arc Method",
  beliefs: "Marketing is taught wrong",
  frustrations: "Vanity metrics",
  desiredChange: "Outcome-driven content",
  passions: "Teaching",
  earlyLife: "Grew up building things",
  professionalJourney: "Agency to founder",
  signatureAchievements: "Scaled to 1M",
  quantifiableResults: "3x revenue",
  audienceImpact: "Helped 500 founders",
  currentRole: "Founder",
  company: "Arc",
  industry: "Marketing",
  headline: "Builder",
  bio: "A bio",
} as const;

async function cleanupUser(userId: string) {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId));
  if (!client) return;
  await db.delete(postsTable).where(eq(postsTable.clientId, client.id));
  await db.delete(ideasTable).where(eq(ideasTable.clientId, client.id));
  await db
    .delete(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id));
  await db.delete(clientProfileTable).where(eq(clientProfileTable.id, client.id));
}

async function clientId(userId: string): Promise<number> {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId));
  return client.id;
}

beforeAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  // Create a fully-onboarded client for A (blueprint complete + a strategy).
  await request(app)
    .put("/api/client")
    .set(as(USER_A))
    .send({ fullName: "Alice Anderson", ...BLUEPRINT_FIELDS })
    .expect(200);
  await db
    .insert(contentStrategiesTable)
    .values({ clientId: await clientId(USER_A), summary: "A strategy" });
});

afterAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await pool.end();
});

const sampleSlot = {
  platform: "linkedin" as const,
  title: "A working title",
  format: "thread",
  contentType: "Educational",
  brief: "A short brief",
  targetDate: "2026-07-01T09:00:00.000Z",
};
const sampleIdea = { title: "An idea", notes: "Some notes", platform: "twitter" };

describe("planner generate gating", () => {
  it("requires authentication", async () => {
    await request(app).post("/api/planner/generate").send({}).expect(401);
  });

  it("returns 404 when the caller has no client profile", async () => {
    await request(app).post("/api/planner/generate").set(as(USER_B)).send({}).expect(404);
  });

  it("returns 403 when the caller has no content strategy yet", async () => {
    // Seed B with a complete blueprint but NO content strategy.
    await request(app)
      .put("/api/client")
      .set(as(USER_B))
      .send({ fullName: "Bob Brown", ...BLUEPRINT_FIELDS })
      .expect(200);
    await request(app).post("/api/planner/generate").set(as(USER_B)).send({}).expect(403);
  });
});

describe("planner apply", () => {
  it("requires authentication", async () => {
    await request(app)
      .post("/api/planner/apply")
      .send({ slots: [sampleSlot], ideas: [] })
      .expect(401);
  });

  it("rejects a malformed body with 400", async () => {
    await request(app)
      .post("/api/planner/apply")
      .set(as(USER_A))
      .send({ slots: [{ platform: "linkedin" }], ideas: [] })
      .expect(400);
  });

  it("persists confirmed slots as scheduled posts and ideas into the backlog", async () => {
    const res = await request(app)
      .post("/api/planner/apply")
      .set(as(USER_A))
      .send({ slots: [sampleSlot], ideas: [sampleIdea] })
      .expect(200);

    expect(res.body.posts).toHaveLength(1);
    expect(res.body.ideas).toHaveLength(1);
    const post = res.body.posts[0];
    expect(post.title).toBe(sampleSlot.title);
    expect(post.content).toBe(sampleSlot.brief);
    expect(post.platform).toBe("linkedin");
    expect(post.status).toBe("scheduled");
    expect(post.scheduledAt).toBeTruthy();
    expect(post.tags).toContain("Educational");
    expect(res.body.ideas[0].title).toBe(sampleIdea.title);

    // The rows are actually scoped to A's client.
    const aId = await clientId(USER_A);
    const posts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, aId));
    const ideas = await db
      .select()
      .from(ideasTable)
      .where(eq(ideasTable.clientId, aId));
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(ideas.length).toBeGreaterThanOrEqual(1);
  });

  it("does not let one user's apply write into another user's data", async () => {
    const beforeA = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, await clientId(USER_A)));

    await request(app)
      .post("/api/planner/apply")
      .set(as(USER_B))
      .send({ slots: [sampleSlot], ideas: [] })
      .expect(200);

    const afterA = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, await clientId(USER_A)));
    expect(afterA.length).toBe(beforeA.length);

    const bPosts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, await clientId(USER_B)));
    expect(bPosts.length).toBe(1);
  });
});
