import { describe, it, expect, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import {
  db,
  pool,
  marketingLeadsTable,
  marketingActionsTable,
  marketingActivityTable,
  marketingFormSourcesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  verifyTypeformSignature,
  ingestTypeformWebhook,
} from "../src/services/typeform";

// The Typeform webhook gives near-instant lead capture. These tests cover the
// security boundary (HMAC signature verification over the raw body) and the
// ingest path's dedup guarantee — a response delivered by both the webhook and
// the backfill poller must become exactly one lead. ingestTypeformWebhook is
// hardcoded to the real 'arc' tenant, so we use a uniquely-named throwaway form
// and response token and clean those specific rows up afterward.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const FORM_ID = `test-form-${suffix}`;
const TOKEN = `test-token-${suffix}`;
const EMAIL = `${suffix}@example.com`;

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
    .where(eq(marketingFormSourcesTable.formId, FORM_ID));
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
