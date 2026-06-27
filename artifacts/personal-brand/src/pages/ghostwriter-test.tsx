// /app/ghostwriter-test — try the v2 Ghostwriter against your saved profile.
//
// This is the payoff surface: type a brief, pick a platform, and see a draft
// written in your voice — with the voice evidence it cited (which real samples,
// which story, which references) shown alongside so you can see WHY it sounds
// like you.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, Loader2, Quote, BookOpen, FileText, Copy, Check, CalendarPlus } from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";
import { usePersistentRun, useUnloadGuard } from "@/lib/persistent-run";
import { WorkingIndicator, WORK_MESSAGES } from "@/components/working-indicator";

type EvidenceRef =
  | { kind: "voice_sample"; sample_id: number }
  | { kind: "story_bank"; story_id: number }
  | { kind: "reference_library"; reference_id: number }
  | { kind: "external"; url: string; quote?: string };

type ContentDraft = {
  refuses: false;
  platform: string;
  body: string;
  voice_evidence: {
    style_anchors: EvidenceRef[];
    story_anchor?: EvidenceRef;
    reference_anchors: EvidenceRef[];
  };
  honors_negative_space: boolean;
  confidence: number;
};

type DraftResponse =
  | { status: "ok"; draft: ContentDraft; tokens_used?: number; latency_ms?: number }
  | { status: "refused"; reason: string }
  | { status: "violation"; details: string }
  | { error: string };

const PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "newsletter", label: "Newsletter" },
  { value: "blog", label: "Blog" },
] as const;

export default function GhostwriterTestPage() {
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<string>("linkedin");
  // The draft runs through the persistent store, so navigating to another page
  // mid-draft keeps it alive and the result is waiting when you come back.
  const draftRun = usePersistentRun<DraftResponse>("ghostwriter-draft");
  useUnloadGuard();
  const loading = draftRun.status === "running";
  const result = draftRun.data;
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? draftRun.error;
  const [copied, setCopied] = useState(false);

  function runDraft() {
    if (!brief.trim()) {
      setError("Type a brief — a topic, angle, or instruction for the draft.");
      return;
    }
    setError(null);
    setSaved(null);
    const clientId = getActiveClientId();
    draftRun.start(
      fetch(`${import.meta.env.BASE_URL}api/v2/ghostwriter/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}),
        },
        body: JSON.stringify({ brief: brief.trim(), platform, format: "post" }),
      }).then((res) => res.json() as Promise<DraftResponse>)
    );
  }

  function copyBody() {
    if (result && "status" in result && result.status === "ok") {
      navigator.clipboard.writeText(result.draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: number } | null>(null);

  async function saveToContent() {
    if (!(result && "status" in result && result.status === "ok")) return;
    setSaving(true);
    try {
      const clientId = getActiveClientId();
      const res = await fetch(`${import.meta.env.BASE_URL}api/v2/ghostwriter/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}),
        },
        body: JSON.stringify({ body: result.draft.body, platform: result.draft.platform }),
      });
      const data = (await res.json()) as { status?: string; post?: { id: number }; error?: string };
      if (data.status === "ok" && data.post) setSaved({ id: data.post.id });
      else setError(data.error ?? "save failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Test the ghostwriter</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Give it a brief. It drafts in your voice — using the real posts, stories, and
          beliefs from your calibrated profile. The evidence it cited is shown so you can
          see why it sounds like you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brief</CardTitle>
          <CardDescription>A topic, angle, or instruction. Be as loose or specific as you like.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g. Why building in silence beats posting for the algorithm"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={loading}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Platform:</span>
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPlatform(p.value)}
                disabled={loading}
                className={
                  "px-3 py-1 rounded-full text-sm border transition-colors " +
                  (platform === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-accent")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button onClick={runDraft} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Drafting in your voice…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Draft it
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {shownError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not draft</AlertTitle>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      )}

      {loading && <WorkingIndicator messages={WORK_MESSAGES.draft} />}

      {result && "error" in result && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result && "status" in result && result.status === "refused" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>The ghostwriter refused</AlertTitle>
          <AlertDescription>
            {result.reason}
            <p className="mt-2 text-xs">
              This is a feature — it refuses rather than produce generic output when signal is
              thin. Calibrate more samples or sharpen the brief.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {result && "status" in result && result.status === "violation" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Draft rejected by its own guardrails</AlertTitle>
          <AlertDescription>
            {result.details}
            <p className="mt-2 text-xs">
              The draft violated a hard constraint (banned word, missing citation, length) even
              after retries. Try a different brief.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {result && "status" in result && result.status === "ok" && (
        <DraftView
          draft={result.draft}
          latencyMs={result.latency_ms}
          onCopy={copyBody}
          copied={copied}
          onSave={saveToContent}
          saving={saving}
          saved={saved}
        />
      )}
    </div>
  );
}

function DraftView({
  draft,
  latencyMs,
  onCopy,
  copied,
  onSave,
  saving,
  saved,
}: {
  draft: ContentDraft;
  latencyMs?: number;
  onCopy: () => void;
  copied: boolean;
  onSave: () => void;
  saving: boolean;
  saved: { id: number } | null;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-primary/40">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Draft · {draft.platform}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {(draft.confidence * 100).toFixed(0)}% confidence
              </Badge>
              {draft.honors_negative_space && (
                <Badge variant="outline" className="text-xs">
                  <Check className="w-3 h-3 mr-1" /> honors negative space
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={onCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              {saved ? (
                <Badge variant="outline" className="text-xs">
                  <Check className="w-3 h-3 mr-1" /> saved to calendar
                </Badge>
              ) : (
                <Button size="sm" onClick={onSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-1" />}
                  Save to calendar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{draft.body}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Quote className="w-4 h-4" />
            Why this sounds like you
          </CardTitle>
          <CardDescription>The voice evidence the ghostwriter cited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <BookOpen className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <span className="font-medium">Voice samples: </span>
              {draft.voice_evidence.style_anchors
                .filter((a) => a.kind === "voice_sample")
                .map((a) => (a as { sample_id: number }).sample_id)
                .join(", ") || "—"}
              <span className="text-muted-foreground">
                {" "}
                — real posts of yours the draft's rhythm and phrasing are anchored to
              </span>
            </div>
          </div>
          {draft.voice_evidence.story_anchor && (
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-medium">Story anchor: </span>
                story #
                {(draft.voice_evidence.story_anchor as { story_id?: number }).story_id ?? "—"}
                <span className="text-muted-foreground"> — grounded in one of your real stories</span>
              </div>
            </div>
          )}
          {draft.voice_evidence.reference_anchors.length > 0 && (
            <div className="flex items-start gap-2">
              <Quote className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-medium">References woven in: </span>
                {draft.voice_evidence.reference_anchors
                  .map((r) => (r as { reference_id?: number }).reference_id)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}
          {latencyMs != null && (
            <p className="text-xs text-muted-foreground pt-1">Generated in {(latencyMs / 1000).toFixed(1)}s</p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Not happy with it? Tweak the brief and draft again. Every draft is checked against your
        banned words and must cite real samples before it reaches you.
      </p>
    </div>
  );
}
