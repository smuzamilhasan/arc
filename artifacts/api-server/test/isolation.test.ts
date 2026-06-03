import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// Mock Clerk so we can drive requests as two distinct authenticated users
// without a real Clerk session. `requireAuth` reads the user id via
// `getAuth(req)`; here we resolve it from a test-only header so each request
// can be made as user A, user B, or unauthenticated (no header).
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
  narrativeProfilesTable,
  auditResultsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const USER_A = `test-iso-a-${suffix}`;
const USER_B = `test-iso-b-${suffix}`;

function as(userId: string) {
  return { "x-test-user-id": userId };
}

async function cleanupUser(userId: string) {
  const [client] = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.userId, userId));
  if (!client) return;
  await db.delete(postsTable).where(eq(postsTable.clientId, client.id));
  await db.delete(ideasTable).where(eq(ideasTable.clientId, client.id));
  await db
    .delete(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id));
  await db
    .delete(auditResultsTable)
    .where(eq(auditResultsTable.clientId, client.id));
  await db.delete(clientProfileTable).where(eq(clientProfileTable.id, client.id));
}

let postA = 0;
let postB = 0;
let ideaA = 0;
let ideaB = 0;

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

  const resPostA = await request(app)
    .post("/api/posts")
    .set(as(USER_A))
    .send({ title: "A post", content: "A content", platform: "linkedin", status: "draft" })
    .expect(201);
  postA = resPostA.body.id;

  const resPostB = await request(app)
    .post("/api/posts")
    .set(as(USER_B))
    .send({ title: "B post", content: "B content", platform: "twitter", status: "draft" })
    .expect(201);
  postB = resPostB.body.id;

  const resIdeaA = await request(app)
    .post("/api/ideas")
    .set(as(USER_A))
    .send({ title: "A idea", notes: "A notes" })
    .expect(201);
  ideaA = resIdeaA.body.id;

  const resIdeaB = await request(app)
    .post("/api/ideas")
    .set(as(USER_B))
    .send({ title: "B idea", notes: "B notes" })
    .expect(201);
  ideaB = resIdeaB.body.id;
});

afterAll(async () => {
  await cleanupUser(USER_A);
  await cleanupUser(USER_B);
  await pool.end();
});

