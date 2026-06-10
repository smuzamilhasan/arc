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

const ADAPTERS: Record<string, ProvisionAdapter> = {
  typeform: typeformAdapter,
  airtable: airtableAdapter,
};

export function getProvisionAdapter(provider: string): ProvisionAdapter | undefined {
  return ADAPTERS[provider];
}
