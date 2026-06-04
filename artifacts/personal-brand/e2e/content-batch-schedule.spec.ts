import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";

// End-to-end coverage for the Content Library batch scheduling flow
// (artifacts/personal-brand/src/pages/content.tsx): open the "Plan a schedule"
// dialog, confirm the draft posts are pre-selected, pick a start date + cadence,
// schedule them, and verify they land grouped by date in the Calendar view.
// This guards the gating (Plan schedule needs schedulable posts), the selection
// (all drafts pre-selected), and the date-grouping/layout math — including the
// previously-crashing per-post date preview chip ("Invalid time value" on a
// transiently empty start date) and the start date being honored exactly.
//
// Setup mirrors narrative.spec.ts / blueprint-pillar-isolation.spec.ts: create a
// throwaway Clerk user, sign in with a Backend sign-in token ("ticket" strategy,
// which bypasses MFA / verification the instance may enforce), read its id from
// window.Clerk, then seed everything the Content page gates on directly in the DB
// (a complete Blueprint client_profile + platform_strategies + content_strategies
// + draft posts). Seeding keeps the test deterministic (no AI generation runs).

const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const token = Math.random().toString(36).slice(2, 8);
const email = `content.e2e.${token}@example.com`;
const password = `Arc-e2e-${token}-Xyz!92`;

// Distinct draft post titles so they are unambiguous in the library + calendar.
const ALPHA = `Alpha ${token}`;
const BRAVO = `Bravo ${token}`;
const CHARLIE = `Charlie ${token}`;

// A fixed future start date keeps the calendar day headers deterministic.
// 2027-03-01 is a Monday, so with a 1-day cadence the three posts land on
// Mon Mar 1, Tue Mar 2, Wed Mar 3 (2027).
const START_DATE = "2027-03-01";

let clerkUserId: string | null = null;
let clientId: number | null = null;

async function clerkFetch(path: string, init: RequestInit) {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Clerk API ${path} failed: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

test.beforeAll(async () => {
  expect(SECRET, "CLERK_SECRET_KEY must be set").toBeTruthy();
  expect(DATABASE_URL, "DATABASE_URL must be set").toBeTruthy();
  const user = await clerkFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
    }),
  });
  clerkUserId = user.id;
});

test.afterAll(async () => {
  if (clientId != null) {
    await withDb(async (db) => {
      await db.query("DELETE FROM posts WHERE client_id = $1", [clientId]);
      await db.query("DELETE FROM content_strategies WHERE client_id = $1", [clientId]);
      await db.query("DELETE FROM platform_strategies WHERE client_id = $1", [clientId]);
      await db.query("DELETE FROM client_profile WHERE id = $1", [clientId]);
    }).catch(() => {});
  }
  if (clerkUserId) {
    await clerkFetch(`/users/${clerkUserId}`, { method: "DELETE" }).catch(() => {});
  }
});

