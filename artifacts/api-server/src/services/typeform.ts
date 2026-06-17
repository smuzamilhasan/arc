// Typeform lead connector (one-way: pull form submissions in as leads).
// Uses the Typeform REST API directly via TYPEFORM_API_TOKEN (a Personal Access
// Token issued from admin.typeform.com → Settings → Personal tokens).
// Every read/write is scoped to MARKETING_TENANT, consistent with the rest of
// Marketing OS. Submissions are deduped by their Typeform response token so a
// re-sync never creates the same lead twice.
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  db,
  marketingFormSourcesTable,
  marketingLeadsTable,
  type MarketingFormSource,
  type FormFieldMapping,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { appOrigin } from "./inviteEmail";
import { MARKETING_TENANT } from "./marketing";
import { captureLead, qualifyInBackground, logMarketingActivity } from "./marketingData";

const TYPEFORM_BASE_URL = "https://api.typeform.com";

// Returns the Typeform Personal Access Token from env, or throws if unset.
function getTypeformToken(): string {
  const token = process.env.TYPEFORM_API_TOKEN?.trim();
  if (!token)
    throw new Error(
      "TYPEFORM_API_TOKEN is not set — generate a Personal Access Token at admin.typeform.com → Settings → Personal tokens",
    );
  return token;
}

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
  const res = await fetch(`${TYPEFORM_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${getTypeformToken()}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Typeform API ${res.status} for ${path}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// POST a JSON body to the Typeform API.
// Used by the provisioning engine to CREATE config (e.g. an intake form) inside
// the connected account — the only write path Marketing OS has into Typeform.
async function tfPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${TYPEFORM_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${getTypeformToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Typeform API ${res.status} for ${path}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface CreatedTypeformForm {
  id: string;
  url: string;
}

// Create a new Typeform form from a provisioning plan. `fields` are already in
// Typeform's create shape. Returns the new form id and its public link.
export async function createTypeformForm(
  title: string,
  fields: Array<{ title: string; ref: string; type: string; validations?: { required?: boolean } }>,
): Promise<CreatedTypeformForm> {
  const created = await tfPost<{ id: string; _links?: { display?: string } }>(
    "/forms",
    { title, fields },
  );
  return {
    id: created.id,
    url: created._links?.display ?? `https://form.typeform.com/to/${created.id}`,
  };
}

