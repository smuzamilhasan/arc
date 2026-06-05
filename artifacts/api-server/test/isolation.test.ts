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
  briefingDossiersTable,
  platformStrategiesTable,
  contentStrategiesTable,
  assistantInsightsTable,
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
  await db
    .delete(briefingDossiersTable)
    .where(eq(briefingDossiersTable.clientId, client.id));
  await db
    .delete(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id));
  await db
    .delete(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id));
  await db
    .delete(assistantInsightsTable)
    .where(eq(assistantInsightsTable.clientId, client.id));
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
    ["get", "/api/platforms"],
    ["post", "/api/platforms/generate"],
    ["get", "/api/content-strategy"],
    ["post", "/api/content-strategy/generate"],
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

describe("blueprint fields persistence", () => {
  it("persists the new identity and worldview fields through PUT /client", async () => {
    const payload = {
      fullName: "Bob Brown",
      headline: "B headline",
      positioning: "the go-to person for X",
      primaryAudience: "early-stage founders",
      secondaryAudience: "operators",
      geographyCulture: "US + Europe",
      brandValues: "candor, rigor",
      nonNegotiables: "no hype",
      personalityTone: "direct, warm",
      desiredFeeling: "understood",
      thesis: "the field over-rates speed",
      coreBeliefs: "compounding beats heroics",
      signatureFrameworks: "the Arc Method",
    };

    const resPut = await request(app)
      .put("/api/client")
      .set(as(USER_B))
      .send(payload)
      .expect(200);

    // Every new field must round-trip; if any is missing from the route's
    // values map it is silently dropped and would fail here.
    for (const [key, value] of Object.entries(payload)) {
      expect(resPut.body[key]).toBe(value);
    }

    const resGet = await request(app).get("/api/client").set(as(USER_B)).expect(200);
    expect(resGet.body.positioning).toBe("the go-to person for X");
    expect(resGet.body.thesis).toBe("the field over-rates speed");
    expect(resGet.body.signatureFrameworks).toBe("the Arc Method");
    // Existing fields are not wiped by the update.
    expect(resGet.body.headline).toBe("B headline");
  });

  it("keeps the new fields isolated to the calling user", async () => {
    const resA = await request(app).get("/api/client").set(as(USER_A)).expect(200);
    expect(resA.body.positioning).toBe("");
    expect(resA.body.thesis).toBe("");
  });
});

describe("blueprint full-row overwrite merge", () => {
  // PUT /client is a full-row overwrite. The pillar editors guard against data
  // loss by reading the full profile and merging a single pillar's edits onto it
  // (clientToInput). This regression locks the server side of that contract: a
  // second PUT that carries a legacy field forward while adding a new blueprint
  // field must keep BOTH. If either is dropped from the route's values map, the
  // overwrite silently wipes the field and this fails.
  const USER_C = `test-iso-c-${suffix}`;

  beforeAll(async () => {
    await cleanupUser(USER_C);
  });

  afterAll(async () => {
    await cleanupUser(USER_C);
  });

  it("two sequential PUTs (legacy field, then a new blueprint field) keep both", async () => {
    // First PUT seeds a legacy field.
    await request(app)
      .put("/api/client")
      .set(as(USER_C))
      .send({ fullName: "Carol Clark", headline: "Carol's legacy headline" })
      .expect(200);

    // Read the full profile back and merge in a single new blueprint field —
    // exactly what a pillar editor does via clientToInput (strip server-managed
    // keys, coerce nullable fields to "", then overlay the edited field).
    const current = await request(app).get("/api/client").set(as(USER_C)).expect(200);
    const { id, createdAt, updatedAt, ...rest } = current.body;
    void id;
    void createdAt;
    void updatedAt;
    const merged = {
      ...rest,
      dateOfBirth: rest.dateOfBirth ?? "",
      website: rest.website ?? "",
      newsletter: rest.newsletter ?? "",
      linkedinUrl: rest.linkedinUrl ?? "",
      twitterUrl: rest.twitterUrl ?? "",
      instagramUrl: rest.instagramUrl ?? "",
      youtubeUrl: rest.youtubeUrl ?? "",
      positioning: "the go-to person for Y",
    };

    const resPut = await request(app)
      .put("/api/client")
      .set(as(USER_C))
      .send(merged)
      .expect(200);

    // The legacy field survives the overwrite and the new field is applied.
    expect(resPut.body.headline).toBe("Carol's legacy headline");
    expect(resPut.body.positioning).toBe("the go-to person for Y");

    // Both survive a refresh (re-read from the API).
    const resGet = await request(app).get("/api/client").set(as(USER_C)).expect(200);
    expect(resGet.body.headline).toBe("Carol's legacy headline");
    expect(resGet.body.positioning).toBe("the go-to person for Y");
  });
});

