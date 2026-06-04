import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// Mock Clerk so requests run as a deterministic test user (see isolation.test.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-user-id"] ?? null,
  }),
}));

import app from "../src/app";
import { db, pool, clientProfileTable, postsTable, ideasTable, assistantMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const USER_A = `test-sched-a-${suffix}`;
const USER_B = `test-sched-b-${suffix}`;

function as(userId: string) {
  return { "x-test-user-id": userId };
}

async function clientIdFor(userId: string): Promise<number> {
  const [c] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId));
  return c.id;
}

async function cleanupUser(userId: string) {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId));
  if (!client) return;
  await db.delete(assistantMessagesTable).where(eq(assistantMessagesTable.clientId, client.id));
  await db.delete(postsTable).where(eq(postsTable.clientId, client.id));
  await db.delete(ideasTable).where(eq(ideasTable.clientId, client.id));
  await db.delete(clientProfileTable).where(eq(clientProfileTable.id, client.id));
}

async function createDraft(userId: string, title: string): Promise<number> {
  const res = await request(app)
    .post("/api/posts")
    .set(as(userId))
    .send({ title, content: "body", platform: "linkedin", status: "draft" })
    .expect(201);
  return res.body.id;
}

beforeAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await request(app)
    .put("/api/client")
    .set(as(USER_A))
    .send({ fullName: "Alice Anderson", headline: "A headline" })
    .expect(200);
  await request(app)
    .put("/api/client")
    .set(as(USER_B))
    .send({ fullName: "Bob Brown", headline: "B headline" })
    .expect(200);
});

afterAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await pool.end();
});

describe("schedule-batch posts", () => {
  it("requires authentication", async () => {
    await request(app)
      .post("/api/posts/schedule-batch")
      .send({ postIds: [1], startDate: "2026-07-01" })
      .expect(401);
  });

  it("rejects an empty postIds list with 400", async () => {
    await request(app)
      .post("/api/posts/schedule-batch")
      .set(as(USER_A))
      .send({ postIds: [], startDate: "2026-07-01" })
      .expect(400);
  });

  it("spreads posts across dates by the interval and marks them scheduled", async () => {
    const id1 = await createDraft(USER_A, "Sched one");
    const id2 = await createDraft(USER_A, "Sched two");
    const id3 = await createDraft(USER_A, "Sched three");

    const res = await request(app)
      .post("/api/posts/schedule-batch")
      .set(as(USER_A))
      .send({
        postIds: [id1, id2, id3],
        startDate: "2026-07-01",
        intervalDays: 2,
        time: "09:00",
      })
      .expect(200);

    expect(res.body).toHaveLength(3);
    expect(res.body.every((p: { status: string }) => p.status === "scheduled")).toBe(true);

    // Response is ordered by scheduledAt; days should step by the interval.
    const days = res.body.map((p: { scheduledAt: string }) => new Date(p.scheduledAt).getDate());
    expect(days).toEqual([1, 3, 5]);
  });

  it("defaults the interval to 1 day when omitted", async () => {
    const id1 = await createDraft(USER_A, "Default one");
    const id2 = await createDraft(USER_A, "Default two");

    const res = await request(app)
      .post("/api/posts/schedule-batch")
      .set(as(USER_A))
      .send({ postIds: [id1, id2], startDate: "2026-08-10" })
      .expect(200);

    const ordered = res.body
      .slice()
      .sort(
        (a: { scheduledAt: string }, b: { scheduledAt: string }) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
    const days = ordered.map((p: { scheduledAt: string }) => new Date(p.scheduledAt).getDate());
    expect(days).toEqual([10, 11]);
  });

  it("ignores post ids belonging to another client", async () => {
    const aId = await createDraft(USER_A, "A owns this");
    const bId = await createDraft(USER_B, "B owns this");

    // User A tries to schedule one of their posts plus one of B's.
    const res = await request(app)
      .post("/api/posts/schedule-batch")
      .set(as(USER_A))
      .send({ postIds: [aId, bId], startDate: "2026-09-01" })
      .expect(200);

    // Only A's post comes back scheduled.
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(aId);

    // B's post is untouched.
    const [bPost] = await db.select().from(postsTable).where(eq(postsTable.id, bId));
    expect(bPost.status).toBe("draft");
    expect(bPost.scheduledAt).toBeNull();
  });
});
