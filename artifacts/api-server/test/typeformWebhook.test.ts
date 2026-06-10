import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";

// The Typeform webhook gives near-instant lead capture. These tests cover:
//   1. The security boundary — HMAC signature verification over the raw body.
//   2. The ingest path's dedup guarantee — a response delivered by both the
//      webhook and the backfill poller must become exactly one lead.
//   3. The webhook lifecycle wiring — creating/enabling a form source must
//      register the webhook (PUT) and disabling/deleting one must remove it
//      (DELETE), with a proxy failure swallowed so the DB write still succeeds.
//
// No live Typeform API is hit: the managed connector proxy is mocked. The route
// hardcodes the real 'arc' tenant, so we use uniquely-named throwaway forms and
// tokens and clean up only those specific rows afterward.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const FORM_ID = `test-form-${suffix}`;
const TOKEN = `test-token-${suffix}`;
const EMAIL = `${suffix}@example.com`;

// Route-level webhook lifecycle fixtures.
const ADMIN_USER = `test-admin-${suffix}`;
const ADMIN_EMAIL = `admin-${suffix}@example.com`;
const WEBHOOK_SECRET = `whsec-${suffix}`;
const CREATE_FORM_ID = `test-create-${suffix}`;
const DISABLE_FORM_ID = `test-disable-${suffix}`;
const DELETE_FORM_ID = `test-delete-${suffix}`;
const FAIL_FORM_ID = `test-fail-${suffix}`;

// Only the admin user's email is in the allowlist; only an admin may manage
// form sources, so requireAdmin must resolve this user as an admin.
process.env.ADMIN_EMAILS = ADMIN_EMAIL;
// A configured secret is required for webhook registration to even attempt the
// proxy call (otherwise it short-circuits and the poller is the only path).
process.env.MARKETING_TYPEFORM_WEBHOOK_SECRET = WEBHOOK_SECRET;

// Hoisted so the vi.mock factory (evaluated before module init) can capture the
// proxy calls the webhook lifecycle makes, and toggle a simulated failure.
const proxyMock = vi.hoisted(() => ({
  calls: [] as Array<{
    provider: string;
    path: string;
    method?: string;
    body?: unknown;
  }>,
  shouldFail: { value: false },
}));

// Mock the managed connector proxy so no real Typeform request is made. We
// record every call so the tests can assert the exact PUT/DELETE, and can make
// it fail on demand to prove a proxy error is swallowed.
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    async proxy(
      provider: string,
      path: string,
      opts?: { method?: string; body?: unknown },
    ) {
      proxyMock.calls.push({
        provider,
        path,
        method: opts?.method,
        body: opts?.body,
      });
      if (proxyMock.shouldFail.value) {
        return {
          ok: false,
          status: 500,
          text: async () => "simulated proxy failure",
          json: async () => ({}),
        };
      }
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
    }
  },
}));

// Mock Clerk so requireAdmin resolves our test admin from a header-supplied id.
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

import request from "supertest";
import app from "../src/app";
import {
  db,
  pool,
  marketingLeadsTable,
  marketingActionsTable,
  marketingActivityTable,
  marketingFormSourcesTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  verifyTypeformSignature,
  ingestTypeformWebhook,
} from "../src/services/typeform";
import { appOrigin } from "../src/services/inviteEmail";

// The real tenant the route writes under and the stable per-tenant webhook tag
// the lifecycle targets (must mirror typeform.ts: `arc-marketing-${tenant}`).
const WEBHOOK_TAG = "arc-marketing-arc";
const EXPECTED_WEBHOOK_URL = `${appOrigin()}/api/marketing/intake/typeform/webhook`;

const ALL_ROUTE_FORM_IDS = [
  CREATE_FORM_ID,
  DISABLE_FORM_ID,
  DELETE_FORM_ID,
  FAIL_FORM_ID,
];

function admin() {
  return { "x-test-user-id": ADMIN_USER };
}

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("base64");
}

function webhookBody(formId: string, token: string): string {
  return JSON.stringify({
    event_id: "evt",
    event_type: "form_response",
    form_response: {
      form_id: formId,
      token,
      submitted_at: new Date().toISOString(),
      answers: [
        {
          field: { id: "f1", ref: "email_ref", type: "email" },
          type: "email",
          email: EMAIL,
        },
      ],
    },
  });
}

afterAll(async () => {
  const leads = await db
    .select({ id: marketingLeadsTable.id })
    .from(marketingLeadsTable)
    .where(eq(marketingLeadsTable.externalId, TOKEN));
  for (const { id } of leads) {
    await db.delete(marketingActionsTable).where(eq(marketingActionsTable.leadId, id));
    await db.delete(marketingActivityTable).where(eq(marketingActivityTable.leadId, id));
  }
  await db.delete(marketingLeadsTable).where(eq(marketingLeadsTable.externalId, TOKEN));
  await db
    .delete(marketingFormSourcesTable)
    .where(
      inArray(marketingFormSourcesTable.formId, [FORM_ID, ...ALL_ROUTE_FORM_IDS]),
    );
  await pool.end();
});