describe("platforms blueprint gate", () => {
  // The Platforms panel unlocks only when the blueprint is 100% complete. The
  // server must enforce this independently of the UI lock: a user with an
  // incomplete blueprint gets 403 on generate, never an AI call.
  const USER_P = `test-iso-p-${suffix}`;

  beforeAll(async () => {
    await cleanupUser(USER_P);
    await request(app)
      .put("/api/client")
      .set(as(USER_P))
      .send({ fullName: "Pat Park", headline: "P headline" })
      .expect(200);
  });

  afterAll(async () => {
    await cleanupUser(USER_P);
  });

  it("blocks generation with 403 until the blueprint is complete", async () => {
    await request(app).post("/api/platforms/generate").set(as(USER_P)).expect(403);
  });

  it("has no platform strategy yet (404)", async () => {
    await request(app).get("/api/platforms").set(as(USER_P)).expect(404);
  });
});

describe("content strategy gate", () => {
  // The Content panel unlocks only when the blueprint is 100% complete AND a
  // platform strategy exists. The server enforces this independently of the UI:
  // an incomplete blueprint, or a complete blueprint with no platform strategy,
  // both get 403 on generate — never an AI call.
  const USER_CS = `test-iso-cs-${suffix}`;

  beforeAll(async () => {
    await cleanupUser(USER_CS);
    await request(app)
      .put("/api/client")
      .set(as(USER_CS))
      .send({ fullName: "Cleo Stone", headline: "C headline" })
      .expect(200);
  });

  afterAll(async () => {
    await cleanupUser(USER_CS);
  });

  it("blocks generation with 403 while the blueprint is incomplete", async () => {
    await request(app).post("/api/content-strategy/generate").set(as(USER_CS)).expect(403);
  });

  it("has no content strategy yet (404)", async () => {
    await request(app).get("/api/content-strategy").set(as(USER_CS)).expect(404);
  });

  it("still 403 with a complete blueprint but no platform strategy", async () => {
    // Content requires BOTH a complete blueprint AND an existing platform
    // strategy. Fill every required blueprint field; with no platform strategy
    // row, generation must still be gated.
    await request(app)
      .put("/api/client")
      .set(as(USER_CS))
      .send({
        fullName: "Cleo Stone",
        headline: "C headline",
        bio: "C bio",
        currentRole: "Founder",
        company: "Acme",
        industry: "SaaS",
        positioning: "the go-to person for X",
        primaryAudience: "founders",
        brandValues: "candor",
        personalityTone: "direct",
        thesis: "X beats Y",
        coreBeliefs: "ship fast",
        signatureFrameworks: "the loop",
        beliefs: "craft matters",
        frustrations: "noise",
        desiredChange: "more signal",
        passions: "building",
        earlyLife: "small town",
        professionalJourney: "engineer to founder",
        signatureAchievements: "scaled to 1M",
        quantifiableResults: "10x growth",
        audienceImpact: "helped thousands",
      })
      .expect(200);

    await request(app).post("/api/content-strategy/generate").set(as(USER_CS)).expect(403);
  });
});

describe("strategy data is purged on reset", () => {
  // /client/reset and account deletion must remove derived strategy rows, not
  // just posts/ideas/narrative/audit. Seed both strategy tables directly (an AI
  // call can't run in tests), reset, and assert the rows are gone.
  const USER_R = `test-iso-r-${suffix}`;

  beforeAll(async () => {
    await cleanupUser(USER_R);
  });

  afterAll(async () => {
    await cleanupUser(USER_R);
  });

  it("deletes platform_strategies and content_strategies rows for the caller", async () => {
    await request(app)
      .put("/api/client")
      .set(as(USER_R))
      .send({ fullName: "Rhea Reset", headline: "R headline" })
      .expect(200);

    const [client] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.userId, USER_R));

    await db.insert(platformStrategiesTable).values({ clientId: client.id });
    await db.insert(contentStrategiesTable).values({ clientId: client.id });
    await db.insert(briefingDossiersTable).values({ clientId: client.id });
    await db.insert(assistantInsightsTable).values({
      clientId: client.id,
      pillar: "patience",
      contexts: ["dashboard"],
      stage: "foundation",
      title: "Slow is smooth",
      body: "A world-class brand compounds over years, not weeks.",
    });

    await request(app).post("/api/client/reset").set(as(USER_R)).expect(204);

    const platforms = await db
      .select()
      .from(platformStrategiesTable)
      .where(eq(platformStrategiesTable.clientId, client.id));
    const content = await db
      .select()
      .from(contentStrategiesTable)
      .where(eq(contentStrategiesTable.clientId, client.id));
    const dossiers = await db
      .select()
      .from(briefingDossiersTable)
      .where(eq(briefingDossiersTable.clientId, client.id));
    const insights = await db
      .select()
      .from(assistantInsightsTable)
      .where(eq(assistantInsightsTable.clientId, client.id));

    expect(platforms).toHaveLength(0);
    expect(content).toHaveLength(0);
    expect(dossiers).toHaveLength(0);
    expect(insights).toHaveLength(0);
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
