// Apify client wrapper — typed actor invocation + run polling + cost tracking.
//
// We intentionally avoid the `apify-client` SDK at this layer: actors come and
// go, schemas drift, and a thin typed wrapper lets us swap actors per source
// without churning the call sites. Each source (LinkedIn, X, YouTube) has its
// own actor configuration in `./actors.ts`; this client only knows how to
// dispatch a run and collect its dataset.
//
// Env: APIFY_TOKEN (required). Surface a clear error if missing — we never
// silently no-op an ingest.

export class ApifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyConfigError";
  }
}

export class ApifyRunError extends Error {
  constructor(
    message: string,
    public runId?: string,
    public actorId?: string
  ) {
    super(message);
    this.name = "ApifyRunError";
  }
}

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | "ABORTING"
  | "ABORTED";

export type ApifyRunSummary = {
  id: string;
  actorId: string;
  status: ApifyRunStatus;
  startedAt: string;
  finishedAt?: string;
  defaultDatasetId: string;
  /** USD cost reported by Apify; 0 if not yet finalized. */
  usageUsd: number;
};

export type ApifyRunOptions = {
  /** Hard ceiling — abort run if it exceeds this. Foundation: client-side check. */
  maxCostUsd?: number;
  /** Polling interval ms. Defaults to 5s. */
  pollIntervalMs?: number;
  /** Maximum total wait time ms. Defaults to 10 minutes. */
  timeoutMs?: number;
  /** Trace id propagated into ingest_runs. */
  traceId?: string;
};

const DEFAULT_OPTIONS: Required<Omit<ApifyRunOptions, "traceId" | "maxCostUsd">> = {
  pollIntervalMs: 5000,
  timeoutMs: 10 * 60 * 1000,
};

const APIFY_BASE = "https://api.apify.com/v2";

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new ApifyConfigError(
      "APIFY_TOKEN is not set. Set it in Railway env (and locally in .env) before running ingest."
    );
  }
  return token;
}

/**
 * Dispatch an Apify actor with the given input and wait for it to finish.
 * Returns the run summary; the caller pulls items from the dataset via
 * `getDatasetItems`.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  options: ApifyRunOptions = {}
): Promise<ApifyRunSummary> {
  const token = getToken();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Start the run.
  const startRes = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new ApifyRunError(`Failed to start Apify actor ${actorId}: ${startRes.status} ${text}`, undefined, actorId);
  }
  const startBody = (await startRes.json()) as { data?: { id?: string; defaultDatasetId?: string; status?: ApifyRunStatus; startedAt?: string } };
  const runId = startBody.data?.id;
  const defaultDatasetId = startBody.data?.defaultDatasetId;
  if (!runId || !defaultDatasetId) {
    throw new ApifyRunError(`Apify returned malformed run response for actor ${actorId}`, undefined, actorId);
  }

  // 2. Poll until terminal state.
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > opts.timeoutMs) {
      await abortRun(runId, token).catch(() => {});
      throw new ApifyRunError(`Apify run ${runId} timed out after ${opts.timeoutMs}ms`, runId, actorId);
    }

    await sleep(opts.pollIntervalMs);

    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!statusRes.ok) {
      // Transient error — continue polling unless we've blown the timeout.
      continue;
    }
    const statusBody = (await statusRes.json()) as { data?: { status?: ApifyRunStatus; finishedAt?: string; usage?: { totalUsageUsd?: number }; startedAt?: string } };
    const data = statusBody.data;
    if (!data) continue;

    const usageUsd = data.usage?.totalUsageUsd ?? 0;

    // Client-side cost check (defensive; Apify also enforces account limits).
    if (options.maxCostUsd !== undefined && usageUsd > options.maxCostUsd) {
      await abortRun(runId, token).catch(() => {});
      throw new ApifyRunError(
        `Apify run ${runId} exceeded maxCostUsd (${usageUsd} > ${options.maxCostUsd})`,
        runId,
        actorId
      );
    }

    if (isTerminal(data.status)) {
      if (data.status !== "SUCCEEDED") {
        throw new ApifyRunError(`Apify run ${runId} ended with status ${data.status}`, runId, actorId);
      }
      return {
        id: runId,
        actorId,
        status: data.status,
        startedAt: data.startedAt ?? new Date(startedAt).toISOString(),
        finishedAt: data.finishedAt,
        defaultDatasetId,
        usageUsd,
      };
    }
  }
}

/**
 * Stream-fetch all items from a dataset. Apify supports offset/limit; we
 * paginate so a chatty actor doesn't OOM us on a single GET.
 */
export async function getDatasetItems<T = unknown>(datasetId: string, pageSize = 200): Promise<T[]> {
  const token = getToken();
  const items: T[] = [];
  let offset = 0;

  while (true) {
    const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ApifyRunError(`Failed to fetch dataset items: ${res.status}`);
    }
    const batch = (await res.json()) as T[];
    items.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return items;
}

async function abortRun(runId: string, token: string): Promise<void> {
  await fetch(`${APIFY_BASE}/actor-runs/${runId}/abort?token=${token}`, { method: "POST" });
}

function isTerminal(status: ApifyRunStatus | undefined): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
