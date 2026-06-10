import { Router } from "express";
import {
  db,
  marketingLeadsTable,
  marketingActionsTable,
  marketingConnectionsTable,
  marketingActivityTable,
  marketingFormSourcesTable,
  marketingProvisionRunsTable,
  type FormFieldMapping,
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
  SaveMarketingFormSourceBody,
  DeleteMarketingFormSourceParams,
  SyncMarketingFormSourceParams,
  UpdateMarketingBlueprintBody,
  PlanMarketingProvisionParams,
  ApplyMarketingProvisionRunParams,
} from "@workspace/api-zod";
import { and, desc, eq } from "drizzle-orm";
import { isAdmin, requireAdmin } from "../middlewares/requireAdmin";
import { aiGenerationRateLimit, externalApiRateLimit } from "../middlewares/aiRateLimit";
import { encryptSecret, isEncryptionConfigured } from "../lib/crypto";
import { sendEmail } from "../services/email";
import {
  MARKETING_TENANT,
  leadStatusForRoute,
  routeNextStep,
  type FitTier,
} from "../services/marketing";
import {
  captureLead,
  runQualification,
  qualifyInBackground,
  getBookingUrl,
  getResendApiKey,
  logMarketingActivity,
  deleteTenantMarketingData,
} from "../services/marketingData";
import {
  getTypeformStatus,
  listTypeformForms,
  getTypeformFields,
  syncFormSource,
} from "../services/typeform";
import {
  MARKETING_CONNECTORS,
  getConnector,
} from "../services/marketingConnectors";
import { getOrCreateBlueprint, updateBlueprint } from "../services/blueprint";
import {
  getProvisionAdapter,
  ProvisionError,
} from "../services/provisioning";

const router = Router();

type LeadRow = typeof marketingLeadsTable.$inferSelect;
type ActionRow = typeof marketingActionsTable.$inferSelect;
type ConnectionRow = typeof marketingConnectionsTable.$inferSelect;
type ActivityRow = typeof marketingActivityTable.$inferSelect;
type FormSourceRow = typeof marketingFormSourcesTable.$inferSelect;

