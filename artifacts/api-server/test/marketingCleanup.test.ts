import { describe, it, expect, afterAll } from "vitest";
import {
  db,
  pool,
  marketingLeadsTable,
  marketingActionsTable,
  marketingConnectionsTable,
  marketingActivityTable,
  marketingFormSourcesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { deleteTenantMarketingData } from "../src/services/marketingData";

// Marketing OS data is tenant-keyed (not clientId-keyed), so it is deliberately
// excluded from per-user deleteClientData. deleteTenantMarketingData is the
// authoritative cleanup path, wired into the admin-only POST /marketing/reset
// route. These tests prove it purges every marketing table for its tenant while
// leaving other tenants untouched. We use unique throwaway tenants so the real
// 'arc' tenant data is never touched.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const TENANT = `test-cleanup-${suffix}`;
const OTHER_TENANT = `test-keep-${suffix}`;

async function seedTenant(tenant: string) {
  const [lead] = await db
    .insert(marketingLeadsTable)
    .values({ tenant, email: `${tenant}@example.com`, name: "Seed Lead" })
    .returning();
  await db.insert(marketingActionsTable).values({
    tenant,
    leadId: lead.id,
    kind: "outreach_email",
    status: "pending",
  });
  await db.insert(marketingConnectionsTable).values({
    tenant,
    provider: "resend",
    apiKeyEncrypted: "enc",
  });
  await db.insert(marketingActivityTable).values({
    tenant,
    leadId: lead.id,
    kind: "lead_captured",
    summary: "Seed activity",
  });
  await db.insert(marketingFormSourcesTable).values({
    tenant,
    provider: "typeform",
    formId: `form-${tenant}`,
    formTitle: "Seed Form",
  });
}

async function countTenant(tenant: string) {
  const [leads, actions, connections, activity, formSources] = await Promise.all([
    db.select().from(marketingLeadsTable).where(eq(marketingLeadsTable.tenant, tenant)),
    db.select().from(marketingActionsTable).where(eq(marketingActionsTable.tenant, tenant)),
    db
      .select()
      .from(marketingConnectionsTable)
      .where(eq(marketingConnectionsTable.tenant, tenant)),
    db
      .select()
      .from(marketingActivityTable)
      .where(eq(marketingActivityTable.tenant, tenant)),
    db
      .select()
      .from(marketingFormSourcesTable)
      .where(eq(marketingFormSourcesTable.tenant, tenant)),
  ]);
  return {
    leads: leads.length,
    actions: actions.length,
    connections: connections.length,
    activity: activity.length,
    formSources: formSources.length,
  };
}

async function purge(tenant: string) {
  await deleteTenantMarketingData(tenant);
}

afterAll(async () => {
  await purge(TENANT);
  await purge(OTHER_TENANT);
  await pool.end();
});

describe("deleteTenantMarketingData", () => {
  it("removes every marketing table row for the tenant", async () => {
    await seedTenant(TENANT);
    const before = await countTenant(TENANT);
    expect(before).toEqual({ leads: 1, actions: 1, connections: 1, activity: 1, formSources: 1 });

    await deleteTenantMarketingData(TENANT);

    const after = await countTenant(TENANT);
    expect(after).toEqual({ leads: 0, actions: 0, connections: 0, activity: 0, formSources: 0 });
  });

  it("does not touch other tenants' data", async () => {
    await seedTenant(TENANT);
    await seedTenant(OTHER_TENANT);

    await deleteTenantMarketingData(TENANT);

    const purged = await countTenant(TENANT);
    expect(purged).toEqual({ leads: 0, actions: 0, connections: 0, activity: 0, formSources: 0 });

    const kept = await countTenant(OTHER_TENANT);
    expect(kept).toEqual({ leads: 1, actions: 1, connections: 1, activity: 1, formSources: 1 });
  });
});
