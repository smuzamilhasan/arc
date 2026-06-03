import { test, expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";

// End-to-end coverage for the Narrative page's unsaved-changes guards
// (artifacts/personal-brand/src/pages/narrative.tsx): once the user enters edit
// mode and makes a change, leaving the page must prompt before discarding. This
// exercises the two interactive guards a user can hit in-app:
//   - in-app navigation via a sidebar link (the document click-capture handler)
//   - the browser Back button (the popstate + sentinel-history-entry handler)
// In both cases cancelling the confirm keeps the user on the page with edits
// intact, and accepting discards the edits and navigates away. The beforeunload
// (tab close/refresh) guard is not browser-automatable here and is left out.
//
// Setup mirrors narrative.spec.ts: create a throwaway Clerk user, sign in with a
// Backend sign-in token ("ticket" strategy, which bypasses MFA / verification
// the instance may enforce), read its id from window.Clerk, then seed a client
// profile + narrative directly in the DB tied to that user. Seeding keeps the
// test deterministic (no AI generation runs). A separate Clerk user keeps the
// app's single-client-per-user assumption intact.

const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const DISCARD_CONFIRM_MESSAGE =
  "You have unsaved changes to your narrative. Discard them?";

const token = Math.random().toString(36).slice(2, 8);
const email = `narr.guard.e2e.${token}@example.com`;
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

// Register a one-time confirm() handler that records the dialog's message and
// either accepts or dismisses it. Playwright freezes the page if a dialog
// listener exists but never resolves the dialog, so the listener itself must
// resolve it (we cannot await the triggering action first).
function handleOnceDialog(page: Page, action: "accept" | "dismiss") {
  const state = { count: 0, message: null as string | null };
  page.once("dialog", async (dialog) => {
    state.count += 1;
    state.message = dialog.message();
    if (action === "accept") {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });
  return state;
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

test("narrative unsaved-changes guard: in-app nav and browser Back prompt before discarding", async ({
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

  clientId = await withDb(async (db) => {
    const client = await db.query(
      "INSERT INTO client_profile (user_id, full_name, onboarding_complete) VALUES ($1, $2, true) RETURNING id",
      [userId, `E2E Guard User ${token}`],
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
        JSON.stringify([{ title: "Theme One", description: "Desc one" }]),
        JSON.stringify([{ platform: "LinkedIn", reason: "Pro audience", priority: "high" }]),
        [`Hook Alpha ${token}`],
      ],
    );
    return id;
  });

  const editedText = `Edited positioning ${token}`;
  const coreNarrative = () => page.locator("textarea").first();
  // Scope nav-link lookups to the desktop sidebar (the mobile Sheet duplicates
  // the same links but is closed at the desktop viewport).
  const overviewLink = page.locator("aside").getByRole("link", { name: "Overview" });

  // Enter edit mode and make an unsaved change.
  const enterEditWithChange = async () => {
    await page.getByRole("button", { name: "Edit narrative" }).click();
    await expect(coreNarrative()).toHaveValue(`Original positioning ${token}`);
    await coreNarrative().fill(editedText);
    await expect(coreNarrative()).toHaveValue(editedText);
    // Let the guard effects (click-capture listener + popstate sentinel) attach.
    await page.waitForTimeout(300);
  };

  // ---- In-app navigation (sidebar link): cancel keeps edits ----
  await page.goto("/narrative");
  await expect(page.getByRole("heading", { name: "Your Narrative Strategy" })).toBeVisible();
  await enterEditWithChange();

  const cancelNav = handleOnceDialog(page, "dismiss");
  await overviewLink.click();
  expect(cancelNav.count, "in-app nav should prompt to confirm discard").toBe(1);
  expect(cancelNav.message).toBe(DISCARD_CONFIRM_MESSAGE);
  // Cancelling stays on the page with the edit intact.
  await expect(page).toHaveURL(/\/narrative$/);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(coreNarrative()).toHaveValue(editedText);

  // ---- In-app navigation (sidebar link): accept discards and navigates ----
  const acceptNav = handleOnceDialog(page, "accept");
  await overviewLink.click();
  expect(acceptNav.count).toBe(1);
  expect(acceptNav.message).toBe(DISCARD_CONFIRM_MESSAGE);
  // Accepting navigates away to the linked page and drops the draft.
  await page.waitForURL(/\/dashboard$/);

  // ---- Browser Back: cancel keeps edits ----
  await page.goto("/narrative");
  await expect(page.getByRole("heading", { name: "Your Narrative Strategy" })).toBeVisible();
  await enterEditWithChange();

  const cancelBack = handleOnceDialog(page, "dismiss");
  await page.evaluate(() => window.history.back());
  await expect.poll(() => cancelBack.count, {
    message: "browser Back should prompt to confirm discard",
  }).toBe(1);
  expect(cancelBack.message).toBe(DISCARD_CONFIRM_MESSAGE);
  // Cancelling stays on the page with the edit intact.
  await expect(page).toHaveURL(/\/narrative$/);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(coreNarrative()).toHaveValue(editedText);

  // ---- Browser Back: accept discards and navigates ----
  const acceptBack = handleOnceDialog(page, "accept");
  await page.evaluate(() => window.history.back());
  await expect.poll(() => acceptBack.count).toBe(1);
  expect(acceptBack.message).toBe(DISCARD_CONFIRM_MESSAGE);
  // Accepting steps back off the narrative page and drops the draft.
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/\/narrative$/);
});
