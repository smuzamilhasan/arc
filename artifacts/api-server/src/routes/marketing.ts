import { Router } from "express";
import {
  db,
  marketingLeadsTable,
  marketingActionsTable,
  marketingConnectionsTable,
  marketingActivityTable,
} from "@workspace/db";
import {
  ListMarketingLeadsQueryParams,
  CreateMarketingLeadBody,
  GetMarketingLeadParams,
  QualifyMarketingLeadParams,
  ListMarketingActionsQueryParams,
  UpdateMarketingActionParams,
  UpdateMarketingActionBody,
  ApproveMarketingActionParams,
  RejectMarketingActionParams,
  SaveMarketingConnectionBody,
  DeleteMarketingConnectionParams,
} from "@workspace/api-zod";
import { and, desc, eq } from "drizzle-orm";
import { isAdmin, requireAdmin } from "../middlewares/requireAdmin";
import { aiGenerationRateLimit, externalApiRateLimit } from "../middlewares/aiRateLimit";
import { encryptSecret, isEncryptionConfigured } from "../lib/crypto";
import { sendEmail } from "../services/email";
import { MARKETING_TENANT } from "../services/marketing";
import {
  captureLead,
  runQualification,
  getBookingUrl,
  logMarketingActivity,
} from "../services/marketingData";

const router = Router();

type LeadRow = typeof marketingLeadsTable.$inferSelect;
type ActionRow = typeof marketingActionsTable.$inferSelect;
type ConnectionRow = typeof marketingConnectionsTable.$inferSelect;
type ActivityRow = typeof marketingActivityTable.$inferSelect;

function serializeLead(l: LeadRow) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    company: l.company,
    message: l.message,
    source: l.source,
    fitScore: l.fitScore,
    fitTier: l.fitTier,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    leadId: a.leadId,
    kind: a.kind,
    fitScore: a.fitScore,
    fitTier: a.fitTier,
    rationale: a.rationale,
    route: a.route,
    emailSubject: a.emailSubject,
    emailBody: a.emailBody,
    bookingUrl: a.bookingUrl,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function serializeActivity(a: ActivityRow) {
  return {
    id: a.id,
    leadId: a.leadId,
    kind: a.kind,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeConnection(c: ConnectionRow) {
  return {
    provider: c.provider,
    connected: c.provider === "resend" ? Boolean(c.apiKeyEncrypted) : Boolean(c.bookingUrl),
    accountRef: c.accountRef,
    bookingUrl: c.bookingUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// Render a plain-text email body as simple HTML, preserving line breaks.
function bodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>");
}

// Auth-only (NOT admin-gated): lets the web app decide whether to render the
// Marketing OS at all. Mirrors /admin/access.
router.get("/marketing/access", async (req, res) => {
  const admin = await isAdmin(req.userId!).catch(() => false);
  res.json({ isAdmin: admin });
});

// Everything below requires admin.
router.get("/marketing/dashboard", requireAdmin, async (_req, res) => {
  const leads = await db
    .select()
    .from(marketingLeadsTable)
    .where(eq(marketingLeadsTable.tenant, MARKETING_TENANT));
  const pendingActions = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
        eq(marketingActionsTable.status, "pending"),
      ),
    );
  const sentActions = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
        eq(marketingActionsTable.status, "approved"),
      ),
    );

  const highFit = leads.filter((l) => l.fitTier === "high").length;
  const mediumFit = leads.filter((l) => l.fitTier === "medium").length;
  const lowFit = leads.filter((l) => l.fitTier === "low").length;

  const recentLeads = [...leads]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map(serializeLead);

  const recentActivityRows = await db
    .select()
    .from(marketingActivityTable)
    .where(eq(marketingActivityTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingActivityTable.createdAt))
    .limit(8);

  res.json({
    totalLeads: leads.length,
    newLeads: leads.filter((l) => l.status === "new").length,
    highFit,
    mediumFit,
    lowFit,
    pendingActions: pendingActions.length,
    emailsSent: sentActions.length,
    bookingUrl: await getBookingUrl(),
    leadsByTier: [
      { tier: "high", count: highFit },
      { tier: "medium", count: mediumFit },
      { tier: "low", count: lowFit },
    ],
    recentLeads,
    recentActivity: recentActivityRows.map(serializeActivity),
  });
});

