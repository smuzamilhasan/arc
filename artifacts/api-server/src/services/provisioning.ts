// Provisioning engine for the Marketing OS control plane. An adapter knows how
// to (1) PLAN the changes needed to reconcile one external tool toward the
// blueprint, and (2) APPLY a previously-planned set of changes. Nothing is ever
// written to an external tool without an explicit operator confirm: the route
// layer persists the plan first, then calls apply only on confirmation. Plans
// never carry secrets — apply re-reads credentials from the connection store.
import type {
  BlueprintDefinition,
  BlueprintFieldType,
  ProvisionChange,
  ProvisionPlan,
  ProvisionResult,
} from "@workspace/db";
import {
  createTypeformForm,
  getTypeformStatus,
  listTypeformForms,
} from "./typeform";
import { getConnectorApiKey, getConnectorAccountRef } from "./marketingConnectors";

// Case-insensitive name match used to decide whether a desired object already
// exists in the tool (a form title, a base name, a table name). Reconcile keys
// off the human-facing name because that is the only stable handle the operator
// controls from the blueprint.
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Thrown when a tool cannot be planned/applied because its prerequisites are not
// met (not connected, missing workspace id, etc). The route turns this into a
// 400 with the message so the operator knows exactly what to fix.
export class ProvisionError extends Error {}

export interface ProvisionAdapter {
  provider: string;
  plan(def: BlueprintDefinition): Promise<ProvisionPlan>;
  apply(plan: ProvisionPlan): Promise<ProvisionResult>;
}

// --- Typeform: provision the capture intake form ---

const TYPEFORM_FIELD_TYPE: Record<BlueprintFieldType, string> = {
  short_text: "short_text",
  long_text: "long_text",
  email: "email",
  number: "number",
};

function typeformFields(def: BlueprintDefinition) {
  return def.intakeForm.fields.map((f) => ({
    title: f.label,
    ref: f.key,
    type: TYPEFORM_FIELD_TYPE[f.type] ?? "short_text",
    validations: { required: f.required },
  }));
}

const typeformAdapter: ProvisionAdapter = {
  provider: "typeform",
  async plan(def) {
    const status = await getTypeformStatus();
    if (!status.connected) {
      throw new ProvisionError(
        "Typeform is not connected. Connect a Typeform account first.",
      );
    }
    const title = def.intakeForm.title;
    // Read the current state: if a form with this title already exists in the
    // account, the capture form is already provisioned. The Typeform adapter
    // only knows how to CREATE a form (it has no field-update write path), so a
    // matching form means there is genuinely nothing to do — return an empty
    // delta rather than creating a duplicate form.
    const existing = await listTypeformForms();
    if (existing.some((f) => sameName(f.title, title))) {
      return {
        provider: "typeform",
        summary: `Typeform already has a form titled "${title}". Nothing to do.`,
        changes: [],
      };
    }
    const fields = typeformFields(def);
    return {
      provider: "typeform",
      summary: `Create the intake form "${title}" with ${pluralize(fields.length, "field")}.`,
      changes: [
        {
          op: "create_form",
          summary: `New Typeform form: "${title}"`,
          detail: {
            title,
            fields: fields.map((f) => ({
              label: f.title,
              type: f.type,
              required: f.validations.required,
            })),
          },
        },
      ],
    };
  },
  async apply(plan) {
    const change = plan.changes.find((c) => c.op === "create_form");
    if (!change) {
      throw new ProvisionError("Nothing to apply; Typeform is already in sync.");
    }
    const detail = (change.detail ?? {}) as {
      title?: string;
      fields?: Array<{ label: string; type: string; required: boolean }>;
    };
    const title = detail.title ?? "Work with us";
    const fields = (detail.fields ?? []).map((f, i) => ({
      title: f.label,
      ref: `field_${i}_${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}`,
      type: f.type,
      validations: { required: f.required },
    }));
    const created = await createTypeformForm(title, fields);
    return {
      applied: [
        {
          op: "create_form",
          summary: `Created Typeform form "${title}"`,
          detail: { formId: created.id, url: created.url },
        },
      ],
      outputs: { formId: created.id, url: created.url },
    };
  },
};

