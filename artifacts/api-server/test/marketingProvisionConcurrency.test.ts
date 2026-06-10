import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// The apply route atomically claims a planned run (planned -> applying) before
// any external write, so two simultaneous confirms can never both provision the
// external tool. This test fires two concurrent apply requests against the same
// run and asserts exactly one succeeds (the other gets 409) and that the stubbed
// external adapter.apply runs exactly once. No real provider call is made.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ADMIN_USER = `test-prov-admin-${suffix}`;
const ADMIN_EMAIL = `prov-admin-${suffix}@example.com`;

process.env.ADMIN_EMAILS = ADMIN_EMAIL;

// Shared spy for the external apply. Created via vi.hoisted so the hoisted
// vi.mock factory below can reference it.
const { applySpy } = vi.hoisted(() => ({ applySpy: vi.fn() }));

// A 2-party barrier used to release both apply requests from the auth gate at
// the same tick. This guarantees both handlers reach the atomic claim with the
// run still `planned`, so the loser deterministically hits the 409 claim-race
// path (rather than the earlier "already applying" 400 check). getUser is only
// called by requireAdmin, once per request, so exactly the two concurrent apply
// requests pass through it.
const { authBarrier } = vi.hoisted(() => {
  let count = 0;
  let resolvers: Array<() => void> = [];
  return {
    authBarrier: () =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
        count += 1;
        if (count >= 2) {
          const pending = resolvers;
          resolvers = [];
          count = 0;
          pending.forEach((r) => r());
        }
      }),
  };
});

// Mock Clerk: resolve the acting user from a test-only header and report the
// admin email so requireAdmin passes for our admin user. getUser waits on the
// barrier so both concurrent requests advance together.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-user-id"] ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async (userId: string) => {
        await authBarrier();
        return {
          id: userId,
          firstName: "Test",
          lastName: "Admin",
          primaryEmailAddressId: "email-1",
          emailAddresses: [{ id: "email-1", emailAddress: ADMIN_EMAIL }],
        };
      },
      getUserList: async () => ({ data: [], totalCount: 0 }),
    },
  },
}));

// Stub the provisioning engine so apply never touches a real external tool. The
// real ProvisionError is preserved (the route uses instanceof on it).
vi.mock("../src/services/provisioning", async (importActual) => {
  const actual =
    await importActual<typeof import("../src/services/provisioning")>();
  return {
    ...actual,
    getProvisionAdapter: (provider: string) => ({
      provider,
      plan: vi.fn(),
      apply: applySpy,
    }),
  };
});

import app from "../src/app";
import {
  db,
  pool,
  marketingProvisionRunsTable,
  marketingActivityTable,
} from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { MARKETING_TENANT } from "../src/services/marketing";

function as(userId: string) {
  return { "x-test-user-id": userId };
}

let runId = 0;
// Activity rows are written under the real MARKETING_TENANT, so record the
// high-water mark before the test and purge anything we add afterward.
let activityHighWaterMark = 0;

beforeAll(async () => {
  applySpy.mockReset();
  applySpy.mockImplementation(async () => {
    // Small delay so both requests are genuinely in flight while the claim races.
    await new Promise((r) => setTimeout(r, 50));
    return {
      applied: [{ op: "create_form", summary: "stub" }],
      outputs: { formId: "stub-form" },
    };
  });

  const [maxActivity] = await db
    .select({ id: marketingActivityTable.id })
    .from(marketingActivityTable)
    .where(eq(marketingActivityTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingActivityTable.id))
    .limit(1);
  activityHighWaterMark = maxActivity?.id ?? 0;

  const [run] = await db
    .insert(marketingProvisionRunsTable)
    .values({
      tenant: MARKETING_TENANT,
      blueprintId: null,
      provider: "typeform",
      status: "planned",
      plan: {
        provider: "typeform",
        summary: "Create the intake form",
        changes: [{ op: "create_form", summary: "New form" }],
      },
    })
    .returning();
  runId = run.id;
});

afterAll(async () => {
  if (runId) {
    await db
      .delete(marketingProvisionRunsTable)
      .where(eq(marketingProvisionRunsTable.id, runId));
  }
  // Remove activity rows this test created under the real tenant.
  await db
    .delete(marketingActivityTable)
    .where(
      and(
        eq(marketingActivityTable.tenant, MARKETING_TENANT),
        gt(marketingActivityTable.id, activityHighWaterMark),
      ),
    );
  await pool.end();
});

describe("provision apply concurrency", () => {
  it("lets exactly one of two concurrent confirms apply the run", async () => {
    const fire = () =>
      request(app)
        .post(`/api/marketing/provision/runs/${runId}/apply`)
        .set(as(ADMIN_USER));

    const [a, b] = await Promise.all([fire(), fire()]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // The external tool was written exactly once despite two confirms.
    expect(applySpy).toHaveBeenCalledTimes(1);

    const winner = a.status === 200 ? a : b;
    expect(winner.body.status).toBe("applied");

    const loser = a.status === 409 ? a : b;
    expect(loser.body.error).toMatch(/already being applied/i);

    // The persisted run settled to applied, never left dangling in `applying`.
    const [persisted] = await db
      .select()
      .from(marketingProvisionRunsTable)
      .where(eq(marketingProvisionRunsTable.id, runId));
    expect(persisted.status).toBe("applied");
  });
});
