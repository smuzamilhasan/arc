// /app/calibrate — the calibration page.
//
// Two-input workflow (paste handle OR upload JSON) → run v2 VoiceExtractor →
// review the extracted features → "Save to profile" applies the patch.
//
// The whole point of this page is that the engine output is no longer a
// black box. You see exactly what would land in your profile before you
// commit it.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles,
  AlertTriangle,
  FileJson,
  Link2,
  Quote,
  BookOpen,
  Mic,
  Lightbulb,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";
import { usePersistentRun, useUnloadGuard } from "@/lib/persistent-run";
import { toast } from "sonner";

// ---------- Types matching the backend response ----------

type EvidenceRef =
  | { kind: "voice_sample"; sample_id: number }
  | { kind: "story_bank"; story_id: number }
  | { kind: "reference_library"; reference_id: number }
  | { kind: "external"; url: string; quote?: string }
  | { kind: "profile_slot"; layer: string; field: string };

type ProfilePatchOp =
  | { op: "voice_patch"; rationale: string; patch: VoicePatchShape }
  | {
      op: "worldview_patch";
      rationale: string;
      patch: { beliefs: WorldviewBelief[] };
    }
  | {
      op: "story_append";
      summary: string;
      body: string;
      themes: string[];
      source_sample_ids: number[];
      status: "candidate" | "confirmed";
    }
  | {
      op: "reference_append";
      kind: string;
      label: string;
      context: string;
      source_sample_ids: number[];
      status: "candidate" | "confirmed";
    }
  | { op: string; [key: string]: unknown };

type VoicePatchShape = {
  sentence_stats?: {
    avg_len: number;
    p90_len: number;
    declarative_ratio: number;
    question_ratio: number;
  };
  lexicon?: { signature_words: string[]; avoided_words: string[] };
  punctuation?: {
    em_dash_density: number;
    colon_use: number;
    ellipsis_use: number;
    exclamation_density: number;
  };
  signature_moves?: Array<{ pattern: string; frequency: number }>;
  formality?: number;
  description?: string;
  confidence?: number;
  sample_count?: number;
};

type WorldviewBelief = {
  claim: string;
  why_held: string;
  where_it_shows_up: string[];
  confidence: number;
  evidence_sample_ids: number[];
};

type ProfilePatch = {
  client_id: number;
  ops: ProfilePatchOp[];
  confidence: number;
  produced_by: string;
};

type ExtractorOutput = {
  refuses: false;
  profile_patch: ProfilePatch;
  sample_count: number;
  confidence: number;
};

type PreviewResult =
  | { kind: "ok"; sample_count: number; dropped: number; extractor: ExtractorOutput; usedCache?: boolean; cachedSampleCount?: number }
  | { kind: "refused"; reason: string; usedCache?: boolean; cachedSampleCount?: number }
  | { kind: "error"; error: string };

// ---------- Page ----------

