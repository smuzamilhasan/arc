import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk Testing Token (using CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY)
// so the e2e suite can sign in programmatically without solving bot protection.
export default async function globalSetup() {
  await clerkSetup();
}
