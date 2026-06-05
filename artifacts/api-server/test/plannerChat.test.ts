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
  plannerMessagesTable,
  type PlannerAction,
  type PlannerActionKind,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const USER_A = `test-pchat-a-${suffix}`;
const USER_B = `test-pchat-b-${suffix}`;
const USER_C = `test-pchat-c-${suffix}`;

function as(userId: string) {
  return { "x-test-user-id": userId };
}

// Every field isBlueprintComplete() requires, so the gated /planner/chat routes
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
  await db.delete(plannerMessagesTable).where(eq(plannerMessagesTable.clientId, client.id));
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

// Onboard a user with a complete Blueprint, optionally adding a content
// strategy so the planner gate passes.
async function onboard(userId: string, fullName: string, withStrategy: boolean) {
  await request(app)
    .put("/api/client")
    .set(as(userId))
    .send({ fullName, ...BLUEPRINT_FIELDS })
    .expect(200);
  if (withStrategy) {
    await db
      .insert(contentStrategiesTable)
      .values({ clientId: await clientId(userId), summary: "A strategy" });
  }
}

function makeAction(kind: PlannerActionKind, payload: Record<string, unknown>): PlannerAction {
  return {
    id: randomUUID(),
    kind,
    title: `Test ${kind}`,
    rationale: "Because the test says so",
    status: "proposed",
    rejectionComment: null,
    diff: [],
    payload,
  };
}

// Seed an assistant planner message holding the given actions directly (AI is
// not callable in tests), returning the row id so the test can confirm/reject
// the actions through the routes.
async function seedAssistantMessage(
  cId: number,
  actions: PlannerAction[],
  seen = true,
): Promise<number> {
  const [row] = await db
    .insert(plannerMessagesTable)
    .values({ clientId: cId, role: "assistant", content: "Here is a plan", actions, seen })
    .returning();
  return row.id;
}

async function seedScheduledPost(cId: number, scheduledAt: Date): Promise<number> {
  const [row] = await db
    .insert(postsTable)
    .values({
      clientId: cId,
      title: "Seed post",
      content: "Seed content",
      platform: "linkedin",
      status: "scheduled",
      scheduledAt,
    })
    .returning();
  return row.id;
}

beforeAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await cleanupUser(USER_C);
  // A: fully onboarded (blueprint + strategy). B: blueprint only (no strategy).
  // C: never onboarded (no client profile).
  await onboard(USER_A, "Alice Anderson", true);
  await onboard(USER_B, "Bob Brown", false);
});

afterAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await cleanupUser(USER_C);
  await pool.end();
});

describe("planner chat gating", () => {
  it("requires authentication to read messages", async () => {
    await request(app).get("/api/planner/chat/messages").expect(401);
  });

  it("returns 404 reading messages without a client profile", async () => {
    await request(app).get("/api/planner/chat/messages").set(as(USER_C)).expect(404);
  });

  it("requires authentication to send a message", async () => {
    await request(app).post("/api/planner/chat/message").send({ content: "hi" }).expect(401);
  });

  it("returns 404 sending a message without a client profile", async () => {
    await request(app)
      .post("/api/planner/chat/message")
      .set(as(USER_C))
      .send({ content: "hi" })
      .expect(404);
  });

  it("returns 403 sending a message before a content strategy exists", async () => {
    await request(app)
      .post("/api/planner/chat/message")
      .set(as(USER_B))
      .send({ content: "Plan my week" })
      .expect(403);
  });
});

describe("planner chat unread/seen", () => {
  it("counts unseen messages and clears them on seen", async () => {
    const aId = await clientId(USER_A);
    await seedAssistantMessage(aId, [], false);

    const before = await request(app)
      .get("/api/planner/chat/unread")
      .set(as(USER_A))
      .expect(200);
    expect(before.body.count).toBeGreaterThanOrEqual(1);

    await request(app).post("/api/planner/chat/seen").set(as(USER_A)).expect(200);

    const after = await request(app)
      .get("/api/planner/chat/unread")
      .set(as(USER_A))
      .expect(200);
    expect(after.body.count).toBe(0);
  });
});