router.get("/marketing/leads", requireAdmin, async (req, res) => {
  const parsed = ListMarketingLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const filters = [eq(marketingLeadsTable.tenant, MARKETING_TENANT)];
  if (parsed.data.tier) filters.push(eq(marketingLeadsTable.fitTier, parsed.data.tier));
  if (parsed.data.status) filters.push(eq(marketingLeadsTable.status, parsed.data.status));

  const rows = await db
    .select()
    .from(marketingLeadsTable)
    .where(and(...filters))
    .orderBy(desc(marketingLeadsTable.createdAt));
  res.json(rows.map(serializeLead));
});

router.post("/marketing/leads", requireAdmin, async (req, res) => {
  const parsed = CreateMarketingLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const lead = await captureLead({
    name: parsed.data.name ?? null,
    email: parsed.data.email,
    company: parsed.data.company ?? null,
    message: parsed.data.message ?? null,
    source: parsed.data.source ?? "manual",
  });
  res.status(201).json(serializeLead(lead));
});

router.get("/marketing/leads/:id", requireAdmin, async (req, res) => {
  const parsed = GetMarketingLeadParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [lead] = await db
    .select()
    .from(marketingLeadsTable)
    .where(
      and(
        eq(marketingLeadsTable.id, parsed.data.id),
        eq(marketingLeadsTable.tenant, MARKETING_TENANT),
      ),
    );
  if (!lead) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [action] = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
        eq(marketingActionsTable.leadId, lead.id),
      ),
    )
    .orderBy(desc(marketingActionsTable.createdAt))
    .limit(1);
  const activity = await db
    .select()
    .from(marketingActivityTable)
    .where(
      and(
        eq(marketingActivityTable.tenant, MARKETING_TENANT),
        eq(marketingActivityTable.leadId, lead.id),
      ),
    )
    .orderBy(desc(marketingActivityTable.createdAt));

  res.json({
    lead: serializeLead(lead),
    action: action ? serializeAction(action) : null,
    activity: activity.map(serializeActivity),
  });
});

router.post(
  "/marketing/leads/:id/qualify",
  requireAdmin,
  aiGenerationRateLimit,
  async (req, res) => {
    const parsed = QualifyMarketingLeadParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const action = await runQualification(parsed.data.id);
    if (!action) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Re-read the lead + full activity so the client gets the fresh detail.
    const [lead] = await db
      .select()
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.id, parsed.data.id),
          eq(marketingLeadsTable.tenant, MARKETING_TENANT),
        ),
      );
    const activity = await db
      .select()
      .from(marketingActivityTable)
      .where(
        and(
          eq(marketingActivityTable.tenant, MARKETING_TENANT),
          eq(marketingActivityTable.leadId, parsed.data.id),
        ),
      )
      .orderBy(desc(marketingActivityTable.createdAt));
    res.json({
      lead: serializeLead(lead),
      action: serializeAction(action),
      activity: activity.map(serializeActivity),
    });
  },
);

router.get("/marketing/actions", requireAdmin, async (req, res) => {
  const parsed = ListMarketingActionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const filters = [eq(marketingActionsTable.tenant, MARKETING_TENANT)];
  if (parsed.data.status) filters.push(eq(marketingActionsTable.status, parsed.data.status));
  const rows = await db
    .select()
    .from(marketingActionsTable)
    .where(and(...filters))
    .orderBy(desc(marketingActionsTable.createdAt));
  res.json(rows.map(serializeAction));
});

router.patch("/marketing/actions/:id", requireAdmin, async (req, res) => {
  const params = UpdateMarketingActionParams.safeParse({ id: req.params.id });
  const body = UpdateMarketingActionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [existing] = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.id, params.data.id),
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "Action is not pending" });
    return;
  }
  const updates: Partial<ActionRow> = { updatedAt: new Date() };
  if (body.data.emailSubject !== undefined) updates.emailSubject = body.data.emailSubject;
  if (body.data.emailBody !== undefined) updates.emailBody = body.data.emailBody;
  const [updated] = await db
    .update(marketingActionsTable)
    .set(updates)
    .where(
      and(
        eq(marketingActionsTable.id, params.data.id),
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
      ),
    )
    .returning();
  res.json(serializeAction(updated));
});