// --- Airtable: provision the re-engage CRM base ---

interface AirtableField {
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

function airtableField(name: string, type: BlueprintFieldType): AirtableField {
  switch (type) {
    case "long_text":
      return { name, type: "multilineText" };
    case "email":
      return { name, type: "email" };
    case "number":
      return { name, type: "number", options: { precision: 0 } };
    case "short_text":
    default:
      return { name, type: "singleLineText" };
  }
}

function airtableTables(def: BlueprintDefinition) {
  return def.crm.tables.map((t) => ({
    name: t.name,
    description: t.description,
    fields: t.fields.map((f) => airtableField(f.name, f.type)),
  }));
}

// Read the bases visible to this API key, paging through the offset cursor so a
// workspace with many bases is fully covered. Used by plan to decide create-base
// vs. add-tables vs. no-op.
async function listAirtableBases(
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const bases: Array<{ id: string; name: string }> = [];
  let offset: string | undefined;
  do {
    const url = new URL("https://api.airtable.com/v0/meta/bases");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProvisionError(`Airtable API ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      bases?: Array<{ id: string; name: string }>;
      offset?: string;
    };
    for (const b of data.bases ?? []) bases.push({ id: b.id, name: b.name });
    offset = data.offset;
  } while (offset);
  return bases;
}

// Read the tables that already exist in one base. Used to compute which
// blueprint tables are missing from an existing base.
async function listAirtableTables(
  apiKey: string,
  baseId: string,
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProvisionError(`Airtable API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    tables?: Array<{ id: string; name: string }>;
  };
  return (data.tables ?? []).map((t) => ({ id: t.id, name: t.name }));
}

const airtableAdapter: ProvisionAdapter = {
  provider: "airtable",
  async plan(def) {
    const apiKey = await getConnectorApiKey("airtable");
    if (!apiKey) {
      throw new ProvisionError(
        "Airtable is not connected. Add an Airtable API key first.",
      );
    }
    const baseName = def.crm.baseName;
    const tables = airtableTables(def);
    // Read current state: does a base with this name already exist?
    const bases = await listAirtableBases(apiKey);
    const existingBase = bases.find((b) => sameName(b.name, baseName));

    if (!existingBase) {
      // Nothing exists yet — creating the base requires a workspace id.
      const workspaceId = await getConnectorAccountRef("airtable");
      if (!workspaceId) {
        throw new ProvisionError(
          "Airtable workspace ID is missing. Add it on the Airtable connection.",
        );
      }
      return {
        provider: "airtable",
        summary: `Create a new Airtable base "${baseName}" with ${pluralize(tables.length, "table")}.`,
        changes: tables.map((t) => ({
          op: "create_table",
          summary: `Table "${t.name}" with ${pluralize(t.fields.length, "field")}`,
          detail: {
            name: t.name,
            baseName,
            fields: t.fields.map((f) => `${f.name} (${f.type})`),
          },
        })),
      };
    }

    // The base exists — only the tables it does not already have are a genuine
    // delta. If every table is present, the tool is already in sync.
    const existingTables = await listAirtableTables(apiKey, existingBase.id);
    const missing = tables.filter(
      (t) => !existingTables.some((e) => sameName(e.name, t.name)),
    );
    if (missing.length === 0) {
      return {
        provider: "airtable",
        summary: `Airtable base "${baseName}" already has all ${pluralize(tables.length, "table")}. Nothing to do.`,
        changes: [],
      };
    }
    return {
      provider: "airtable",
      summary: `Add ${pluralize(missing.length, "table")} to existing Airtable base "${baseName}".`,
      changes: missing.map((t) => ({
        op: "create_table",
        summary: `Add table "${t.name}" with ${pluralize(t.fields.length, "field")} to "${baseName}"`,
        detail: {
          name: t.name,
          baseId: existingBase.id,
          fields: t.fields.map((f) => `${f.name} (${f.type})`),
        },
      })),
    };
  },
  async apply(plan) {
    const apiKey = await getConnectorApiKey("airtable");
    if (!apiKey) {
      throw new ProvisionError("Airtable connection is incomplete.");
    }
    const tableChanges = plan.changes.filter((c) => c.op === "create_table");
    if (tableChanges.length === 0) {
      throw new ProvisionError("Nothing to apply; Airtable is already in sync.");
    }
    // The plan tells us whether to create a brand-new base or add tables into an
    // existing one: an existing-base change carries the baseId it targets.
    const firstDetail = (tableChanges[0].detail ?? {}) as {
      baseId?: string;
      baseName?: string;
    };

    if (firstDetail.baseId) {
      const baseId = firstDetail.baseId;
      const applied: ProvisionChange[] = [];
      for (const c of tableChanges) {
        const d = (c.detail ?? {}) as { name?: string; fields?: string[] };
        const name = d.name ?? "Table";
        const fields = (d.fields ?? []).map((spec) => parseFieldSpec(spec));
        const res = await fetch(
          `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ name, fields }),
          },
        );
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new ProvisionError(
            `Airtable API ${res.status}: ${detail.slice(0, 300)}`,
          );
        }
        const created = (await res.json()) as { id: string };
        applied.push({
          op: "create_table",
          summary: `Created table "${name}"`,
          detail: { tableId: created.id },
        });
      }
      return {
        applied,
        outputs: { baseId, url: `https://airtable.com/${baseId}` },
      };
    }

    // No existing base — create it with all planned tables in one call.
    const workspaceId = await getConnectorAccountRef("airtable");
    if (!workspaceId) {
      throw new ProvisionError("Airtable connection is incomplete.");
    }
    const baseName = firstDetail.baseName ?? "Marketing CRM";
    const tables = tableChanges.map((c) => {
      const d = (c.detail ?? {}) as { name?: string; fields?: string[] };
      return {
        name: d.name ?? "Table",
        fields: (d.fields ?? []).map((spec) => parseFieldSpec(spec)),
      };
    });

    const res = await fetch("https://api.airtable.com/v0/meta/bases", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: baseName, workspaceId, tables }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProvisionError(
        `Airtable API ${res.status}: ${detail.slice(0, 300)}`,
      );
    }
    const created = (await res.json()) as { id: string; tables?: unknown[] };
    return {
      applied: [
        {
          op: "create_base",
          summary: `Created Airtable base "${baseName}"`,
          detail: { baseId: created.id },
        },
      ],
      outputs: {
        baseId: created.id,
        url: `https://airtable.com/${created.id}`,
      },
    };
  },
};

// Turn "Fit Score (number)" back into an Airtable field payload. Mirrors
// airtableField so apply rebuilds the same shape the plan previewed.
function parseFieldSpec(spec: string): AirtableField {
  const m = spec.match(/^(.*)\s+\(([a-zA-Z]+)\)$/);
  const name = (m?.[1] ?? spec).trim();
  const type = m?.[2] ?? "singleLineText";
  if (type === "number") return { name, type: "number", options: { precision: 0 } };
  return { name, type };
}

// --- Shared HTTP helpers for BYO-key REST adapters ---

const PROVISION_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Build a ProvisionError from a failed response. The response BODY (not the
// request) is surfaced, truncated, so no credentials ever leak into the error.
async function provisionHttpError(
  label: string,
  res: Response,
): Promise<ProvisionError> {
  if (res.status === 401 || res.status === 403) {
    return new ProvisionError(
      `${label} rejected the API key. Reconnect ${label} and try again.`,
    );
  }
  const detail = await res.text().catch(() => "");
  return new ProvisionError(`${label} API ${res.status}: ${detail.slice(0, 200)}`);
}

// --- Make.com: provision the qualify-stage intake webhook ---

// Make's API zone varies per account (eu1/us1/...), so the operator supplies the
// full API base URL as the account ref. Hook creation needs a teamId, which we
// resolve from the account at apply time so the connection UI stays single-field.
function normalizeMakeBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

function makeWebhookName(def: BlueprintDefinition): string {
  return `Leads: ${def.intakeForm.title}`;
}

async function resolveMakeTeamId(base: string, apiKey: string): Promise<string> {
  const headers = { Authorization: `Token ${apiKey}` };
  const orgRes = await fetchWithTimeout(`${base}/organizations`, { headers });
  if (!orgRes.ok) throw await provisionHttpError("Make", orgRes);
  const orgData = (await orgRes.json().catch(() => ({}))) as {
    organizations?: Array<{ id: number | string }>;
  };
  const orgId = orgData.organizations?.[0]?.id;
  if (orgId == null) {
    throw new ProvisionError("No Make organization found for this API key.");
  }
  const teamRes = await fetchWithTimeout(
    `${base}/teams?organizationId=${encodeURIComponent(String(orgId))}`,
    { headers },
  );
  if (!teamRes.ok) throw await provisionHttpError("Make", teamRes);
  const teamData = (await teamRes.json().catch(() => ({}))) as {
    teams?: Array<{ id: number | string }>;
  };
  const teamId = teamData.teams?.[0]?.id;
  if (teamId == null) {
    throw new ProvisionError("No Make team found for this organization.");
  }
  return String(teamId);
}

// List the incoming hooks already defined for a team, so plan can detect when
// the qualify-stage webhook has already been provisioned.
async function listMakeHooks(
  base: string,
  apiKey: string,
  teamId: string,
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetchWithTimeout(
    `${base}/hooks?teamId=${encodeURIComponent(teamId)}`,
    { headers: { Authorization: `Token ${apiKey}` } },
  );
  if (!res.ok) throw await provisionHttpError("Make", res);
  const data = (await res.json().catch(() => ({}))) as {
    hooks?: Array<{ id?: number | string; name?: string }>;
  };
  return (data.hooks ?? [])
    .filter((h) => h.name != null)
    .map((h) => ({ id: h.id != null ? String(h.id) : "", name: String(h.name) }));
}

const makeAdapter: ProvisionAdapter = {
  provider: "make",
  async plan(def) {
    const apiKey = await getConnectorApiKey("make");
    if (!apiKey) {
      throw new ProvisionError(
        "Make is not connected. Add a Make API key first.",
      );
    }
    const baseRef = await getConnectorAccountRef("make");
    if (!baseRef) {
      throw new ProvisionError(
        "Make API base URL is missing. Add your zone URL on the Make connection.",
      );
    }
    const base = normalizeMakeBase(baseRef);
    const name = makeWebhookName(def);
    // Read current state: a webhook with this name already covers the qualify
    // stage, so there is nothing to create.
    const teamId = await resolveMakeTeamId(base, apiKey);
    const hooks = await listMakeHooks(base, apiKey, teamId);
    if (hooks.some((h) => sameName(h.name, name))) {
      return {
        provider: "make",
        summary: `Make already has a webhook "${name}". Nothing to do.`,
        changes: [],
      };
    }
    return {
      provider: "make",
      summary: `Create a Make webhook "${name}" to receive captured leads for qualification.`,
      changes: [
        {
          op: "create_webhook",
          summary: `New Make incoming webhook: "${name}"`,
          detail: {
            name,
            typeName: "gateway-webhook",
            forwards: def.intakeForm.fields.map((f) => f.label),
          },
        },
      ],
    };
  },
  async apply(plan) {
    const apiKey = await getConnectorApiKey("make");
    const baseRef = await getConnectorAccountRef("make");
    if (!apiKey || !baseRef) {
      throw new ProvisionError("Make connection is incomplete.");
    }
    const base = normalizeMakeBase(baseRef);
    const change = plan.changes.find((c) => c.op === "create_webhook");
    if (!change) {
      throw new ProvisionError("Nothing to apply; Make is already in sync.");
    }
    const detail = (change.detail ?? {}) as { name?: string };
    const name = detail.name ?? "Marketing OS leads";

    const teamId = await resolveMakeTeamId(base, apiKey);
    const res = await fetchWithTimeout(`${base}/hooks`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name, teamId, typeName: "gateway-webhook" }),
    });
    if (!res.ok) throw await provisionHttpError("Make", res);
    const created = (await res.json().catch(() => ({}))) as {
      hook?: { id?: number | string; url?: string };
    };
    const hookId = created.hook?.id != null ? String(created.hook.id) : undefined;
    const url = created.hook?.url;
    return {
      applied: [
        {
          op: "create_webhook",
          summary: `Created Make webhook "${name}"`,
          detail: { hookId, url },
        },
      ],
      outputs: { hookId, ...(url ? { url } : {}) },
    };
  },
};