describe("planner chat confirm/apply", () => {
  it("deletes posts when a delete_posts action is confirmed", async () => {
    const aId = await clientId(USER_A);
    const postId = await seedScheduledPost(aId, new Date("2026-07-01T09:00:00.000Z"));
    const action = makeAction("delete_posts", { postIds: [postId] });
    await seedAssistantMessage(aId, [action]);

    await request(app)
      .post(`/api/planner/chat/actions/${action.id}/confirm`)
      .set(as(USER_A))
      .expect(200);

    const remaining = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, postId));
    expect(remaining).toHaveLength(0);
  });

  it("reschedules a post to a new day when confirmed", async () => {
    const aId = await clientId(USER_A);
    const postId = await seedScheduledPost(aId, new Date("2026-07-01T09:00:00.000Z"));
    const action = makeAction("reschedule_posts", {
      items: [{ postId, day: "2026-07-10", time: "08:00" }],
    });
    await seedAssistantMessage(aId, [action]);

    const res = await request(app)
      .post(`/api/planner/chat/actions/${action.id}/confirm`)
      .set(as(USER_A))
      .expect(200);
    expect(res.body.action.status).toBe("applied");

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(post.scheduledAt).toBeTruthy();
    expect(post.scheduledAt!.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("shifts scheduled posts by a day delta when confirmed", async () => {
    const aId = await clientId(USER_A);
    const start = new Date("2026-07-01T09:00:00.000Z");
    const postId = await seedScheduledPost(aId, start);
    const action = makeAction("shift_posts", { postIds: [postId], deltaDays: 3 });
    await seedAssistantMessage(aId, [action]);

    await request(app)
      .post(`/api/planner/chat/actions/${action.id}/confirm`)
      .set(as(USER_A))
      .expect(200);

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(post.scheduledAt!.toISOString().slice(0, 10)).toBe("2026-07-04");
  });

  it("creates posts and ideas when a generate_calendar action is confirmed", async () => {
    const aId = await clientId(USER_A);
    const action = makeAction("generate_calendar", {
      slots: [
        {
          platform: "linkedin",
          title: "Generated post",
          format: "thread",
          contentType: "Educational",
          brief: "A brief",
          targetDate: "2026-08-01T09:00:00.000Z",
        },
      ],
      ideas: [{ title: "Generated idea", notes: "Notes", platform: "twitter" }],
    });
    await seedAssistantMessage(aId, [action]);

    await request(app)
      .post(`/api/planner/chat/actions/${action.id}/confirm`)
      .set(as(USER_A))
      .expect(200);

    const posts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.clientId, aId));
    const ideas = await db
      .select()
      .from(ideasTable)
      .where(eq(ideasTable.clientId, aId));
    expect(posts.some((p) => p.title === "Generated post")).toBe(true);
    expect(ideas.some((i) => i.title === "Generated idea")).toBe(true);
  });
});

describe("planner chat reject", () => {
  it("marks an action rejected without a comment and applies nothing", async () => {
    const aId = await clientId(USER_A);
    const postId = await seedScheduledPost(aId, new Date("2026-07-01T09:00:00.000Z"));
    const action = makeAction("delete_posts", { postIds: [postId] });
    await seedAssistantMessage(aId, [action]);

    const res = await request(app)
      .post(`/api/planner/chat/actions/${action.id}/reject`)
      .set(as(USER_A))
      .send({})
      .expect(200);
    expect(res.body.action.status).toBe("rejected");
    expect(res.body.assistantMessage).toBeNull();

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(post).toBeTruthy();
  });
});

describe("planner chat per-user isolation", () => {
  it("does not let one user confirm another user's action", async () => {
    const aId = await clientId(USER_A);
    const postId = await seedScheduledPost(aId, new Date("2026-07-01T09:00:00.000Z"));
    const action = makeAction("delete_posts", { postIds: [postId] });
    await seedAssistantMessage(aId, [action]);

    // B (a different onboarded user) cannot see or act on A's action.
    await request(app)
      .post(`/api/planner/chat/actions/${action.id}/confirm`)
      .set(as(USER_B))
      .expect(404);

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(post).toBeTruthy();
  });

  it("scopes the message list to the caller's own client", async () => {
    const aId = await clientId(USER_A);
    await seedAssistantMessage(aId, []);

    const aMessages = await request(app)
      .get("/api/planner/chat/messages")
      .set(as(USER_A))
      .expect(200);
    expect(aMessages.body.length).toBeGreaterThanOrEqual(1);

    const bMessages = await request(app)
      .get("/api/planner/chat/messages")
      .set(as(USER_B))
      .expect(200);
    expect(bMessages.body).toEqual([]);
  });
});