router.post(
  "/marketing/actions/:id/approve",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    const parsed = ApproveMarketingActionParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [action] = await db
      .select()
      .from(marketingActionsTable)
      .where(
        and(
          eq(marketingActionsTable.id, parsed.data.id),
          eq(marketingActionsTable.tenant, MARKETING_TENANT),
        ),
      );
    if (!action) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (action.status !== "pending") {
      res.status(409).json({ error: "Action is not pending" });
      return;
    }
    const [lead] = await db
      .select()
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.id, action.leadId),
          eq(marketingLeadsTable.tenant, MARKETING_TENANT),
        ),
      );
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const sent = await sendEmail({
      to: lead.email,
      subject: action.emailSubject ?? "A note from the arc team",
      html: bodyToHtml(action.emailBody ?? ""),
      text: action.emailBody ?? undefined,
    });
    if (!sent) {
      res.status(502).json({ error: "Email delivery failed" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(marketingActionsTable)
      .set({ status: "approved", updatedAt: now })
      .where(
        and(
          eq(marketingActionsTable.id, action.id),
          eq(marketingActionsTable.tenant, MARKETING_TENANT),
        ),
      )
      .returning();
    await db
      .update(marketingLeadsTable)
      .set({ status: "contacted", updatedAt: now })
      .where(
        and(
          eq(marketingLeadsTable.id, lead.id),
          eq(marketingLeadsTable.tenant, MARKETING_TENANT),
        ),
      );
    await logMarketingActivity(
      "email_sent",
      `Outreach email approved and sent to ${lead.name ?? lead.email}`,
      lead.id,
    );
    res.json(serializeAction(updated));
  },
);

router.post("/marketing/actions/:id/reject", requireAdmin, async (req, res) => {
  const parsed = RejectMarketingActionParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [action] = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.id, parsed.data.id),
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
      ),
    );
  if (!action) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (action.status !== "pending") {
    res.status(409).json({ error: "Action is not pending" });
    return;
  }
  const [updated] = await db
    .update(marketingActionsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(marketingActionsTable.id, action.id),
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
      ),
    )
    .returning();
  await logMarketingActivity(
    "action_rejected",
    `Proposed outreach rejected for lead #${action.leadId}`,
    action.leadId,
  );
  res.json(serializeAction(updated));
});

router.get("/marketing/connections", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingConnectionsTable)
    .where(eq(marketingConnectionsTable.tenant, MARKETING_TENANT));
  res.json(rows.map(serializeConnection));
});

router.post("/marketing/connections", requireAdmin, async (req, res) => {
  const parsed = SaveMarketingConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { provider, apiKey, bookingUrl, accountRef } = parsed.data;

  if (provider === "resend") {
    if (!apiKey) {
      res.status(400).json({ error: "An API key is required for Resend." });
      return;
    }
    if (!isEncryptionConfigured()) {
      req.log.error("APP_ENCRYPTION_KEY missing; cannot store marketing key");
      res.status(500).json({ error: "Server is not configured to store API keys." });
      return;
    }
  }
  if (provider === "calendly" && !bookingUrl) {
    res.status(400).json({ error: "A booking URL is required for Calendly." });
    return;
  }

  const now = new Date();
  const encrypted = provider === "resend" && apiKey ? encryptSecret(apiKey) : null;
  const [saved] = await db
    .insert(marketingConnectionsTable)
    .values({
      tenant: MARKETING_TENANT,
      provider,
      apiKeyEncrypted: encrypted,
      accountRef: accountRef ?? null,
      bookingUrl: bookingUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [marketingConnectionsTable.tenant, marketingConnectionsTable.provider],
      set: {
        ...(encrypted ? { apiKeyEncrypted: encrypted } : {}),
        ...(accountRef !== undefined ? { accountRef: accountRef ?? null } : {}),
        ...(bookingUrl !== undefined ? { bookingUrl: bookingUrl ?? null } : {}),
        updatedAt: now,
      },
    })
    .returning();
  await logMarketingActivity("connection_saved", `Connected ${provider}`, null);
  res.json(serializeConnection(saved));
});

router.delete("/marketing/connections/:provider", requireAdmin, async (req, res) => {
  const parsed = DeleteMarketingConnectionParams.safeParse({ provider: req.params.provider });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }
  const deleted = await db
    .delete(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, parsed.data.provider),
      ),
    )
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not connected" });
    return;
  }
  res.status(204).send();
});

router.get("/marketing/activity", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingActivityTable)
    .where(eq(marketingActivityTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingActivityTable.createdAt))
    .limit(100);
  res.json(rows.map(serializeActivity));
});

export default router;