describe("verifyTypeformSignature", () => {
  const secret = "shh-secret";
  const body = webhookBody(FORM_ID, TOKEN);

  it("accepts a correctly signed payload", () => {
    expect(verifyTypeformSignature(Buffer.from(body), sign(body, secret), secret)).toBe(
      true,
    );
  });

  it("rejects a payload signed with the wrong secret", () => {
    expect(
      verifyTypeformSignature(Buffer.from(body), sign(body, "wrong"), secret),
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = sign(body, secret);
    const tampered = body.replace(EMAIL, "attacker@example.com");
    expect(verifyTypeformSignature(Buffer.from(tampered), sig, secret)).toBe(false);
  });

  it("rejects a missing signature header or body", () => {
    expect(verifyTypeformSignature(Buffer.from(body), undefined, secret)).toBe(false);
    expect(verifyTypeformSignature(undefined, sign(body, secret), secret)).toBe(false);
  });
});

describe("ingestTypeformWebhook", () => {
  it("skips a malformed payload", async () => {
    expect(await ingestTypeformWebhook({})).toBe("skipped");
    expect(await ingestTypeformWebhook({ form_response: { token: "x" } })).toBe(
      "skipped",
    );
  });

  it("returns no_source when no enabled form source matches the form", async () => {
    const parsed = JSON.parse(webhookBody(`unknown-${suffix}`, `tok-${suffix}`));
    expect(await ingestTypeformWebhook(parsed)).toBe("no_source");
  });

  it("ingests a response once and dedups a duplicate delivery", async () => {
    await db.insert(marketingFormSourcesTable).values({
      provider: "typeform",
      formId: FORM_ID,
      formTitle: "Test Form",
      fieldMapping: { email: "email_ref", name: null, company: null, message: null },
      enabled: true,
    });

    const parsed = JSON.parse(webhookBody(FORM_ID, TOKEN));

    expect(await ingestTypeformWebhook(parsed)).toBe("ingested");
    // The same response delivered again (e.g. the catch-up poller also sees it)
    // must not create a second lead.
    expect(await ingestTypeformWebhook(parsed)).toBe("skipped");

    const leads = await db
      .select()
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.externalSource, "typeform"),
          eq(marketingLeadsTable.externalId, TOKEN),
        ),
      );
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe(EMAIL);
    expect(leads[0].source).toBe("typeform");
  });
});

describe("form-source webhook lifecycle", () => {
  beforeEach(() => {
    proxyMock.calls.length = 0;
    proxyMock.shouldFail.value = false;
  });

  function callsFor(formId: string) {
    return proxyMock.calls.filter((c) =>
      c.path.includes(`/forms/${encodeURIComponent(formId)}/webhooks/`),
    );
  }

  it("registers a webhook (PUT) with the right tag, url and secret when an enabled source is created", async () => {
    const res = await request(app)
      .post("/api/marketing/form-sources")
      .set(admin())
      .send({
        formId: CREATE_FORM_ID,
        formTitle: "Create Test",
        fieldMapping: { email: "email_ref" },
        enabled: true,
      });
    expect(res.status).toBe(200);

    const calls = callsFor(CREATE_FORM_ID);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.provider).toBe("typeform");
    expect(call.method).toBe("PUT");
    expect(call.path).toBe(
      `/forms/${encodeURIComponent(CREATE_FORM_ID)}/webhooks/${encodeURIComponent(WEBHOOK_TAG)}`,
    );
    expect(call.body).toMatchObject({
      url: EXPECTED_WEBHOOK_URL,
      enabled: true,
      secret: WEBHOOK_SECRET,
      verify_ssl: true,
    });
  });

  it("removes the webhook (DELETE) when a source is saved disabled", async () => {
    const res = await request(app)
      .post("/api/marketing/form-sources")
      .set(admin())
      .send({
        formId: DISABLE_FORM_ID,
        formTitle: "Disable Test",
        fieldMapping: { email: "email_ref" },
        enabled: false,
      });
    expect(res.status).toBe(200);

    const calls = callsFor(DISABLE_FORM_ID);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe(
      `/forms/${encodeURIComponent(DISABLE_FORM_ID)}/webhooks/${encodeURIComponent(WEBHOOK_TAG)}`,
    );
  });

  it("removes the webhook (DELETE) when a source is deleted", async () => {
    const created = await request(app)
      .post("/api/marketing/form-sources")
      .set(admin())
      .send({
        formId: DELETE_FORM_ID,
        formTitle: "Delete Test",
        fieldMapping: { email: "email_ref" },
        enabled: true,
      });
    expect(created.status).toBe(200);
    const id = created.body.id as number;

    proxyMock.calls.length = 0;

    const res = await request(app)
      .delete(`/api/marketing/form-sources/${id}`)
      .set(admin());
    expect(res.status).toBe(204);

    const calls = callsFor(DELETE_FORM_ID);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe(
      `/forms/${encodeURIComponent(DELETE_FORM_ID)}/webhooks/${encodeURIComponent(WEBHOOK_TAG)}`,
    );

    const rows = await db
      .select()
      .from(marketingFormSourcesTable)
      .where(eq(marketingFormSourcesTable.formId, DELETE_FORM_ID));
    expect(rows).toHaveLength(0);
  });

  it("swallows a proxy failure so the form-source DB write still succeeds", async () => {
    proxyMock.shouldFail.value = true;

    const res = await request(app)
      .post("/api/marketing/form-sources")
      .set(admin())
      .send({
        formId: FAIL_FORM_ID,
        formTitle: "Fail Test",
        fieldMapping: { email: "email_ref" },
        enabled: true,
      });

    // The webhook PUT was attempted (and failed)...
    const calls = callsFor(FAIL_FORM_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");

    // ...yet the request still succeeded and the row was persisted.
    expect(res.status).toBe(200);
    expect(res.body.formId).toBe(FAIL_FORM_ID);

    const rows = await db
      .select()
      .from(marketingFormSourcesTable)
      .where(eq(marketingFormSourcesTable.formId, FAIL_FORM_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
  });
});
