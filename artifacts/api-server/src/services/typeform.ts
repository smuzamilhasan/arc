// Typeform lead connector (one-way: pull form submissions in as leads).
// Uses the Replit managed connector proxy (integration: typeform) so no API key
// is stored — the SDK injects and refreshes the OAuth token automatically.
// Every read/write is scoped to MARKETING_TENANT, consistent with the rest of
// Marketing OS. Submissions are deduped by their Typeform response token so a
// re-sync never creates the same lead twice.
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  db,
  marketingFormSourcesTable,
  marketingLeadsTable,
  type MarketingFormSource,
  type FormFieldMapping,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { MARKETING_TENANT } from "./marketing";
import { captureLead, qualifyInBackground, logMarketingActivity } from "./marketingData";

const connectors = new ReplitConnectors();

export interface TypeformFormSummary {
  id: string;
  title: string;
}

export interface TypeformFieldSummary {
  // We map on `ref` (a stable, human-set identifier) and fall back to `id`.
  ref: string;
  id: string;
  title: string;
  type: string;
}

export interface SyncResult {
  formId: string;
  ingested: number;
  skipped: number;
  total: number;
}

// Raw Typeform shapes (only the parts we read).
interface RawForm {
  id: string;
  title: string;
}
interface RawFormDetail {
  fields?: Array<{ id: string; ref: string; title: string; type: string }>;
}
interface RawAnswerField {
  id: string;
  ref: string;
  type: string;
}
interface RawAnswer {
  field: RawAnswerField;
  type: string;
  [key: string]: unknown;
}
interface RawResponse {
  token: string;
  submitted_at: string;
  answers?: RawAnswer[];
}
interface RawResponsesPage {
  total_items: number;
  items?: RawResponse[];
}

// Postgres unique-violation SQLSTATE, used to treat a concurrent duplicate
// insert as a benign skip rather than a sync failure.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