// A write (PUT/DELETE) to the Typeform API. A 404 is tolerated so
// removing a webhook that no longer exists is idempotent.
async function tfWrite(
  path: string,
  method: "PUT" | "DELETE",
  body?: unknown,
): Promise<void> {
  const res = await fetch(`${TYPEFORM_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getTypeformToken()}`,
      ...(body != null ? { "content-type": "application/json" } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Typeform API ${res.status} for ${path}: ${detail.slice(0, 300)}`);
  }
}

// True when a Typeform connection is authorized and reachable.
export async function getTypeformStatus(): Promise<{ connected: boolean }> {
  if (!process.env.TYPEFORM_API_TOKEN?.trim()) return { connected: false };
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

// Turn a single Typeform response into a captured + auto-qualified lead, scoped
// to the given source's tenant and field mapping. Returns whether a new lead was
// created. Deduped by the response token (both a pre-check and the DB unique
// index backstop), so the SAME response delivered by both the webhook and the
// poller is ingested exactly once. Shared by the poller/manual sync and the
// inbound webhook so both intake paths behave identically.
async function ingestResponse(
  source: MarketingFormSource,
  resp: RawResponse,
): Promise<"ingested" | "skipped"> {
  const mapping = source.fieldMapping as FormFieldMapping;

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
  if (existing) return "skipped";

  const answers = resp.answers ?? [];
  const email = mappedValue(answers, mapping.email);
  if (!email) {
    // Email is required to create a lead; a response without it is unusable.
    return "skipped";
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
    return "ingested";
  } catch (err) {
    // The (tenant, external_source, external_id) unique index is the backstop
    // against a race between concurrent ingests (e.g. the webhook and an
    // overlapping poller run): the SELECT above can miss a row another path is
    // inserting concurrently. A unique violation means the lead already exists,
    // so treat it as a skip rather than failing.
    if (isUniqueViolation(err)) return "skipped";
    throw err;
  }
}

// Pull new responses for one form source, create+qualify leads for each one not
// already ingested, and advance the source cursor. Idempotent: deduped by token.
export async function syncFormSource(
  source: MarketingFormSource,
): Promise<SyncResult> {
  const sinceParam = source.lastResponseToken
    ? `&since=${encodeURIComponent(source.lastResponseToken)}`
    : "";

  // Page through ALL new responses, not just the first page. Typeform returns
  // responses newest-first; we walk older pages via the `before` token cursor
  // until a short page. The cursor (`since`, a submitted_at timestamp) is only
  // advanced after every page is processed, so a form with >1 page of new
  // submissions never has its cursor skipped past un-ingested responses.
  // Typeform caps page_size at 1000. Overridable (clamped) via env so the
  // multi-page pagination path can be exercised in tests with a tiny dataset;
  // production always uses the full 1000, mirroring MARKETING_TYPEFORM_POLL_MS.
  const requestedPageSize = Number(process.env.MARKETING_TYPEFORM_PAGE_SIZE ?? 1000);
  const PAGE_SIZE =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 1000)
      : 1000;
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

    const outcome = await ingestResponse(source, resp);
    if (outcome === "ingested") ingested += 1;
    else skipped += 1;
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

// --- Webhooks (near-instant lead capture) ---
//
// Typeform fires an outbound webhook the instant a form is submitted, which
// removes most polling lag. We register one webhook per form (a stable per-tenant
// tag) pointing at our public intake route, signed with a shared secret so the
// payload can be verified as genuinely from Typeform. The poller stays on as a
// catch-up/backfill safety net; dedup by response token makes a response
// delivered by BOTH paths ingest exactly once.

// Stable webhook tag per tenant. Typeform identifies a form's webhook by this
// tag, so reusing it makes register idempotent (PUT upserts) and remove targeted.
const WEBHOOK_TAG = `arc-marketing-${MARKETING_TENANT}`;

// The shared secret Typeform signs delivered payloads with. Prefer a dedicated
// env, fall back to the generic marketing webhook secret so a single configured
// value enables both. Null when neither is set (fail-closed: no registration,
// no verification — the poller still covers ingestion).
export function getTypeformWebhookSecret(): string | null {
  return (
    process.env.MARKETING_TYPEFORM_WEBHOOK_SECRET?.trim() ||
    process.env.MARKETING_WEBHOOK_SECRET?.trim() ||
    null
  );
}

// Public URL Typeform should POST submissions to. Routed through the shared proxy
// to the api-server, mounted before auth in routes/index.ts.
function typeformWebhookUrl(): string {
  return `${appOrigin()}/api/marketing/intake/typeform/webhook`;
}

// Verify a delivered payload is genuinely from Typeform: HMAC-SHA256 of the RAW
// request body keyed by our shared secret, base64-encoded, prefixed `sha256=`.
// Compared in constant time. Requires the exact bytes Typeform sent, so the
// route must hand us the raw body (not the re-serialized parsed JSON).
export function verifyTypeformSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (rawBody == null || !signatureHeader) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Outcome of a webhook registration attempt, mirrored onto the form source so
// the UI can show whether a form captures instantly or only via polling:
//   "registered" → the webhook is live (instant capture)
//   "failed"     → registration was attempted but the API call failed (retry)
//   "none"       → no webhook was registered (no secret configured) → polling
export type WebhookStatus = "registered" | "failed" | "none";

// Register (or update) the Typeform webhook for one form so submissions are
// pushed to us instantly. Best-effort: a failure is logged and swallowed so it
// never blocks saving the form source — the poller still ingests as a fallback.
// Returns the resulting webhook status so the caller can persist whether the
// form is actually wired for instant capture (not just that an attempt was made).
export async function registerFormWebhook(formId: string): Promise<WebhookStatus> {
  const secret = getTypeformWebhookSecret();
  if (!secret) {
    logger.warn(
      { formId },
      "Typeform webhook secret not configured; skipping webhook registration (poller will still ingest)",
    );
    return "none";
  }
  try {
    await tfWrite(
      `/forms/${encodeURIComponent(formId)}/webhooks/${encodeURIComponent(WEBHOOK_TAG)}`,
      "PUT",
      {
        url: typeformWebhookUrl(),
        enabled: true,
        secret,
        verify_ssl: true,
      },
    );
    logger.info({ formId }, "Registered Typeform webhook");
    return "registered";
  } catch (err) {
    logger.error({ err, formId }, "Failed to register Typeform webhook");
    return "failed";
  }
}

// Remove the Typeform webhook for one form. Best-effort and idempotent (a 404 is
// tolerated). Logged but never thrown so it cannot block deleting a form source.
export async function removeFormWebhook(formId: string): Promise<boolean> {
  const secret = getTypeformWebhookSecret();
  // No secret means we never registered one; nothing to remove.
  if (!secret) return false;
  try {
    await tfWrite(
      `/forms/${encodeURIComponent(formId)}/webhooks/${encodeURIComponent(WEBHOOK_TAG)}`,
      "DELETE",
    );
    logger.info({ formId }, "Removed Typeform webhook");
    return true;
  } catch (err) {
    logger.error({ err, formId }, "Failed to remove Typeform webhook");
    return false;
  }
}

// The slice of a Typeform webhook payload we read.
interface WebhookPayload {
  event_type?: string;
  form_response?: {
    form_id?: string;
    token?: string;
    submitted_at?: string;
    answers?: RawAnswer[];
  };
}

export type WebhookIngestOutcome = "ingested" | "skipped" | "no_source";

// Ingest a single response delivered by the Typeform webhook. Resolves the
// matching enabled form source (by tenant + formId) and reuses the shared
// ingest+qualify+dedup spine. Returns `no_source` when no enabled source is
// configured for the form so the route can answer 202 without creating a lead.
// Note: this deliberately does NOT advance the source cursor — the poller will
// re-fetch recent responses and dedup by token, so the cursor stays owned by
// the poller and a webhook can never skip the cursor past un-ingested rows.
export async function ingestTypeformWebhook(
  payload: unknown,
): Promise<WebhookIngestOutcome> {
  const fr = (payload as WebhookPayload)?.form_response;
  if (!fr || typeof fr.form_id !== "string" || typeof fr.token !== "string") {
    return "skipped";
  }

  const [source] = await db
    .select()
    .from(marketingFormSourcesTable)
    .where(
      and(
        eq(marketingFormSourcesTable.tenant, MARKETING_TENANT),
        eq(marketingFormSourcesTable.provider, "typeform"),
        eq(marketingFormSourcesTable.formId, fr.form_id),
        eq(marketingFormSourcesTable.enabled, true),
      ),
    );
  if (!source) return "no_source";

  return ingestResponse(source, {
    token: fr.token,
    submitted_at: fr.submitted_at ?? new Date().toISOString(),
    answers: fr.answers ?? [],
  });
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
