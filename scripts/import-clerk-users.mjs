// Import users (exported from the old Replit-managed Clerk instance) into the
// NEW Clerk app, preserving the old Clerk user id as `external_id` so the
// Postgres rows (keyed by the old id) can be remapped later.
//
// Reads CLERK_SECRET_KEY (the NEW app's secret) from the environment — never
// printed. Reads the exported users from the file named by CLERK_EXPORT_FILE
// (default: clerk-users-prod-export.json). Writes an old->new id map to
// clerk-id-map.json.
//
// Usage (secret injected by Railway, no exposure):
//   CLERK_EXPORT_FILE=clerk-users-prod-export.json \
//     railway run --service practical-purpose node scripts/import-clerk-users.mjs
//
// Notes:
//   - Your users are Google OAuth; Clerk never exports password hashes, so we
//     create users by VERIFIED email. When they next sign in with Google,
//     Clerk links by that verified email. No passwords are lost (there were
//     none to migrate).
//   - Re-running is safe-ish: users whose email already exists are skipped.

import fs from "node:fs";

const key = process.env.CLERK_SECRET_KEY;
if (!key) { console.error("CLERK_SECRET_KEY not set"); process.exit(1); }
console.log("Target Clerk instance:", key.slice(0, 8) + "…");

const file = process.env.CLERK_EXPORT_FILE || "clerk-users-prod-export.json";
if (!fs.existsSync(file)) {
  console.error(`Export file not found: ${file}`);
  process.exit(1);
}
const exported = JSON.parse(fs.readFileSync(file, "utf8"));
const users = Array.isArray(exported) ? exported : exported.data || [];
console.log(`Loaded ${users.length} users from ${file}`);

const API = "https://api.clerk.com/v1";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function primaryEmail(u) {
  const id = u.primary_email_address_id;
  const list = u.email_addresses || [];
  const primary = list.find((e) => e.id === id) || list[0];
  return primary?.email_address;
}

const idMap = {};
let created = 0, skipped = 0, failed = 0;

for (const [i, u] of users.entries()) {
  const email = primaryEmail(u);
  if (!email) { console.warn(`[${i}] no email, skipping (old id ${u.id})`); skipped++; continue; }

  const body = {
    external_id: u.id,                 // preserve old Clerk id for DB remap
    email_address: [email],
    first_name: u.first_name || undefined,
    last_name: u.last_name || undefined,
    skip_password_requirement: true,
    skip_password_checks: true,
  };

  let res = await fetch(`${API}/users`, { method: "POST", headers, body: JSON.stringify(body) });

  // Basic rate-limit backoff.
  if (res.status === 429) {
    await sleep(2000);
    res = await fetch(`${API}/users`, { method: "POST", headers, body: JSON.stringify(body) });
  }

  if (res.ok) {
    const newUser = await res.json();
    idMap[u.id] = newUser.id;
    created++;
    if (created % 10 === 0) console.log(`  …${created} created`);
  } else {
    const text = await res.text();
    if (res.status === 422 && /already exists|duplicate|taken/i.test(text)) {
      skipped++;
    } else {
      failed++;
      console.warn(`[${i}] failed for ${email}: ${res.status} ${text.slice(0, 200)}`);
    }
  }
  await sleep(120); // stay under Clerk's rate limit
}

fs.writeFileSync("clerk-id-map.json", JSON.stringify(idMap, null, 2));
console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
console.log(`old->new id map written to clerk-id-map.json (${Object.keys(idMap).length} entries)`);
