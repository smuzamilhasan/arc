// Provisioning engine for the Marketing OS control plane. An adapter knows how
// to (1) PLAN the changes needed to reconcile one external tool toward the
// blueprint, and (2) APPLY a previously-planned set of changes. Nothing is ever
// written to an external tool without an explicit operator confirm: the route
// layer persists the plan first, then calls apply only on confirmation. Plans
// never carry secrets — apply re-reads credentials from the connection store.
import type {
  BlueprintDefinition,
  BlueprintFieldType,
  ProvisionPlan,
  ProvisionResult,
} from "@workspace/db";
import { createTypeformForm, getTypeformStatus } from "./typeform";
import { getConnectorApiKey, getConnectorAccountRef } from "./marketingConnectors";

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
    const fields = typeformFields(def);
    return {
      provider: "typeform",
      summary: `Create the intake form "${def.intakeForm.title}" with ${fields.length} field${fields.length === 1 ? "" : "s"}.`,
      changes: [
        {
          op: "create_form",
          summary: `New Typeform form: "${def.intakeForm.title}"`,
          detail: {
            title: def.intakeForm.title,
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
    const change = plan.changes[0];
    const detail = (change?.detail ?? {}) as {
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

const airtableAdapter: ProvisionAdapter = {
  provider: "airtable",
  async plan(def) {
    const apiKey = await getConnectorApiKey("airtable");
    if (!apiKey) {
      throw new ProvisionError(
        "Airtable is not connected. Add an Airtable API key first.",
      );
    }
    const workspaceId = await getConnectorAccountRef("airtable");
    if (!workspaceId) {
      throw new ProvisionError(
        "Airtable workspace ID is missing. Add it on the Airtable connection.",
      );
    }
    const tables = airtableTables(def);
    return {
      provider: "airtable",
      summary: `Create a new Airtable base "${def.crm.baseName}" with ${tables.length} table${tables.length === 1 ? "" : "s"}.`,
      changes: tables.map((t) => ({
        op: "create_table",
        summary: `Table "${t.name}" with ${t.fields.length} field${t.fields.length === 1 ? "" : "s"}`,
        detail: { name: t.name, fields: t.fields.map((f) => `${f.name} (${f.type})`) },
      })),
    };
  },
  async apply(plan) {
    const apiKey = await getConnectorApiKey("airtable");
    const workspaceId = await getConnectorAccountRef("airtable");
    if (!apiKey || !workspaceId) {
      throw new ProvisionError("Airtable connection is incomplete.");
    }
    // Reconstruct the table payload from the planned changes so apply executes
    // exactly what was previewed. baseName is carried on the plan summary, so we
    // re-derive a name; the operator confirmed the table set already.
    const tables = plan.changes
      .filter((c) => c.op === "create_table")
      .map((c) => {
        const d = (c.detail ?? {}) as { name?: string; fields?: string[] };
        return {
          name: d.name ?? "Table",
          fields: (d.fields ?? []).map((spec) => parseFieldSpec(spec)),
        };
      });
    const baseName = plan.summary.match(/base "(.+?)"/)?.[1] ?? "Marketing CRM";

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

const makeAdapter: ProvisionAdapter = {
  provider: "make",
  async plan(def) {
    const apiKey = await getConnectorApiKey("make");
    if (!apiKey) {
      throw new ProvisionError(
        "Make is not connected. Add a Make API key first.",
      );
    }
    const base = await getConnectorAccountRef("make");
    if (!base) {
      throw new ProvisionError(
        "Make API base URL is missing. Add your zone URL on the Make connection.",
      );
    }
    const name = makeWebhookName(def);
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
    const detail = (change?.detail ?? {}) as { name?: string };
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
    const detail = (change?.detail ?? {}) as { name?: string };
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