function serializeFormSource(s: FormSourceRow) {
  return {
    id: s.id,
    provider: s.provider,
    formId: s.formId,
    formTitle: s.formTitle,
    fieldMapping: s.fieldMapping as FormFieldMapping,
    enabled: s.enabled,
    lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

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
  const meta = getConnector(c.provider);
  // Connection is "connected" per its auth model: url providers need a booking
  // URL, byokey providers need a stored encrypted key.
  const connected =
    meta?.authType === "url"
      ? Boolean(c.bookingUrl)
      : Boolean(c.apiKeyEncrypted);
  return {
    provider: c.provider,
    connected,
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
    emailsSent: sentActions.filter((a) => a.kind === "outreach_email").length,
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
  // Manual leads follow the same capture -> auto-qualify spine as the public
  // intake paths: kick off AI qualification in the background so a proposal is
  // produced without blocking the create response.
  qualifyInBackground(lead.id);
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
  const leadActions = await db
    .select()
    .from(marketingActionsTable)
    .where(
      and(
        eq(marketingActionsTable.tenant, MARKETING_TENANT),
        eq(marketingActionsTable.leadId, lead.id),
      ),
    )
    .orderBy(desc(marketingActionsTable.createdAt));
  // Surface the latest of each proposal kind: the email draft (editable + sends
  // on approve) and the route decision (advances the funnel stage on approve).
  const action = leadActions.find((a) => a.kind === "outreach_email") ?? null;
  const routeAction =
    leadActions.find((a) => a.kind === "route_decision") ?? null;
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
    routeAction: routeAction ? serializeAction(routeAction) : null,
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
    // Re-read the lead + both proposals + full activity so the client gets the
    // fresh detail (qualification creates a route decision and an email draft).
    const [lead] = await db
      .select()
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.id, parsed.data.id),
          eq(marketingLeadsTable.tenant, MARKETING_TENANT),
        ),
      );
    const leadActions = await db
      .select()
      .from(marketingActionsTable)
      .where(
        and(
          eq(marketingActionsTable.tenant, MARKETING_TENANT),
          eq(marketingActionsTable.leadId, parsed.data.id),
        ),
      )
      .orderBy(desc(marketingActionsTable.createdAt));
    const routeAction =
      leadActions.find((a) => a.kind === "route_decision") ?? null;
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
      routeAction: routeAction ? serializeAction(routeAction) : null,
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

    const now = new Date();

    // Route decision: approving advances the lead into the funnel track chosen
    // for its fit, and surfaces the next step (booking link for high-fit). No
    // external side effect — this is purely a stage transition.
    if (action.kind === "route_decision") {
      const route = (action.route ?? "low") as FitTier;
      const newStatus = leadStatusForRoute(route);
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
        .set({ status: newStatus, updatedAt: now })
        .where(
          and(
            eq(marketingLeadsTable.id, lead.id),
            eq(marketingLeadsTable.tenant, MARKETING_TENANT),
          ),
        );
      await logMarketingActivity(
        "route_approved",
        `Routed ${lead.name ?? lead.email} (${route} fit). ${routeNextStep(route, action.bookingUrl)}`,
        lead.id,
      );
      res.json(serializeAction(updated));
      return;
    }

    // Outreach email: approving actually sends through the connected channel.
    // Prefer the tenant's connected Resend key (BYO, decrypted from the
    // marketing connection) so the stored connection actually drives delivery;
    // fall back to the shared connector proxy when no key is configured.
    const resendApiKey = await getResendApiKey();
    const sent = await sendEmail({
      to: lead.email,
      subject: action.emailSubject ?? "A note from the arc team",
      html: bodyToHtml(action.emailBody ?? ""),
      text: action.emailBody ?? undefined,
      apiKey: resendApiKey ?? undefined,
    });
    if (!sent) {
      res.status(502).json({ error: "Email delivery failed" });
      return;
    }

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
    // The route owns the funnel stage; only nudge to "contacted" when the lead
    // has not already been routed, so an approved route is never clobbered.
    if (lead.status === "new" || lead.status === "qualified") {
      await db
        .update(marketingLeadsTable)
        .set({ status: "contacted", updatedAt: now })
        .where(
          and(
            eq(marketingLeadsTable.id, lead.id),
            eq(marketingLeadsTable.tenant, MARKETING_TENANT),
          ),
        );
    }
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

  const meta = getConnector(provider);
  if (!meta) {
    res.status(400).json({ error: "Unknown provider." });
    return;
  }
  if (meta.authType === "managed") {
    res.status(400).json({ error: `${meta.label} is connected through Replit, not an API key.` });
    return;
  }

  // Look up any existing connection so updates can change only some fields
  // (e.g. an account ref) without forcing the operator to re-enter the key.
  const [existing] = await db
    .select()
    .from(marketingConnectionsTable)
    .where(
      and(
        eq(marketingConnectionsTable.tenant, MARKETING_TENANT),
        eq(marketingConnectionsTable.provider, provider),
      ),
    );

  if (meta.authType === "url") {
    if (!bookingUrl && !existing?.bookingUrl) {
      res.status(400).json({ error: `A URL is required for ${meta.label}.` });
      return;
    }
  } else {
    // byokey
    if (!apiKey && !existing?.apiKeyEncrypted) {
      res.status(400).json({ error: `An API key is required for ${meta.label}.` });
      return;
    }
    if (apiKey && !isEncryptionConfigured()) {
      req.log.error("APP_ENCRYPTION_KEY missing; cannot store marketing key");
      res.status(500).json({ error: "Server is not configured to store API keys." });
      return;
    }
    if (meta.accountRefRequired && !accountRef && !existing?.accountRef) {
      res.status(400).json({
        error: `${meta.accountRefLabel ?? "An account reference"} is required for ${meta.label}.`,
      });
      return;
    }
  }

  const now = new Date();
  const encrypted = meta.authType !== "url" && apiKey ? encryptSecret(apiKey) : null;
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

// --- Control plane: connector registry, blueprint, provisioning ---

function serializeRun(r: typeof marketingProvisionRunsTable.$inferSelect) {
  return {
    id: r.id,
    provider: r.provider,
    status: r.status,
    plan: r.plan,
    result: r.result ?? null,
    error: r.error ?? null,
    createdAt: r.createdAt.toISOString(),
    appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
  };
}

// The registry of orchestratable tools, annotated with live connection status so
// the Build/Connections UI can render one card per tool.
router.get("/marketing/connectors", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingConnectionsTable)
    .where(eq(marketingConnectionsTable.tenant, MARKETING_TENANT));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const tfStatus = await getTypeformStatus().catch(() => ({ connected: false }));

  const connectors = MARKETING_CONNECTORS.map((meta) => {
    const row = byProvider.get(meta.id);
    let connected = false;
    let accountRef: string | null = null;
    if (meta.authType === "managed") {
      connected = meta.id === "typeform" ? tfStatus.connected : false;
    } else if (meta.authType === "url") {
      connected = Boolean(row?.bookingUrl);
    } else {
      connected = Boolean(row?.apiKeyEncrypted);
      accountRef = row?.accountRef ?? null;
    }
    return {
      id: meta.id,
      label: meta.label,
      category: meta.category,
      authType: meta.authType,
      provisionable: meta.provisionable,
      description: meta.description,
      accountRefLabel: meta.accountRefLabel ?? null,
      accountRefRequired: Boolean(meta.accountRefRequired),
      connected,
      accountRef,
    };
  });
  res.json(connectors);
});