// --- Instantly: provision the convert-stage cold-outreach campaign ---

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

function instantlyCampaignName(def: BlueprintDefinition): string {
  return `Outreach: ${def.intakeForm.title}`;
}

// Instantly v2 requires a campaign_schedule when creating a campaign. We seed a
// sensible business-hours, Mon–Fri default the operator can refine in Instantly.
function instantlyDefaultSchedule() {
  return {
    schedules: [
      {
        name: "Business hours",
        timing: { from: "09:00", to: "17:00" },
        days: { "0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false },
        timezone: "America/New_York",
      },
    ],
  };
}

// List existing campaigns, paging through Instantly v2's cursor, so plan can
// detect when the convert-stage campaign has already been provisioned.
async function listInstantlyCampaigns(
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const campaigns: Array<{ id: string; name: string }> = [];
  let startingAfter: string | undefined;
  const MAX_PAGES = 50;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${INSTANTLY_BASE}/campaigns`);
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw await provisionHttpError("Instantly", res);
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ id?: number | string; name?: string }>;
      next_starting_after?: string | null;
    };
    for (const c of data.items ?? []) {
      if (c.name != null) {
        campaigns.push({
          id: c.id != null ? String(c.id) : "",
          name: String(c.name),
        });
      }
    }
    if (!data.next_starting_after) break;
    startingAfter = data.next_starting_after;
  }
  return campaigns;
}

const instantlyAdapter: ProvisionAdapter = {
  provider: "instantly",
  async plan(def) {
    const apiKey = await getConnectorApiKey("instantly");
    if (!apiKey) {
      throw new ProvisionError(
        "Instantly is not connected. Add an Instantly API key first.",
      );
    }
    const name = instantlyCampaignName(def);
    // Read current state: a campaign with this name already covers the convert
    // stage, so there is nothing to create.
    const existing = await listInstantlyCampaigns(apiKey);
    if (existing.some((c) => sameName(c.name, name))) {
      return {
        provider: "instantly",
        summary: `Instantly already has a campaign "${name}". Nothing to do.`,
        changes: [],
      };
    }
    return {
      provider: "instantly",
      summary: `Create the Instantly campaign "${name}" to run cold outreach against qualified leads.`,
      changes: [
        {
          op: "create_campaign",
          summary: `New Instantly campaign: "${name}"`,
          detail: {
            name,
            schedule: "Business hours, Mon–Fri, 09:00–17:00 (America/New_York)",
          },
        },
      ],
    };
  },
  async apply(plan) {
    const apiKey = await getConnectorApiKey("instantly");
    if (!apiKey) {
      throw new ProvisionError("Instantly connection is incomplete.");
    }
    const change = plan.changes.find((c) => c.op === "create_campaign");
    if (!change) {
      throw new ProvisionError("Nothing to apply; Instantly is already in sync.");
    }
    const detail = (change.detail ?? {}) as { name?: string };
    const name = detail.name ?? "Marketing OS outreach";

    const res = await fetchWithTimeout(`${INSTANTLY_BASE}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name,
        campaign_schedule: instantlyDefaultSchedule(),
      }),
    });
    if (!res.ok) throw await provisionHttpError("Instantly", res);
    const created = (await res.json().catch(() => ({}))) as {
      id?: number | string;
    };
    const campaignId = created.id != null ? String(created.id) : undefined;
    return {
      applied: [
        {
          op: "create_campaign",
          summary: `Created Instantly campaign "${name}"`,
          detail: { campaignId },
        },
      ],
      outputs: campaignId ? { campaignId } : {},
    };
  },
};

const ADAPTERS: Record<string, ProvisionAdapter> = {
  typeform: typeformAdapter,
  airtable: airtableAdapter,
  make: makeAdapter,
  instantly: instantlyAdapter,
};

export function getProvisionAdapter(provider: string): ProvisionAdapter | undefined {
  return ADAPTERS[provider];
}
