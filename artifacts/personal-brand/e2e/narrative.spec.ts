import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";

// End-to-end coverage for the Narrative page inline editing UI
// (artifacts/personal-brand/src/pages/narrative.tsx): enter edit mode, change a
// field, remove a content hook, save, and verify persistence after reload; then
// verify Cancel discards unsaved edits.
//
// The app is Clerk-gated and single-client-per-user. We create a throwaway Clerk
// user, sign in programmatically via a Backend sign-in token (the "ticket"
// strategy, which bypasses MFA / verification that the instance may enforce),
// read its id from window.Clerk, then seed a client profile + narrative directly
// in the DB tied to that user. Seeding the narrative keeps the test deterministic
// (no AI narrative generation runs).

const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const token = Math.random().toString(36).slice(2, 8);
const email = `narr.e2e.${token}@example.com`;
const password = `Arc-e2e-${token}-Xyz!92`;

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
      await db.query("DELETE FROM narrative_profiles WHERE client_id = $1", [clientId]);
      await db.query("DELETE FROM client_profile WHERE id = $1", [clientId]);
    }).catch(() => {});
  }
  if (clerkUserId) {
    await clerkFetch(`/users/${clerkUserId}`, { method: "DELETE" }).catch(() => {});
  }
});

test("narrative editing: edit a field, remove a hook, save persists after reload; cancel restores", async ({
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

  clientId = await withDb(async (db) => {
    const client = await db.query(
      "INSERT INTO client_profile (user_id, full_name, onboarding_complete) VALUES ($1, $2, true) RETURNING id",
      [userId, `E2E Narrative User ${token}`],
    );
    const id: number = client.rows[0].id;
    await db.query(
      `INSERT INTO narrative_profiles
        (client_id, core_narrative, point_of_view, themes, recommended_platforms, content_hooks)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        id,
        `Original positioning ${token}`,
        `A clear point of view ${token}`,
        JSON.stringify([
          { title: "Theme One", description: "Desc one" },
          { title: "Theme Two", description: "Desc two" },
        ]),
        JSON.stringify([{ platform: "LinkedIn", reason: "Pro audience", priority: "high" }]),
        [`Hook Alpha ${token}`, `Hook Bravo ${token}`, `Hook Charlie ${token}`],
      ],
    );
    return id;
  });

  // Read-only results view shows the seeded narrative.
  await page.goto("/narrative");
  await expect(page.getByRole("heading", { name: "Your Narrative Strategy" })).toBeVisible();
  await expect(page.getByText(`Original positioning ${token}`)).toBeVisible();
  await expect(page.getByText(`Hook Alpha ${token}`)).toBeVisible();
  await expect(page.getByText(`Hook Bravo ${token}`)).toBeVisible();
  await expect(page.getByText(`Hook Charlie ${token}`)).toBeVisible();

  // Enter edit mode.
  await page.getByRole("button", { name: "Edit narrative" }).click();

  // The first textarea is the core narrative field.
  const coreNarrative = page.locator("textarea").first();
  await expect(coreNarrative).toHaveValue(`Original positioning ${token}`);
  await coreNarrative.fill(`Edited positioning ${token}`);

  // Remove the second content hook ("Hook Bravo").
  await expect(page.getByRole("button", { name: "Remove hook" })).toHaveCount(3);
  await page.getByRole("button", { name: "Remove hook" }).nth(1).click();
  await expect(page.getByRole("button", { name: "Remove hook" })).toHaveCount(2);

  // Save.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Narrative updated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit narrative" })).toBeVisible();

  // Reload and confirm the change persisted.
  await page.goto("/narrative");
  await expect(page.getByText(`Edited positioning ${token}`)).toBeVisible();
  await expect(page.getByText(`Original positioning ${token}`)).toHaveCount(0);
  await expect(page.getByText(`Hook Alpha ${token}`)).toBeVisible();
  await expect(page.getByText(`Hook Charlie ${token}`)).toBeVisible();
  await expect(page.getByText(`Hook Bravo ${token}`)).toHaveCount(0);

  // Cancel discards unsaved edits and restores the saved values.
  await page.getByRole("button", { name: "Edit narrative" }).click();
  await page.locator("textarea").first().fill(`Discarded text ${token}`);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit narrative" })).toBeVisible();
  await expect(page.getByText(`Edited positioning ${token}`)).toBeVisible();
  await expect(page.getByText(`Discarded text ${token}`)).toHaveCount(0);
});