router.get("/marketing/blueprint", requireAdmin, async (_req, res) => {
  const bp = await getOrCreateBlueprint();
  res.json({
    id: bp.id,
    name: bp.name,
    definition: bp.definition,
    updatedAt: bp.updatedAt.toISOString(),
  });
});

router.put("/marketing/blueprint", requireAdmin, async (req, res) => {
  const parsed = UpdateMarketingBlueprintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const bp = await updateBlueprint(parsed.data.definition);
  await logMarketingActivity("blueprint_saved", "Updated funnel blueprint", null);
  res.json({
    id: bp.id,
    name: bp.name,
    definition: bp.definition,
    updatedAt: bp.updatedAt.toISOString(),
  });
});

// Preview the changes needed to reconcile a tool toward the blueprint. Persists
// a `planned` run; NOTHING is written to the external tool here.
router.post(
  "/marketing/provision/:provider/plan",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    const parsed = PlanMarketingProvisionParams.safeParse({
      provider: req.params.provider,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid provider" });
      return;
    }
    const { provider } = parsed.data;
    const meta = getConnector(provider);
    const adapter = getProvisionAdapter(provider);
    if (!meta || !meta.provisionable || !adapter) {
      res.status(400).json({ error: "This tool cannot be provisioned." });
      return;
    }
    const bp = await getOrCreateBlueprint();
    let plan;
    try {
      plan = await adapter.plan(bp.definition);
    } catch (err) {
      if (err instanceof ProvisionError) {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "provision plan failed");
      res.status(400).json({ error: "Could not plan this provisioning run." });
      return;
    }
    const [run] = await db
      .insert(marketingProvisionRunsTable)
      .values({
        tenant: MARKETING_TENANT,
        blueprintId: bp.id,
        provider,
        status: "planned",
        plan,
      })
      .returning();
    await logMarketingActivity(
      "provision_planned",
      `Planned provisioning for ${meta.label}`,
      null,
    );
    res.json(serializeRun(run));
  },
);

router.get("/marketing/provision/runs", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingProvisionRunsTable)
    .where(eq(marketingProvisionRunsTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingProvisionRunsTable.createdAt));
  res.json(rows.map(serializeRun));
});

// Apply a previously-planned run. This is the ONLY path that writes to an
// external tool, and only runs after the operator has confirmed the plan.
router.post(
  "/marketing/provision/runs/:id/apply",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    const parsed = ApplyMarketingProvisionRunParams.safeParse({
      id: req.params.id,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid run id" });
      return;
    }
    const [run] = await db
      .select()
      .from(marketingProvisionRunsTable)
      .where(
        and(
          eq(marketingProvisionRunsTable.tenant, MARKETING_TENANT),
          eq(marketingProvisionRunsTable.id, parsed.data.id),
        ),
      );
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    if (run.status !== "planned") {
      res.status(400).json({ error: `Run is already ${run.status}.` });
      return;
    }
    const adapter = getProvisionAdapter(run.provider);
    if (!adapter) {
      res.status(400).json({ error: "This tool cannot be provisioned." });
      return;
    }
    // Atomically claim the run before any external write. Only the request that
    // flips planned->applying proceeds; a concurrent confirm finds 0 rows and is
    // rejected, so the external tool is never written twice for one run.
    const claimed = await db
      .update(marketingProvisionRunsTable)
      .set({ status: "applying" })
      .where(
        and(
          eq(marketingProvisionRunsTable.tenant, MARKETING_TENANT),
          eq(marketingProvisionRunsTable.id, run.id),
          eq(marketingProvisionRunsTable.status, "planned"),
        ),
      )
      .returning();
    if (claimed.length === 0) {
      res.status(409).json({ error: "Run is already being applied." });
      return;
    }
    const claimedRun = claimed[0];
    try {
      const result = await adapter.apply(claimedRun.plan);
      const [updated] = await db
        .update(marketingProvisionRunsTable)
        .set({ status: "applied", result, error: null, appliedAt: new Date() })
        .where(
          and(
            eq(marketingProvisionRunsTable.tenant, MARKETING_TENANT),
            eq(marketingProvisionRunsTable.id, claimedRun.id),
            eq(marketingProvisionRunsTable.status, "applying"),
          ),
        )
        .returning();
      await logMarketingActivity(
        "provision_applied",
        `Applied provisioning for ${getConnector(run.provider)?.label ?? run.provider}`,
        null,
      );
      res.json(serializeRun(updated));
    } catch (err) {
      const message =
        err instanceof ProvisionError
          ? err.message
          : "Provisioning failed while writing to the tool.";
      if (!(err instanceof ProvisionError)) {
        req.log.error({ err }, "provision apply failed");
      }
      const [updated] = await db
        .update(marketingProvisionRunsTable)
        .set({ status: "failed", error: message })
        .where(
          and(
            eq(marketingProvisionRunsTable.tenant, MARKETING_TENANT),
            eq(marketingProvisionRunsTable.id, claimedRun.id),
            eq(marketingProvisionRunsTable.status, "applying"),
          ),
        )
        .returning();
      res.status(400).json({ error: message, run: serializeRun(updated) });
    }
  },
);

