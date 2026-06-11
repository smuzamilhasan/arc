import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// A BYO-key connector can be connected two ways: a key typed into the
// Connections UI (encrypted at rest) OR a Replit secret handed to the operator.
// This test covers the secret path: with MARKETING_<PROVIDER>_API_KEY set and no
// DB row, both /marketing/connectors and /marketing/connections must report the
// connector as connected (so the Build UI enables provisioning), while a byokey
// connector with neither a row nor a secret stays disconnected.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ADMIN_USER = `test-envconn-admin-${suffix}`;
const ADMIN_EMAIL = `envconn-admin-${suffix}@example.com`;

process.env.ADMIN_EMAILS = ADMIN_EMAIL;
// Deterministic env-backed Make credentials for this worker only.
process.env.MARKETING_MAKE_API_KEY = "test-make-key";
process.env.MARKETING_MAKE_API_BASE_URL = "https://us2.make.com";
// Ensure the negative-case connector has no secret.
delete process.env.MARKETING_BEEHIIV_API_KEY;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-user-id"] ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async (userId: string) => ({
        id: userId,
        firstName: "Test",
        lastName: "Admin",
        primaryEmailAddressId: "email-1",
        emailAddresses: [{ id: "email-1", emailAddress: ADMIN_EMAIL }],
      }),
      getUserList: async () => ({ data: [], totalCount: 0 }),
    },
  },
}));

import app from "../src/app";
import { db, pool, marketingConnectionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { MARKETING_TENANT } from "../src/services/marketing";

function as(userId: string) {
  return { "x-test-user-id": userId };
}

beforeAll(async () => {
  // Make must be env-only for this test: remove any Connections-UI row so the
  // synthesized (secret-backed) path is what we exercise.
  await db
    .delete(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, "make"),
      ),
    );
});

afterAll(async () => {
  await pool.end();
});

describe("env-backed connector status", () => {
  it("requires admin", async () => {
    const res = await request(app).get("/api/marketing/connectors");
    expect(res.status).toBe(401);
  });

  it("reports a secret-backed byokey connector as connected on /connectors", async () => {
    const res = await request(app)
      .get("/api/marketing/connectors")
      .set(as(ADMIN_USER));
    expect(res.status).toBe(200);
    const make = res.body.find((c: { id: string }) => c.id === "make");
    expect(make).toBeTruthy();
    expect(make.connected).toBe(true);
    expect(make.accountRef).toBe("https://us2.make.com");

    // A byokey connector with no row and no secret stays disconnected.
    const beehiiv = res.body.find((c: { id: string }) => c.id === "beehiiv");
    expect(beehiiv?.connected).toBe(false);
  });

  it("synthesizes a secret-backed connection on /connections (no DB row)", async () => {
    const res = await request(app)
      .get("/api/marketing/connections")
      .set(as(ADMIN_USER));
    expect(res.status).toBe(200);
    const make = res.body.find(
      (c: { provider: string }) => c.provider === "make",
    );
    expect(make).toBeTruthy();
    expect(make.connected).toBe(true);
    expect(make.accountRef).toBe("https://us2.make.com");
  });
});
