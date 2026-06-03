import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ADMIN_USER = `test-admin-${suffix}`;
const PLAIN_USER = `test-plain-${suffix}`;
const TARGET_USER = `test-target-${suffix}`;

const ADMIN_EMAIL = `admin-${suffix}@example.com`;
const emailByUser: Record<string, string> = {
  [ADMIN_USER]: ADMIN_EMAIL,
  [PLAIN_USER]: `plain-${suffix}@example.com`,
  [TARGET_USER]: `target-${suffix}@example.com`,
};

// Only the admin user's email is in the allowlist.
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

// Mock Clerk: `getAuth` resolves the user id from a test-only header, and
// `clerkClient.users.getUser` returns a minimal user with a primary email so
// `requireAdmin` can check it against ADMIN_EMAILS.
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
        lastName: "User",
        primaryEmailAddressId: "email-1",
        emailAddresses: [
          { id: "email-1", emailAddress: emailByUser[userId] ?? "unknown@example.com" },
        ],
      }),
      getUserList: async () => ({ data: [], totalCount: 0 }),
    },
  },
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

function as(userId: string) {
  return { "x-test-user-id": userId };
}

let targetClientId = 0;

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

beforeAll(async () => {
  await cleanupUser(TARGET_USER);

  const res = await request(app)
    .put("/api/client")
    .set(as(TARGET_USER))
    .send({ fullName: "Target User", headline: "A headline" })
    .expect(200);
  targetClientId = res.body.id;
});

afterAll(async () => {
  await cleanupUser(TARGET_USER);
  await pool.end();
});

describe("admin authz", () => {
  describe("GET /api/admin/access", () => {
    it("returns 401 when signed out", async () => {
      await request(app).get("/api/admin/access").expect(401);
    });

    it("returns { isAdmin: false } for a non-admin user", async () => {
      const res = await request(app)
        .get("/api/admin/access")
        .set(as(PLAIN_USER))
        .expect(200);
      expect(res.body).toEqual({ isAdmin: false });
    });

    it("returns { isAdmin: true } for an admin user", async () => {
      const res = await request(app)
        .get("/api/admin/access")
        .set(as(ADMIN_USER))
        .expect(200);
      expect(res.body).toEqual({ isAdmin: true });
    });
  });

  describe("GET /api/admin/users", () => {
    it("returns 401 when signed out", async () => {
      await request(app).get("/api/admin/users").expect(401);
    });

    it("returns 403 for a non-admin user", async () => {
      await request(app).get("/api/admin/users").set(as(PLAIN_USER)).expect(403);
    });

    it("returns the full user list for an admin", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set(as(ADMIN_USER))
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((u: { clientId: number }) => u.clientId);
      expect(ids).toContain(targetClientId);
    });
  });

  describe("GET /api/admin/users/:clientId", () => {
    it("returns 401 when signed out", async () => {
      await request(app).get(`/api/admin/users/${targetClientId}`).expect(401);
    });

    it("returns 403 for a non-admin user", async () => {
      await request(app)
        .get(`/api/admin/users/${targetClientId}`)
        .set(as(PLAIN_USER))
        .expect(403);
    });

    it("returns the user's detail for an admin", async () => {
      const res = await request(app)
        .get(`/api/admin/users/${targetClientId}`)
        .set(as(ADMIN_USER))
        .expect(200);
      expect(res.body.profile.fullName).toBe("Target User");
    });

    it("never exposes the userId in the admin detail payload", async () => {
      const res = await request(app)
        .get(`/api/admin/users/${targetClientId}`)
        .set(as(ADMIN_USER))
        .expect(200);
      expect(res.body.profile.userId).toBeUndefined();
    });
  });
});