// --- Typeform lead connector (one-way: pull submissions in as leads) ---

router.get("/marketing/typeform/status", requireAdmin, async (_req, res) => {
  const status = await getTypeformStatus();
  res.json(status);
});

router.get(
  "/marketing/typeform/forms",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    try {
      const forms = await listTypeformForms();
      res.json(forms);
    } catch (err) {
      req.log.error({ err }, "Failed to list Typeform forms");
      res.status(502).json({ error: "Could not reach Typeform." });
    }
  },
);

router.get(
  "/marketing/typeform/forms/:formId/fields",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    try {
      const fields = await getTypeformFields(String(req.params.formId));
      res.json(fields);
    } catch (err) {
      req.log.error({ err }, "Failed to list Typeform fields");
      res.status(502).json({ error: "Could not reach Typeform." });
    }
  },
);

router.get("/marketing/form-sources", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingFormSourcesTable)
    .where(eq(marketingFormSourcesTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingFormSourcesTable.createdAt));
  res.json(rows.map(serializeFormSource));
});

router.post("/marketing/form-sources", requireAdmin, async (req, res) => {
  const parsed = SaveMarketingFormSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { formId, formTitle, fieldMapping, enabled } = parsed.data;
  if (!fieldMapping.email) {
    res.status(400).json({ error: "An email field mapping is required." });
    return;
  }
  const mapping: FormFieldMapping = {
    email: fieldMapping.email,
    name: fieldMapping.name ?? null,
    company: fieldMapping.company ?? null,
    message: fieldMapping.message ?? null,
  };
  const now = new Date();
  const [saved] = await db
    .insert(marketingFormSourcesTable)
    .values({
      tenant: MARKETING_TENANT,
      provider: "typeform",
      formId,
      formTitle: formTitle ?? null,
      fieldMapping: mapping,
      enabled: enabled ?? true,
    })
    .onConflictDoUpdate({
      target: [
        marketingFormSourcesTable.tenant,
        marketingFormSourcesTable.provider,
        marketingFormSourcesTable.formId,
      ],
      set: {
        formTitle: formTitle ?? null,
        fieldMapping: mapping,
        ...(enabled !== undefined ? { enabled } : {}),
        updatedAt: now,
      },
    })
    .returning();
  await logMarketingActivity(
    "form_source_saved",
    `Configured Typeform source "${saved.formTitle ?? saved.formId}"`,
    null,
  );
  res.json(serializeFormSource(saved));
});

router.delete("/marketing/form-sources/:id", requireAdmin, async (req, res) => {
  const parsed = DeleteMarketingFormSourceParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = await db
    .delete(marketingFormSourcesTable)
    .where(
      and(
        eq(marketingFormSourcesTable.tenant, MARKETING_TENANT),
        eq(marketingFormSourcesTable.id, parsed.data.id),
      ),
    )
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

router.post(
  "/marketing/form-sources/:id/sync",
  requireAdmin,
  externalApiRateLimit,
  async (req, res) => {
    const parsed = SyncMarketingFormSourceParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [source] = await db
      .select()
      .from(marketingFormSourcesTable)
      .where(
        and(
          eq(marketingFormSourcesTable.tenant, MARKETING_TENANT),
          eq(marketingFormSourcesTable.id, parsed.data.id),
        ),
      );
    if (!source) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const result = await syncFormSource(source);
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "Typeform sync failed");
      res.status(502).json({ error: "Could not sync from Typeform." });
    }
  },
);

router.get("/marketing/activity", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(marketingActivityTable)
    .where(eq(marketingActivityTable.tenant, MARKETING_TENANT))
    .orderBy(desc(marketingActivityTable.createdAt))
    .limit(100);
  res.json(rows.map(serializeActivity));
});

// Authoritative tenant cleanup execution path. Marketing data is tenant-keyed,
// not clientId-keyed, so it is deliberately NOT part of per-user deleteClientData;
// this admin-only purge is where the funnel's data lifecycle is reset. Removes
// every lead, action, connection, and activity row for the tenant.
router.post("/marketing/reset", requireAdmin, async (_req, res) => {
  await deleteTenantMarketingData(MARKETING_TENANT);
  res.status(204).end();
});

export default router;
