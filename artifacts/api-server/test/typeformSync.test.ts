import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Lock in the Typeform sync correctness rules (full pagination, advancing the
// submitted_at cursor only after all pages, dedup by response token with a DB
// unique-index backstop) so a future change cannot silently reintroduce skipped
// or double-ingested leads. No live Typeform API is hit: the managed connector
// proxy is mocked. The sync hardcodes MARKETING_TENANT, so we override it to a
// throwaway tenant and purge it afterward, never touching real 'arc' data.

// Hoisted so the vi.mock factories (evaluated before module init) can reference
// these. A unique tenant keeps the test isolated and idempotent.
const hoisted = vi.hoisted(() => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    TENANT: `test-typeform-${suffix}`,
    suffix,
    // Mutable handler the mocked proxy delegates to; each test sets it.
    proxy: {
      handler: (async () => {
        throw new Error("proxy handler not set");
      }) as (provider: string, path: string) => Promise<unknown>,
      paths: [] as string[],
    },
  };
});

// Mock the managed connector proxy so no real Typeform request is made.
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy(provider: string, path: string) {
      hoisted.proxy.paths.push(path);
      return hoisted.proxy.handler(provider, path);
    }
  },
}));

// Override the hardcoded marketing tenant so all sync reads/writes land in a
// throwaway tenant instead of the real 'arc' data.
vi.mock("../src/services/marketing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/services/marketing")>();
  return { ...actual, MARKETING_TENANT: hoisted.TENANT };
});

// Keep captureLead / logMarketingActivity real (so the DB dedup path is genuinely
// exercised) but neutralize the fire-and-forget AI qualification.
vi.mock("../src/services/marketingData", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/services/marketingData")>();
  return { ...actual, qualifyInBackground: () => {} };
});

import {
  db,
  pool,
  marketingLeadsTable,
  marketingFormSourcesTable,
  type MarketingFormSource,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { syncFormSource } from "../src/services/typeform";
import { deleteTenantMarketingData } from "../src/services/marketingData";

const { TENANT, suffix } = hoisted;
const FORM_ID = `form-${suffix}`;

// Stable field identifiers the source field-mapping points at.
const EMAIL_REF = "email_ref";
const NAME_REF = "name_ref";

function emailAnswer(value: string) {
  return {
    field: { id: "fld_email", ref: EMAIL_REF, type: "email" },
    type: "email",
    email: value,
  };
}
function nameAnswer(value: string) {
  return {
    field: { id: "fld_name", ref: NAME_REF, type: "text" },
    type: "text",
    text: value,
  };
}

// Five responses, newest-first (as Typeform returns them). r3 deliberately has
// no email answer, so it must be skipped as unusable. submitted_at descends, so
// the newest cursor value across all pages is r1's timestamp.
const responses = [
  {
    token: `tok-1-${suffix}`,
    submitted_at: "2026-06-10T10:00:00Z",
    answers: [emailAnswer("a@example.com"), nameAnswer("Ada")],
  },
  {
    token: `tok-2-${suffix}`,
    submitted_at: "2026-06-09T10:00:00Z",
    answers: [emailAnswer("b@example.com")],
  },
  {
    token: `tok-3-${suffix}`,
    submitted_at: "2026-06-08T10:00:00Z",
    answers: [nameAnswer("No Email")],
  },
  {
    token: `tok-4-${suffix}`,
    submitted_at: "2026-06-07T10:00:00Z",
    answers: [emailAnswer("d@example.com")],
  },
  {
    token: `tok-5-${suffix}`,
    submitted_at: "2026-06-06T10:00:00Z",
    answers: [emailAnswer("e@example.com")],
  },
];
const NEWEST_SUBMITTED_AT = responses[0].submitted_at;

// Page through `responses` two at a time using the `before`=last-token cursor,
// exactly how the real paginator walks Typeform. Returns a Response-like object.
function makeProxyHandler() {
  return async (_provider: string, path: string) => {
    const url = new URL(`http://typeform.local${path}`);
    const before = url.searchParams.get("before");
    let start = 0;
    if (before) {
      const idx = responses.findIndex((r) => r.token === before);
      start = idx === -1 ? responses.length : idx + 1;
    }
    const items = responses.slice(start, start + 2);
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ total_items: responses.length, items }),
    };
  };
}

async function loadSource(): Promise<MarketingFormSource> {
  const [row] = await db
    .select()
    .from(marketingFormSourcesTable)
    .where(
      and(
        eq(marketingFormSourcesTable.tenant, TENANT),
        eq(marketingFormSourcesTable.formId, FORM_ID),
      ),
    );
  return row;
}