async function tf<T>(path: string): Promise<T> {
  const res = await connectors.proxy("typeform", path, { method: "GET" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Typeform API ${res.status} for ${path}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// True when a Typeform connection is authorized and reachable.
export async function getTypeformStatus(): Promise<{ connected: boolean }> {
  try {
    await tf("/me");
    return { connected: true };
  } catch (err) {
    logger.warn({ err }, "Typeform connection not reachable");
    return { connected: false };
  }
}

export async function listTypeformForms(): Promise<TypeformFormSummary[]> {
  const data = await tf<{ items?: RawForm[] }>("/forms?page_size=200");
  return (data.items ?? []).map((f) => ({ id: f.id, title: f.title }));
}

export async function getTypeformFields(
  formId: string,
): Promise<TypeformFieldSummary[]> {
  const data = await tf<RawFormDetail>(`/forms/${encodeURIComponent(formId)}`);
  return (data.fields ?? []).map((f) => ({
    ref: f.ref,
    id: f.id,
    title: f.title,
    type: f.type,
  }));
}

// Extract a plain-text value from a single Typeform answer regardless of its
// field type. Returns null when the answer carries no usable value.
function answerValue(a: RawAnswer): string | null {
  switch (a.type) {
    case "text":
    case "email":
    case "phone_number":
    case "url":
    case "date":
    case "file_url":
      return (a[a.type] as string) ?? null;
    case "number":
      return a.number != null ? String(a.number) : null;
    case "boolean":
      return a.boolean ? "Yes" : "No";
    case "choice": {
      const choice = a.choice as { label?: string; other?: string } | undefined;
      return choice?.label ?? choice?.other ?? null;
    }
    case "choices": {
      const choices = a.choices as { labels?: string[]; other?: string } | undefined;
      const labels = choices?.labels ?? [];
      if (choices?.other) labels.push(choices.other);
      return labels.length ? labels.join(", ") : null;
    }
    default: {
      const v = a[a.type];
      return v != null && typeof v !== "object" ? String(v) : null;
    }
  }
}

// Resolve the mapped value for one lead attribute from a response's answers,
// matching by field ref first then id.
function mappedValue(
  answers: RawAnswer[],
  fieldKey: string | null,
): string | null {
  if (!fieldKey) return null;
  const match = answers.find(
    (a) => a.field.ref === fieldKey || a.field.id === fieldKey,
  );
  return match ? answerValue(match) : null;
}

// Pull new responses for one form source, create+qualify leads for each one not
// already ingested, and advance the source cursor. Idempotent: deduped by token.
export async function syncFormSource(
  source: MarketingFormSource,
): Promise<SyncResult> {
  const mapping = source.fieldMapping as FormFieldMapping;
  const sinceParam = source.lastResponseToken
    ? `&since=${encodeURIComponent(source.lastResponseToken)}`
    : "";

  // Page through ALL new responses, not just the first page. Typeform returns
  // responses newest-first; we walk older pages via the `before` token cursor
  // until a short page. The cursor (`since`, a submitted_at timestamp) is only
  // advanced after every page is processed, so a form with >1 page of new
  // submissions never has its cursor skipped past un-ingested responses.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 50;
  const items: RawResponse[] = [];
  let before = "";
  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum += 1) {
    const page = await tf<RawResponsesPage>(
      `/forms/${encodeURIComponent(source.formId)}/responses?page_size=${PAGE_SIZE}&completed=true${sinceParam}${before}`,
    );
    const pageItems = page.items ?? [];
    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) break;
    before = `&before=${encodeURIComponent(pageItems[pageItems.length - 1].token)}`;
  }

  let ingested = 0;
  let skipped = 0;
  let newestSubmittedAt = source.lastResponseToken;

  for (const resp of items) {
    if (
      newestSubmittedAt == null ||
      new Date(resp.submitted_at) > new Date(newestSubmittedAt)
    ) {
      newestSubmittedAt = resp.submitted_at;
    }

    // Dedup: skip a response we have already turned into a lead.
    const [existing] = await db
      .select({ id: marketingLeadsTable.id })
      .from(marketingLeadsTable)
      .where(
        and(
          eq(marketingLeadsTable.tenant, MARKETING_TENANT),
          eq(marketingLeadsTable.externalSource, "typeform"),
          eq(marketingLeadsTable.externalId, resp.token),
        ),
      );
    if (existing) {
      skipped += 1;
      continue;
    }

    const answers = resp.answers ?? [];
    const email = mappedValue(answers, mapping.email);
    if (!email) {
      // Email is required to create a lead; a response without it is unusable.
      skipped += 1;
      continue;
    }

    try {
      const lead = await captureLead({
        email,
        name: mappedValue(answers, mapping.name),
        company: mappedValue(answers, mapping.company),
        message: mappedValue(answers, mapping.message),
        source: "typeform",
        externalSource: "typeform",
        externalId: resp.token,
      });
      qualifyInBackground(lead.id);
      ingested += 1;
    } catch (err) {
      // The (tenant, external_source, external_id) unique index is the backstop
      // against a race between an overlapping manual sync and the poller: the
      // SELECT above can miss a row another sync is inserting concurrently. A
      // unique violation here means the lead already exists, so treat it as a
      // skip rather than failing the whole sync.
      if (isUniqueViolation(err)) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  await db
    .update(marketingFormSourcesTable)
    .set({
      lastResponseToken: newestSubmittedAt ?? null,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingFormSourcesTable.tenant, MARKETING_TENANT),
        eq(marketingFormSourcesTable.id, source.id),
      ),
    );

  if (ingested > 0) {
    await logMarketingActivity(
      "leads_synced",
      `Synced ${ingested} new lead${ingested === 1 ? "" : "s"} from Typeform form "${source.formTitle ?? source.formId}"`,
      null,
    );
  }

  return { formId: source.formId, ingested, skipped, total: items.length };
}

// Sync every enabled source for the tenant. Used by the poller and "Sync all".
export async function syncAllEnabledSources(): Promise<SyncResult[]> {
  const sources = await db
    .select()
    .from(marketingFormSourcesTable)
    .where(
      and(
        eq(marketingFormSourcesTable.tenant, MARKETING_TENANT),
        eq(marketingFormSourcesTable.enabled, true),
      ),
    );
  const results: SyncResult[] = [];
  for (const source of sources) {
    try {
      results.push(await syncFormSource(source));
    } catch (err) {
      logger.error({ err, formId: source.formId }, "Typeform source sync failed");
    }
  }
  return results;
}

let pollerStarted = false;

// Start a lightweight background poller that periodically pulls new submissions.
// Guarded so it only starts once. Disabled in tests and when explicitly turned
// off via MARKETING_TYPEFORM_POLL_MS=0.
export function startTypeformPoller(): void {
  if (pollerStarted) return;
  if (process.env.NODE_ENV === "test") return;
  const intervalMs = Number(process.env.MARKETING_TYPEFORM_POLL_MS ?? 300000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  pollerStarted = true;
  const tick = () => {
    syncAllEnabledSources().catch((err) =>
      logger.error({ err }, "Typeform poller tick failed"),
    );
  };
  const timer = setInterval(tick, intervalMs);
  // Do not keep the process alive solely for polling.
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs }, "Typeform lead poller started");
}
