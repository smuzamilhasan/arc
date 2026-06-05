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
import {
  db,
  pool,
  clientProfileTable,
  assistantMessagesTable,
  type AssistantAction,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const USER_A = `test-batch-a-${suffix}`;
const USER_B = `test-batch-b-${suffix}`;

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
  await db.delete(clientProfileTable).where(eq(clientProfileTable.id, client.id));
}

// A strategist-scoped action: edit a macro profile field. Each proposal targets
// a distinct field so applying several in one batch produces observable changes.
function proposedProfile(title: string, payload: Record<string, unknown>): AssistantAction {
  return {
    id: randomUUID(),
    kind: "update_profile",
    title,
    rationale: "",
    status: "proposed",
    rejectionComment: null,
    diff: [],
    payload,
  };
}

// Seed an assistant message with proposed actions and return their ids.
async function seedProposals(clientId: number, actions: AssistantAction[]): Promise<string[]> {
  await db.insert(assistantMessagesTable).values({
    clientId,
    role: "assistant",
    content: "Here are some proposals.",
    actions,
  });
  return actions.map((a) => a.id);
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

describe("assistant batch confirm/reject", () => {
  it("requires authentication", async () => {
    await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .send({ actionIds: ["x"] })
      .expect(401);
    await request(app)
      .post("/api/assistant/actions/reject-batch")
      .send({ actionIds: ["x"] })
      .expect(401);
  });

  it("rejects an empty actionIds list with 400", async () => {
    await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .set(as(USER_A))
      .send({ actionIds: [] })
      .expect(400);
  });

  it("confirm-batch applies every proposed action to the underlying profile", async () => {
    const clientId = await clientIdFor(USER_A);
    const ids = await seedProposals(clientId, [
      proposedProfile("Set headline", { headline: "Batched headline" }),
      proposedProfile("Set positioning", { positioning: "Batched positioning" }),
      proposedProfile("Set industry", { industry: "Batched industry" }),
    ]);

    const res = await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .set(as(USER_A))
      .send({ actionIds: ids })
      .expect(200);

    expect(res.body.actions).toHaveLength(3);
    expect(res.body.actions.every((a: AssistantAction) => a.status === "applied")).toBe(true);

    const [client] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, clientId));
    expect(client.headline).toBe("Batched headline");
    expect(client.positioning).toBe("Batched positioning");
    expect(client.industry).toBe("Batched industry");
  });

  it("confirm-batch is idempotent: already-resolved actions are skipped", async () => {
    const clientId = await clientIdFor(USER_A);
    const ids = await seedProposals(clientId, [
      proposedProfile("One-time change", { headline: "Idempotent headline" }),
    ]);

    await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .set(as(USER_A))
      .send({ actionIds: ids })
      .expect(200);
    // Second confirm should skip the already-applied action.
    const res = await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .set(as(USER_A))
      .send({ actionIds: ids })
      .expect(200);
    expect(res.body.actions).toHaveLength(0);
  });

  it("reject-batch dismisses every proposed action without applying changes", async () => {
    const clientId = await clientIdFor(USER_A);
    const [before] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, clientId));

    const ids = await seedProposals(clientId, [
      proposedProfile("Rejected headline", { headline: "Should not stick" }),
      proposedProfile("Rejected bio", { bio: "Should not stick either" }),
    ]);

    const res = await request(app)
      .post("/api/assistant/actions/reject-batch")
      .set(as(USER_A))
      .send({ actionIds: ids })
      .expect(200);

    expect(res.body.actions).toHaveLength(2);
    expect(res.body.actions.every((a: AssistantAction) => a.status === "rejected")).toBe(true);

    const [after] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, clientId));
    expect(after.headline).toBe(before.headline);
    expect(after.bio).toBe(before.bio);
  });

  it("does not touch another client's proposed actions", async () => {
    const clientB = await clientIdFor(USER_B);
    const ids = await seedProposals(clientB, [
      proposedProfile("B's change", { headline: "B's new headline" }),
    ]);

    // User A tries to confirm User B's action ids.
    const res = await request(app)
      .post("/api/assistant/actions/confirm-batch")
      .set(as(USER_A))
      .send({ actionIds: ids })
      .expect(200);
    expect(res.body.actions).toHaveLength(0);

    // B's action is still proposed and B's profile is unchanged.
    const [row] = await db
      .select()
      .from(assistantMessagesTable)
      .where(eq(assistantMessagesTable.clientId, clientB));
    expect(row.actions[0].status).toBe("proposed");
    const [client] = await db
      .select()
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, clientB));
    expect(client.headline).toBe("B headline");
  });
});
