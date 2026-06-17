// Export all Clerk users from whatever instance CLERK_SECRET_KEY belongs to.
//
// Read-only. Reads the secret from the environment (never prints it), pages
// through Clerk's Backend API, and writes the full user list to
// clerk-users-export.json next to wherever you run it.
//
// Run on Railway (diagnostic — dev instance):
//   railway run --service practical-purpose node scripts/export-clerk-users.mjs
// Run on Replit (the real production users — do this before closing Replit):
//   node scripts/export-clerk-users.mjs
//
// No npm dependencies — uses Node's global fetch (Node 18+).

import fs from "node:fs";

const key = process.env.CLERK_SECRET_KEY;
if (!key) {
  console.error("CLERK_SECRET_KEY is not set in this environment.");
  process.exit(1);
}

// Safe to print: the prefix tells us dev (sk_test_) vs production (sk_live_).
console.log("Clerk instance type:", key.slice(0, 8) + "…");

const API = "https://api.clerk.com/v1";
const headers = { Authorization: `Bearer ${key}` };
const limit = 100;
let offset = 0;
const users = [];

while (true) {
  const res = await fetch(
    `${API}/users?limit=${limit}&offset=${offset}&order_by=-created_at`,
    { headers },
  );
  if (!res.ok) {
    console.error(`Clerk API error ${res.status}:`, await res.text());
    process.exit(1);
  }
  const batch = await res.json();
  if (!Array.isArray(batch) || batch.length === 0) break;
  users.push(...batch);
  offset += batch.length;
  if (batch.length < limit) break;
}

const out = "clerk-users-export.json";
fs.writeFileSync(out, JSON.stringify(users, null, 2));

// Summary only — no PII printed.
const withEmail = users.filter((u) => (u.email_addresses || []).length).length;
const providers = new Set();
for (const u of users) {
  for (const a of u.external_accounts || []) providers.add(a.provider);
  for (const e of u.email_addresses || []) {
    for (const v of e.verification ? [e.verification] : []) {
      if (v?.strategy) providers.add(v.strategy);
    }
  }
}
console.log(`Exported ${users.length} users -> ${out}`);
console.log(`  with email address: ${withEmail}`);
console.log(`  auth strategies/providers seen: ${[...providers].join(", ") || "(none)"}`);
