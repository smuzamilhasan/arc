import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";

// End-to-end coverage for the rest of the Narrative page inline editor
// (artifacts/personal-brand/src/pages/narrative.tsx) that the original
// narrative.spec.ts does not exercise: adding/removing content themes, and
// adding/removing recommended platforms plus changing a platform's priority
// via the High/Medium/Low dropdown. Each flow saves and reloads to confirm
// persistence.
//
// Setup mirrors narrative.spec.ts: create a throwaway Clerk user, sign in
// programmatically with a Backend sign-in token ("ticket" strategy, which
// bypasses MFA / verification the instance may enforce), read its id from
// window.Clerk, then seed a client profile + narrative directly in the DB tied
// to that user. Seeding keeps the test deterministic (no AI generation runs).
// A separate Clerk user (vs reusing narrative.spec.ts') keeps the app's
// single-client-per-user assumption intact.

const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const token = Math.random().toString(36).slice(2, 8);
const email = `narr.tp.e2e.${token}@example.com`;
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

test("narrative editing: add/remove themes and add/remove/reprioritize platforms persist after reload", async ({
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

  const themeOne = `Theme One ${token}`;
  const themeTwo = `Theme Two ${token}`;
  const themeThree = `Theme Three ${token}`;
  const linkedIn = `LinkedIn ${token}`;
  const twitter = `Twitter ${token}`;
  const substack = `Substack ${token}`;

  clientId = await withDb(async (db) => {
    const client = await db.query(
      "INSERT INTO client_profile (user_id, full_name, onboarding_complete) VALUES ($1, $2, true) RETURNING id",
      [userId, `E2E Themes/Platforms User ${token}`],
    );
    const id: number = client.rows[0].id;
    await db.query(
      `INSERT INTO narrative_profiles
        (client_id, core_narrative, point_of_view, themes, recommended_platforms, content_hooks)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        id,
        `Positioning ${token}`,
        `Point of view ${token}`,
        JSON.stringify([
          { title: themeOne, description: "Theme one description" },
          { title: themeTwo, description: "Theme two description" },
        ]),
        JSON.stringify([
          { platform: linkedIn, reason: "Pro audience", priority: "high" },
          { platform: twitter, reason: "Quick takes", priority: "low" },
        ]),
        [`Hook ${token}`],
      ],
    );
    return id;
  });

  // ---- Themes: add one, remove one, save, reload ----
  await page.goto("/narrative");
  await expect(page.getByRole("heading", { name: "Your Narrative Strategy" })).toBeVisible();
  await expect(page.getByText(themeOne)).toBeVisible();
  await expect(page.getByText(themeTwo)).toBeVisible();

  await page.getByRole("button", { name: "Edit narrative" }).click();

  // Remove the first theme (Theme One).
  await expect(page.getByRole("button", { name: "Remove theme" })).toHaveCount(2);
  await page.getByRole("button", { name: "Remove theme" }).first().click();
  await expect(page.getByRole("button", { name: "Remove theme" })).toHaveCount(1);

  // Add a new theme and fill it in (the newest inputs are last).
  await page.getByRole("button", { name: "Add theme" }).click();
  await expect(page.getByRole("button", { name: "Remove theme" })).toHaveCount(2);
  await page.getByPlaceholder("Theme title").last().fill(themeThree);
  await page.getByPlaceholder("Theme description").last().fill("Theme three description");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Narrative updated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit narrative" })).toBeVisible();

  // Reload and confirm theme changes persisted.
  await page.goto("/narrative");
  await expect(page.getByText(themeTwo)).toBeVisible();
  await expect(page.getByText(themeThree)).toBeVisible();
  await expect(page.getByText(themeOne)).toHaveCount(0);

  // ---- Platforms: remove one, reprioritize one, add one, save, reload ----
  await expect(page.getByText(linkedIn)).toBeVisible();
  await expect(page.getByText(twitter)).toBeVisible();
  await expect(page.getByText("high Priority")).toBeVisible();

  await page.getByRole("button", { name: "Edit narrative" }).click();

  // Remove the second platform (Twitter), leaving LinkedIn.
  await expect(page.getByRole("button", { name: "Remove platform" })).toHaveCount(2);
  await page.getByRole("button", { name: "Remove platform" }).nth(1).click();
  await expect(page.getByRole("button", { name: "Remove platform" })).toHaveCount(1);

  // Change LinkedIn's priority from High to Medium via the dropdown.
  // Only one platform remains, so there is a single priority combobox.
  await expect(page.getByRole("combobox")).toHaveCount(1);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Medium" }).click();

  // Add a new platform and fill it in (default priority is Medium).
  await page.getByRole("button", { name: "Add platform" }).click();
  await expect(page.getByRole("button", { name: "Remove platform" })).toHaveCount(2);
  await page.getByPlaceholder("Platform").last().fill(substack);
  await page.getByPlaceholder("Why this platform").last().fill("Long-form essays");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Narrative updated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit narrative" })).toBeVisible();

  // Reload and confirm platform changes persisted.
  await page.goto("/narrative");
  await expect(page.getByText(linkedIn)).toBeVisible();
  await expect(page.getByText(substack)).toBeVisible();
  await expect(page.getByText(twitter)).toHaveCount(0);
  // LinkedIn was the only High platform; it is now Medium, so none remain High.
  await expect(page.getByText("high Priority")).toHaveCount(0);
  await expect(page.getByText("medium Priority").first()).toBeVisible();
});