test("content batch scheduling: plan three drafts over consecutive days, grouped by date in the calendar", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  // Create a single-use Backend sign-in token for the throwaway user. The
  // "ticket" strategy bypasses MFA / email verification that the Clerk instance
  // may enforce, which the client-side password flow cannot.
  const { token: ticket } = await clerkFetch("/sign_in_tokens", {
    method: "POST",
    body: JSON.stringify({ user_id: clerkUserId }),
  });
  expect(ticket, "sign-in token must be issued").toBeTruthy();

  // Load the app so Clerk initializes, then sign in with the ticket.
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded));
  const signIn = await page.evaluate(async (ticket: string) => {
    const Clerk = (window as any).Clerk;
    const res = await Clerk.client.signIn.create({ strategy: "ticket", ticket });
    if (res.status !== "complete") return { ok: false, status: res.status };
    await Clerk.setActive({ session: res.createdSessionId });
    return { ok: true, status: res.status };
  }, ticket);
  expect(signIn.ok, `sign-in status: ${signIn.status}`).toBe(true);

  // Read the signed-in Clerk user id and seed per-user data tied to it.
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).Clerk?.user?.id));
  const userId = await page.evaluate(() => (window as any).Clerk.user.id as string);
  expect(userId).toBe(clerkUserId);

  // Seed everything the Content page gates on: a fully-completed Blueprint
  // (all pillar core fields non-empty), a platform strategy, a content strategy
  // (jsonb columns use their defaults), and three draft posts. This unlocks the
  // Content Library directly without triggering any AI generation.
  clientId = await withDb(async (db) => {
    const client = await db.query(
      `INSERT INTO client_profile (
         user_id, full_name, onboarding_complete,
         "current_role", company, industry, headline, bio,
         early_life, professional_journey,
         signature_achievements, quantifiable_results, audience_impact,
         positioning, primary_audience, brand_values, personality_tone,
         thesis, core_beliefs, signature_frameworks,
         beliefs, frustrations, desired_change, passions
       ) VALUES (
         $1, $2, true,
         'Founder', 'ArcCo', 'Tech', 'Builder of things', 'A short bio.',
         'Grew up curious.', 'Built several startups.',
         'Shipped a product.', 'Grew revenue 3x.', 'Helped 100 founders.',
         'The go-to for X.', 'Early founders.', 'Clarity and candor.', 'Direct and warm.',
         'Clarity beats noise.', 'Specific beats clever.', 'The One Sentence method.',
         'Posting more is not the answer.', 'Generic templates.', 'Substance over hype.', 'Finding the clean sentence.'
       ) RETURNING id`,
      [userId, `E2E Content User ${token}`],
    );
    const id: number = client.rows[0].id;
    await db.query(
      "INSERT INTO platform_strategies (client_id, summary) VALUES ($1, $2)",
      [id, `Seeded platform strategy ${token}`],
    );
    await db.query(
      "INSERT INTO content_strategies (client_id, summary) VALUES ($1, $2)",
      [id, `Seeded content strategy ${token}`],
    );
    // Insert in the order they should be laid out (Alpha first => earliest day).
    await db.query(
      `INSERT INTO posts (client_id, title, content, platform, status) VALUES
         ($1, $2, 'Alpha post body', 'linkedin', 'draft'),
         ($1, $3, 'Bravo post body', 'twitter', 'draft'),
         ($1, $4, 'Charlie post body', 'blog', 'draft')`,
      [id, ALPHA, BRAVO, CHARLIE],
    );
    return id;
  });

  // The Content Library renders (gating passed) with the three draft posts.
  await page.goto("/content");
  await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible();
  await expect(page.getByText(ALPHA, { exact: true })).toBeVisible();
  await expect(page.getByText(BRAVO, { exact: true })).toBeVisible();
  await expect(page.getByText(CHARLIE, { exact: true })).toBeVisible();

  // Open the batch scheduling planner.
  await page.getByRole("button", { name: "Plan schedule" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Plan a schedule" })).toBeVisible();
  // All three drafts are pre-selected.
  await expect(dialog.getByText("3 selected")).toBeVisible();

  // Set the start date. fill() on a type="date" input dispatches the input event
  // React listens for, so the controlled state updates. This previously crashed
  // the page with "Invalid time value" on the per-post preview chip.
  const startDateInput = dialog.locator('input[type="date"]');
  await startDateInput.fill(START_DATE);
  await expect(startDateInput).toHaveValue(START_DATE);

  // The per-post preview chips reflect the chosen start date + 1-day cadence,
  // and the page did not crash (no Vite error overlay rendered).
  await expect(dialog.getByText("Mar 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Mar 2", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Mar 3", { exact: true })).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);

  // Schedule the batch (cadence left at the default "1 day").
  await dialog.getByRole("button", { name: /^Schedule/ }).click();

  // Success toast, and the view auto-switches to the Calendar.
  await expect(page.getByText("Schedule planned", { exact: true })).toBeVisible();

  // The three posts are grouped across three consecutive days in the calendar.
  // Day headers render like "Monday, Mar 1" with a "1 post" count each.
  await expect(page.getByText("Monday, Mar 1")).toBeVisible();
  await expect(page.getByText("Tuesday, Mar 2")).toBeVisible();
  await expect(page.getByText("Wednesday, Mar 3")).toBeVisible();
  await expect(page.getByText("1 post", { exact: true })).toHaveCount(3);
  await expect(page.getByText(ALPHA, { exact: true })).toBeVisible();
  await expect(page.getByText(BRAVO, { exact: true })).toBeVisible();
  await expect(page.getByText(CHARLIE, { exact: true })).toBeVisible();

  // And in the database the chosen start date was honored exactly: the three
  // posts are scheduled on 2027-03-01, -02, -03 (built from numeric date parts,
  // so no timezone drift), all with status "scheduled".
  const rows = await withDb(async (db) => {
    const res = await db.query(
      `SELECT title, status, to_char(scheduled_at, 'YYYY-MM-DD') AS day
         FROM posts WHERE client_id = $1 ORDER BY scheduled_at ASC`,
      [clientId],
    );
    return res.rows as { title: string; status: string; day: string }[];
  });
  expect(rows.map((r) => r.status)).toEqual(["scheduled", "scheduled", "scheduled"]);
  expect(rows.map((r) => r.day)).toEqual(["2027-03-01", "2027-03-02", "2027-03-03"]);
  expect(rows.map((r) => r.title)).toEqual([ALPHA, BRAVO, CHARLIE]);
});
