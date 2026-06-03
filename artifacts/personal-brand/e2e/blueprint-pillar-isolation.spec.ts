import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";

// End-to-end coverage for the Brand Blueprint pillar editor
// (artifacts/personal-brand/src/pages/pillar.tsx): saving one pillar must never
// wipe fields that belong to other pillars. PUT /client is a full-row overwrite,
// so the editor merges a single pillar's edits onto the full profile via
// clientToInput (artifacts/personal-brand/src/lib/blueprint.ts). This test would
// catch a regression where a pillar editor submits a partial payload and clears
// other pillars' fields.
//
// Setup mirrors narrative.spec.ts: create a throwaway Clerk user, sign in with a
// Backend sign-in token ("ticket" strategy, which bypasses MFA / verification
// the instance may enforce), read its id from window.Clerk, then seed a client
// profile directly in the DB tied to that user. Seeding keeps the test
// deterministic (no AI generation runs).

const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const token = Math.random().toString(36).slice(2, 8);
const email = `blueprint.e2e.${token}@example.com`;
const password = `Arc-e2e-${token}-Xyz!92`;

// Fields owned by other pillars that must survive an Identity-pillar save.
const EARLY_LIFE = `Grew up in Seedville ${token}`;
const PRO_JOURNEY = `Built and sold a startup ${token}`;
const SIG_ACHIEVEMENTS = `Scaled a team to 200 ${token}`;
// The Identity-pillar field we will actually edit.
const POSITIONING = `the go-to person for X ${token}`;

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
      await db.query("DELETE FROM client_profile WHERE id = $1", [clientId]);
    }).catch(() => {});
  }
  if (clerkUserId) {
    await clerkFetch(`/users/${clerkUserId}`, { method: "DELETE" }).catch(() => {});
  }
});

test("blueprint pillar save: editing Identity leaves Story and Credibility fields intact", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  // Create a single-use Backend sign-in token for the throwaway user.
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

  // Seed a profile with fields owned by the Story and Credibility pillars, plus
  // an empty Identity field we will fill in via the editor.
  clientId = await withDb(async (db) => {
    const client = await db.query(
      `INSERT INTO client_profile
        (user_id, full_name, onboarding_complete, early_life, professional_journey, signature_achievements)
       VALUES ($1, $2, true, $3, $4, $5) RETURNING id`,
      [userId, `E2E Blueprint User ${token}`, EARLY_LIFE, PRO_JOURNEY, SIG_ACHIEVEMENTS],
    );
    return client.rows[0].id as number;
  });

  // Open the Identity & Positioning pillar editor and fill the positioning field.
  await page.goto("/blueprint/identity");
  await expect(
    page.getByRole("heading", { name: "Identity & Positioning" }),
  ).toBeVisible();

  const positioning = page.locator("#positioning");
  await expect(positioning).toHaveValue("");
  await positioning.fill(POSITIONING);

  // Save the pillar.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The edited Identity field persists after a reload.
  await page.goto("/blueprint/identity");
  await expect(page.locator("#positioning")).toHaveValue(POSITIONING);

  // Fields owned by other pillars are untouched in the UI.
  await page.goto("/blueprint/story");
  await expect(page.getByRole("heading", { name: "Story", exact: true })).toBeVisible();
  await expect(page.locator("#earlyLife")).toHaveValue(EARLY_LIFE);
  await expect(page.locator("#professionalJourney")).toHaveValue(PRO_JOURNEY);

  await page.goto("/blueprint/credibility");
  await expect(
    page.getByRole("heading", { name: "Credibility & Proof" }),
  ).toBeVisible();
  await expect(page.locator("#signatureAchievements")).toHaveValue(SIG_ACHIEVEMENTS);

  // And in the database the other pillars' fields are exactly as seeded.
  const row = await withDb(async (db) => {
    const res = await db.query(
      `SELECT positioning, early_life, professional_journey, signature_achievements
         FROM client_profile WHERE id = $1`,
      [clientId],
    );
    return res.rows[0] as {
      positioning: string;
      early_life: string;
      professional_journey: string;
      signature_achievements: string;
    };
  });
  expect(row.positioning).toBe(POSITIONING);
  expect(row.early_life).toBe(EARLY_LIFE);
  expect(row.professional_journey).toBe(PRO_JOURNEY);
  expect(row.signature_achievements).toBe(SIG_ACHIEVEMENTS);
});