describe("authentication", () => {
  it("allows the health check without auth", async () => {
    const res = await request(app).get("/api/healthz").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
  const protectedRoutes: Array<[HttpMethod, string]> = [
    ["get", "/api/client"],
    ["put", "/api/client"],
    ["post", "/api/client/reset"],
    ["get", "/api/posts"],
    ["post", "/api/posts"],
    ["get", "/api/posts/1"],
    ["patch", "/api/posts/1"],
    ["delete", "/api/posts/1"],
    ["get", "/api/ideas"],
    ["post", "/api/ideas"],
    ["patch", "/api/ideas/1"],
    ["delete", "/api/ideas/1"],
    ["get", "/api/dashboard"],
    ["get", "/api/audit/latest"],
    ["post", "/api/audit/run"],
    ["get", "/api/narrative"],
    ["put", "/api/narrative"],
    ["post", "/api/narrative/generate"],
    ["post", "/api/onboarding/extract"],
    ["post", "/api/onboarding/generate-bio"],
  ];

  it.each(protectedRoutes)(
    "returns 401 for unauthenticated %s %s",
    async (method, path) => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    },
  );
});

describe("client profile isolation", () => {
  it("returns each user their own profile", async () => {
    const resA = await request(app).get("/api/client").set(as(USER_A)).expect(200);
    expect(resA.body.fullName).toBe("Alice Anderson");

    const resB = await request(app).get("/api/client").set(as(USER_B)).expect(200);
    expect(resB.body.fullName).toBe("Bob Brown");
  });

  it("never exposes the userId in the serialized profile", async () => {
    const resA = await request(app).get("/api/client").set(as(USER_A)).expect(200);
    expect(resA.body.userId).toBeUndefined();
  });
});

describe("posts isolation", () => {
  it("lists only the calling user's posts", async () => {
    const resA = await request(app).get("/api/posts").set(as(USER_A)).expect(200);
    const idsA = resA.body.map((p: { id: number }) => p.id);
    expect(idsA).toContain(postA);
    expect(idsA).not.toContain(postB);

    const resB = await request(app).get("/api/posts").set(as(USER_B)).expect(200);
    const idsB = resB.body.map((p: { id: number }) => p.id);
    expect(idsB).toContain(postB);
    expect(idsB).not.toContain(postA);
  });

  it("allows reading own post by id", async () => {
    const res = await request(app).get(`/api/posts/${postA}`).set(as(USER_A)).expect(200);
    expect(res.body.title).toBe("A post");
  });

  it("returns 404 (not the other user's row) for cross-user GET by id", async () => {
    await request(app).get(`/api/posts/${postB}`).set(as(USER_A)).expect(404);
  });

  it("returns 404 for cross-user PATCH and leaves the row unchanged", async () => {
    await request(app)
      .patch(`/api/posts/${postB}`)
      .set(as(USER_A))
      .send({ title: "hijacked" })
      .expect(404);

    const res = await request(app).get(`/api/posts/${postB}`).set(as(USER_B)).expect(200);
    expect(res.body.title).toBe("B post");
  });

  it("returns 404 and does not delete the other user's post on cross-user DELETE", async () => {
    await request(app).delete(`/api/posts/${postB}`).set(as(USER_A)).expect(404);
    await request(app).get(`/api/posts/${postB}`).set(as(USER_B)).expect(200);
  });
});

describe("ideas isolation", () => {
  it("lists only the calling user's ideas", async () => {
    const resA = await request(app).get("/api/ideas").set(as(USER_A)).expect(200);
    const idsA = resA.body.map((i: { id: number }) => i.id);
    expect(idsA).toContain(ideaA);
    expect(idsA).not.toContain(ideaB);
  });

  it("returns 404 for cross-user PATCH and leaves the row unchanged", async () => {
    await request(app)
      .patch(`/api/ideas/${ideaB}`)
      .set(as(USER_A))
      .send({ title: "hijacked" })
      .expect(404);

    const resB = await request(app).get("/api/ideas").set(as(USER_B)).expect(200);
    const target = resB.body.find((i: { id: number }) => i.id === ideaB);
    expect(target?.title).toBe("B idea");
  });

  it("returns 404 and does not delete the other user's idea on cross-user DELETE", async () => {
    await request(app).delete(`/api/ideas/${ideaB}`).set(as(USER_A)).expect(404);
    const resB = await request(app).get("/api/ideas").set(as(USER_B)).expect(200);
    const idsB = resB.body.map((i: { id: number }) => i.id);
    expect(idsB).toContain(ideaB);
  });
});

describe("dashboard isolation", () => {
  it("aggregates only the calling user's data", async () => {
    const resA = await request(app).get("/api/dashboard").set(as(USER_A)).expect(200);
    expect(resA.body.clientName).toBe("Alice Anderson");
    expect(resA.body.totalPosts).toBe(1);
    expect(resA.body.ideaCount).toBe(1);

    const resB = await request(app).get("/api/dashboard").set(as(USER_B)).expect(200);
    expect(resB.body.clientName).toBe("Bob Brown");
  });
});

describe("narrative editing", () => {
  it("updates the caller's narrative fields and persists them", async () => {
    const [client] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.userId, USER_B));
    expect(client).toBeDefined();

    await db.insert(narrativeProfilesTable).values({
      clientId: client.id,
      coreNarrative: "original narrative",
      pointOfView: "original pov",
      themes: [{ title: "Old theme", description: "old desc" }],
      recommendedPlatforms: [{ platform: "linkedin", reason: "old reason", priority: "low" }],
      contentHooks: ["old hook 1", "old hook 2"],
    });

    const update = {
      coreNarrative: "edited narrative",
      pointOfView: "edited pov",
      themes: [{ title: "New theme", description: "new desc" }],
      recommendedPlatforms: [
        { platform: "twitter", reason: "new reason", priority: "high" as const },
      ],
      contentHooks: ["kept hook"],
    };

    const resPut = await request(app)
      .put("/api/narrative")
      .set(as(USER_B))
      .send(update)
      .expect(200);
    expect(resPut.body.coreNarrative).toBe("edited narrative");
    expect(resPut.body.contentHooks).toEqual(["kept hook"]);

    // Survives a refresh (re-read from the API).
    const resGet = await request(app).get("/api/narrative").set(as(USER_B)).expect(200);
    expect(resGet.body.pointOfView).toBe("edited pov");
    expect(resGet.body.themes).toEqual([{ title: "New theme", description: "new desc" }]);
    expect(resGet.body.recommendedPlatforms[0].priority).toBe("high");
  });

  it("returns 404 when the caller has no narrative", async () => {
    await request(app)
      .put("/api/narrative")
      .set(as(USER_A))
      .send({
        coreNarrative: "x",
        pointOfView: "y",
        themes: [],
        recommendedPlatforms: [],
        contentHooks: [],
      })
      .expect(404);
  });
});

describe("reset isolation", () => {
  it("only deletes the calling user's data", async () => {
    await request(app).post("/api/client/reset").set(as(USER_A)).expect(204);

    // User A's profile and content are gone.
    await request(app).get("/api/client").set(as(USER_A)).expect(404);
    const postsA = await request(app).get("/api/posts").set(as(USER_A)).expect(200);
    expect(postsA.body).toEqual([]);

    // User B is untouched.
    const resB = await request(app).get("/api/client").set(as(USER_B)).expect(200);
    expect(resB.body.fullName).toBe("Bob Brown");
    const postsB = await request(app).get("/api/posts").set(as(USER_B)).expect(200);
    expect(postsB.body.map((p: { id: number }) => p.id)).toContain(postB);
  });
});