async function leadCount(): Promise<number> {
  const rows = await db
    .select({ id: marketingLeadsTable.id })
    .from(marketingLeadsTable)
    .where(eq(marketingLeadsTable.tenant, TENANT));
  return rows.length;
}

beforeAll(async () => {
  // Force the tiny page size so a 5-response set spans three pages.
  process.env.MARKETING_TYPEFORM_PAGE_SIZE = "2";
  hoisted.proxy.handler = makeProxyHandler();

  await db.insert(marketingFormSourcesTable).values({
    tenant: TENANT,
    provider: "typeform",
    formId: FORM_ID,
    formTitle: "Test Form",
    fieldMapping: {
      email: EMAIL_REF,
      name: NAME_REF,
      company: null,
      message: null,
    },
  });
});

afterAll(async () => {
  delete process.env.MARKETING_TYPEFORM_PAGE_SIZE;
  await deleteTenantMarketingData(TENANT);
  await pool.end();
});

describe("syncFormSource", () => {
  it("ingests every response across all pages, skips the one missing an email, and advances the cursor", async () => {
    hoisted.proxy.paths.length = 0;
    const source = await loadSource();

    const result = await syncFormSource(source);

    // 4 ingested (r1, r2, r4, r5), 1 skipped (r3 has no email), 5 collected.
    expect(result).toEqual({
      formId: FORM_ID,
      ingested: 4,
      skipped: 1,
      total: 5,
    });
    expect(await leadCount()).toBe(4);

    // Proof the paginator walked all three pages (2 + 2 + 1) rather than
    // stopping at the first page.
    expect(hoisted.proxy.paths).toHaveLength(3);
    expect(hoisted.proxy.paths[0]).not.toContain("before=");
    expect(hoisted.proxy.paths[1]).toContain(
      `before=${encodeURIComponent(responses[1].token)}`,
    );
    expect(hoisted.proxy.paths[2]).toContain(
      `before=${encodeURIComponent(responses[3].token)}`,
    );

    // The cursor advances to the newest submitted_at seen across ALL pages,
    // only after every page was processed.
    const updated = await loadSource();
    expect(updated.lastResponseToken).toBe(NEWEST_SUBMITTED_AT);
    expect(updated.lastSyncedAt).not.toBeNull();

    // The email-less response never became a lead.
    const r3Lead = await db
      .select({ id: marketingLeadsTable.id })
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.tenant, TENANT),
          eq(marketingLeadsTable.externalId, responses[2].token),
        ),
      );
    expect(r3Lead).toHaveLength(0);

    // Mapped fields landed on the ingested lead.
    const [r1Lead] = await db
      .select()
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.tenant, TENANT),
          eq(marketingLeadsTable.externalId, responses[0].token),
        ),
      );
    expect(r1Lead.email).toBe("a@example.com");
    expect(r1Lead.name).toBe("Ada");
    expect(r1Lead.externalSource).toBe("typeform");
    expect(r1Lead.source).toBe("typeform");
  });

  it("re-running the sync ingests zero duplicates (dedup by response token)", async () => {
    const before = await leadCount();
    expect(before).toBe(4);

    // Same responses are returned again; the DB token dedup must skip them all.
    const result = await syncFormSource(await loadSource());

    expect(result).toEqual({
      formId: FORM_ID,
      ingested: 0,
      skipped: 5,
      total: 5,
    });
    expect(await leadCount()).toBe(4);

    // Cursor stays put (nothing newer than what we already had).
    const updated = await loadSource();
    expect(updated.lastResponseToken).toBe(NEWEST_SUBMITTED_AT);
  });

  it("ingests only genuinely new responses on a subsequent sync", async () => {
    // Simulate a new submission arriving (newer than the current cursor).
    const newResp = {
      token: `tok-6-${suffix}`,
      submitted_at: "2026-06-11T10:00:00Z",
      answers: [emailAnswer("f@example.com"), nameAnswer("Finn")],
    };
    responses.unshift(newResp);
    try {
      const result = await syncFormSource(await loadSource());

      // Only the brand-new response is ingested; the other 5 are deduped.
      expect(result).toEqual({
        formId: FORM_ID,
        ingested: 1,
        skipped: 5,
        total: 6,
      });
      expect(await leadCount()).toBe(5);

      // Cursor advances to the newest submission.
      const updated = await loadSource();
      expect(updated.lastResponseToken).toBe(newResp.submitted_at);
    } finally {
      responses.shift();
    }
  });
});