export default function CalibratePage() {
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState<"linkedin" | "x" | "youtube_transcript">("linkedin");
  const [jsonText, setJsonText] = useState("");
  const [applying, setApplying] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [forceRefetch, setForceRefetch] = useState(false);

  // Run state lives in a module-level store so it SURVIVES in-app navigation —
  // leave the page mid-extraction and the result is still here when you return.
  const calRun = usePersistentRun<PreviewResult>("calibration");
  useUnloadGuard();
  const loading = calRun.status === "running";
  const preview = calRun.data;
  const error = validationError ?? calRun.error;
  const setError = setValidationError;

  async function fetchJson<T>(url: string, body: unknown): Promise<T> {
    const clientId = getActiveClientId();
    const res = await fetch(`${import.meta.env.BASE_URL}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `request failed: ${res.status}`);
    }
    return data;
  }

  function runFromHandle() {
    if (!handle.trim()) {
      setError("Paste a LinkedIn handle or URL.");
      return;
    }
    setError(null);
    // start() persists status+result in the module store; navigating away no
    // longer cancels the run or loses the result.
    void calRun.start(
      fetchJson<PreviewResult>("api/v2/calibration/preview-from-handle", {
        source,
        handle: handle.trim(),
        // YouTube fans out across videos (≈30); LinkedIn/X capped at 50 posts.
        maxItems: source === "youtube_transcript" ? 30 : 50,
        force: forceRefetch,
      })
    );
  }

  function runFromJson() {
    if (!jsonText.trim()) {
      setError("Paste the JSON array from your Apify export.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("That's not valid JSON. Open the dataset file, copy the full array.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("Expected a JSON array. Apify exports the dataset as an array at the top level.");
      return;
    }
    setError(null);
    void calRun.start(
      fetchJson<PreviewResult>("api/v2/calibration/preview-from-json", {
        source,
        rawItems: parsed,
      })
    );
  }

  async function applyPatch() {
    if (!preview || preview.kind !== "ok") return;
    setApplying(true);
    try {
      await fetchJson<{ status: string }>(
        "api/v2/calibration/apply",
        { patch: preview.extractor.profile_patch }
      );
      toast.success("Profile updated. The extracted features are now in your operating profile.");
      calRun.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Calibrate your voice</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Pull your public writing and see what the engine extracts — signature words,
          recurring themes, stories worth redeploying, worldview beliefs. Review the
          output before it lands in your profile.
        </p>
      </div>

      {/* Input ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
          <CardDescription>
            Start with your LinkedIn — that's your highest-signal voice corpus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="handle">
            <TabsList>
              <TabsTrigger value="handle">
                <Link2 className="w-4 h-4 mr-2" />
                From handle
              </TabsTrigger>
              <TabsTrigger value="json">
                <FileJson className="w-4 h-4 mr-2" />
                Upload JSON
              </TabsTrigger>
            </TabsList>

            <TabsContent value="handle" className="space-y-4 mt-6">
              {/* Source picker */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground mr-1">Source:</span>
                {([
                  { v: "linkedin", label: "LinkedIn" },
                  { v: "youtube_transcript", label: "YouTube" },
                  { v: "x", label: "X / Twitter" },
                ] as const).map((s) => (
                  <button
                    key={s.v}
                    onClick={() => setSource(s.v)}
                    disabled={loading || applying}
                    className={
                      "px-3 py-1 rounded-full text-sm border transition-colors " +
                      (source === s.v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input hover:bg-accent")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {source === "youtube_transcript"
                    ? "YouTube channel URL"
                    : source === "x"
                    ? "X handle or URL"
                    : "LinkedIn handle or URL"}
                </label>
                <Input
                  placeholder={
                    source === "youtube_transcript"
                      ? "https://www.youtube.com/@channelname"
                      : source === "x"
                      ? "username or https://x.com/username"
                      : "muzamilhasan or https://linkedin.com/in/muzamilhasan"
                  }
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  disabled={loading || applying}
                />
                <p className="text-xs text-muted-foreground">
                  {source === "youtube_transcript"
                    ? "We pull the last ~30 videos, transcribe each (captions, with a speech-to-text fallback), and extract your voice. Works for non-English channels. This takes a few minutes."
                    : "We pull your last ~50 posts, drop reposts, run the voice extractor. Takes 30-60 seconds."}
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={forceRefetch}
                    onChange={(e) => setForceRefetch(e.target.checked)}
                    disabled={loading || applying}
                    className="accent-primary"
                  />
                  Re-fetch fresh from source (uses credits). Leave off to re-use already-saved
                  content for free.
                </label>
              </div>
              <Button onClick={runFromHandle} disabled={loading || applying}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Run extraction
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="json" className="space-y-4 mt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Apify dataset JSON</label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder='[{ "type": "post", "content": "..." }, ...]'
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  disabled={loading || applying}
                />
                <p className="text-xs text-muted-foreground">
                  Paste the full array from your Apify export. Skips the live API
                  call — useful for offline iteration.
                </p>
              </div>
              <Button onClick={runFromJson} disabled={loading || applying}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Run extraction
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Status ---------- */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not run</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && <LoadingState />}

      {preview && preview.kind === "refused" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Extractor refused</AlertTitle>
          <AlertDescription>{preview.reason}</AlertDescription>
        </Alert>
      )}

      {preview && preview.kind === "error" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pipeline error</AlertTitle>
          <AlertDescription>{preview.error}</AlertDescription>
        </Alert>
      )}

      {/* Results ---------- */}
      {preview && preview.kind === "ok" && (
        <PreviewView preview={preview} onApply={applyPatch} applying={applying} />
      )}
    </div>
  );
}

// ---------- Loading skeleton ----------

function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Reading your voice…
        </CardTitle>
        <CardDescription>
          5 passes: sentence stats + lexicon + punctuation, then 4 LLM passes for
          signature moves, stories, references, and worldview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

// ---------- Results dashboard ----------

function PreviewView({
  preview,
  onApply,
  applying,
}: {
  preview: { kind: "ok"; sample_count: number; dropped: number; extractor: ExtractorOutput; usedCache?: boolean; cachedSampleCount?: number };
  onApply: () => void;
  applying: boolean;
}) {
  const ops = preview.extractor.profile_patch.ops;
  const voiceOp = ops.find((o) => o.op === "voice_patch") as
    | { op: "voice_patch"; patch: VoicePatchShape; rationale: string }
    | undefined;
  const worldviewOp = ops.find((o) => o.op === "worldview_patch") as
    | { op: "worldview_patch"; patch: { beliefs: WorldviewBelief[] } }
    | undefined;
  const stories = ops.filter((o) => o.op === "story_append") as Array<{
    op: "story_append";
    summary: string;
    body: string;
    themes: string[];
    source_sample_ids: number[];
  }>;
  const refs = ops.filter((o) => o.op === "reference_append") as Array<{
    op: "reference_append";
    kind: string;
    label: string;
    context: string;
    source_sample_ids: number[];
  }>;

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wider text-primary font-medium">
                Extraction complete
              </p>
              <p className="mt-1 text-lg">
                <strong>{preview.sample_count}</strong> samples analyzed
                {preview.dropped > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {preview.dropped} dropped (reposts + short)
                  </span>
                )}
              </p>
              {preview.usedCache && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Re-used your {preview.cachedSampleCount ?? preview.sample_count} already-saved
                  samples — no fetch, no credits spent. Tick “Re-fetch fresh” to pull new content.
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Aggregate confidence:{" "}
                <strong>{(preview.extractor.confidence * 100).toFixed(0)}%</strong>
              </p>
            </div>
            <Button onClick={onApply} disabled={applying} size="lg">
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save to profile
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Voice card */}
      {voiceOp && <VoiceCard patch={voiceOp.patch} />}

      {/* Worldview card */}
      {worldviewOp && worldviewOp.patch.beliefs.length > 0 && (
        <WorldviewCard beliefs={worldviewOp.patch.beliefs} />
      )}

      {/* Stories grid */}
      {stories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Story bank candidates ({stories.length})
            </CardTitle>
            <CardDescription>
              Anecdotes the engine spotted in your writing. The Ghostwriter can
              anchor future drafts to these — and they're far more specific than
              the user invented from scratch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stories.map((s, i) => (
              <div key={i} className="border-l-2 border-primary/40 pl-4">
                <p className="font-medium">{s.summary}</p>
                {s.themes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.themes.map((t) => (
                      <Badge variant="secondary" key={t} className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Cites samples: {s.source_sample_ids.join(", ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* References grid */}
      {refs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Quote className="w-5 h-5" />
              Reference library ({refs.length})
            </CardTitle>
            <CardDescription>
              People, books, frameworks, and concepts you cite. Weaving these in
              sparingly makes drafts sound recognizably like you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {refs.map((r, i) => (
                <div key={i} className="border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {r.kind}
                    </Badge>
                    <span className="font-medium">{r.label}</span>
                  </div>
                  {r.context && (
                    <p className="text-xs text-muted-foreground mt-1">{r.context}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground pt-2">
        Nothing has been saved yet. Click <strong>Save to profile</strong> above to apply.
      </div>
    </div>
  );
}

function VoiceCard({ patch }: { patch: VoicePatchShape }) {
  const ss = patch.sentence_stats;
  const punc = patch.punctuation;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Voice features
        </CardTitle>
        <CardDescription>
          {patch.description ??
            "Structured features extracted from your samples — used by the Ghostwriter as voice evidence."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats grid */}
        {ss && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Sentence rhythm
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="avg length" value={`${ss.avg_len.toFixed(1)} words`} />
              <Stat label="p90 length" value={`${ss.p90_len.toFixed(0)} words`} />
              <Stat
                label="declarative"
                value={`${(ss.declarative_ratio * 100).toFixed(0)}%`}
              />
              <Stat label="question" value={`${(ss.question_ratio * 100).toFixed(0)}%`} />
            </div>
          </div>
        )}

        {/* Signature words */}
        {patch.lexicon && patch.lexicon.signature_words.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Signature words
            </h4>
            <div className="flex flex-wrap gap-2">
              {patch.lexicon.signature_words.slice(0, 25).map((w) => (
                <Badge key={w} variant="secondary">
                  {w}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Signature moves */}
        {patch.signature_moves && patch.signature_moves.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Signature moves
            </h4>
            <ul className="space-y-1">
              {patch.signature_moves.map((m, i) => (
                <li key={i} className="text-sm flex items-center justify-between">
                  <span>{m.pattern}</span>
                  <span className="text-xs text-muted-foreground">
                    {(m.frequency * 100).toFixed(0)}% of posts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Punctuation */}
        {punc && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Punctuation signature (per 1000 words)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="em-dashes"
                value={(punc.em_dash_density * 1000).toFixed(1)}
              />
              <Stat label="colons" value={(punc.colon_use * 1000).toFixed(1)} />
              <Stat label="ellipses" value={(punc.ellipsis_use * 1000).toFixed(1)} />
              <Stat
                label="exclamations"
                value={(punc.exclamation_density * 1000).toFixed(1)}
              />
            </div>
          </div>
        )}

        {/* Confidence */}
        {typeof patch.confidence === "number" && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Confidence
            </h4>
            <p className="text-sm">
              <strong>{(patch.confidence * 100).toFixed(0)}%</strong> across{" "}
              {patch.sample_count ?? 0} samples
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorldviewCard({ beliefs }: { beliefs: WorldviewBelief[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5" />
          Worldview hypotheses ({beliefs.length})
        </CardTitle>
        <CardDescription>
          Non-negotiable beliefs the engine spotted recurring across your writing. The
          Strategist uses these as alignment anchors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {beliefs.map((b, i) => (
          <div key={i} className="border-l-2 border-primary/40 pl-4">
            <p className="font-medium">"{b.claim}"</p>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Why:</strong> {b.why_held}
            </p>
            {b.where_it_shows_up.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {b.where_it_shows_up.map((w) => (
                  <Badge variant="outline" key={w} className="text-xs">
                    {w}
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Confidence: {(b.confidence * 100).toFixed(0)}% · Evidence samples:{" "}
              {b.evidence_sample_ids.join(", ")}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-medium">{value}</p>
    </div>
  );
}
