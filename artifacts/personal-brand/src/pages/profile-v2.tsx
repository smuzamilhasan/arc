// /app/profile-v2 — read-only view of the v2 operating profile.
//
// Shows everything the engine knows about you: positioning, ICP, voice features,
// worldview beliefs, story bank, references, negative space. This is what makes
// the engine not-a-black-box — you can see (and, via the onboarder, correct)
// the model of you that every draft is written from.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Mic, Target, Brain, BookOpen, Quote, Ban } from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";

type ProfileV2 = {
  identity: { full_name: string; headline: string };
  positioning: { claim?: string; defensibility?: string; adjacent_claims_rejected?: string[] } | null;
  icp: { archetypes?: Array<{ label: string; jobs_to_be_done?: string[] }>; disqualifications?: string[] } | null;
  voice: {
    description?: string;
    confidence?: number;
    sample_count?: number;
    lexicon?: { signature_words?: string[] };
    signature_moves?: Array<{ pattern: string }>;
    sentence_stats?: { avg_len?: number; declarative_ratio?: number; question_ratio?: number };
  } | null;
  worldview: { beliefs?: Array<{ claim: string; why_held?: string }> } | null;
  negative_space: {
    refused_words?: string[];
    refused_topics?: string[];
    refused_takes?: string[];
    refused_formats?: string[];
  } | null;
  stories: Array<{ id: number; summary: string; themes: string[]; status: string }>;
  references: Array<{ id: number; kind: string; label: string; status: string }>;
  anti_examples: Array<{ sample_text: string; why_not_this_voice: string }>;
  counts: { voice_samples: number; stories: number; references: number };
};

export default function ProfileV2Page() {
  const [profile, setProfile] = useState<ProfileV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const clientId = getActiveClientId();
        const res = await fetch(`${import.meta.env.BASE_URL}api/v2/profile`, {
          headers: { ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}) },
        });
        const data = (await res.json()) as ProfileV2 & { error?: string };
        if (data.error) setError(data.error);
        else setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl py-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your operating profile…
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't load profile</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!profile) return null;
  const v = profile;

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{v.identity.full_name}</h1>
        <p className="text-muted-foreground">{v.identity.headline}</p>
        <div className="flex gap-2 mt-3">
          <Badge variant="secondary">{v.counts.voice_samples} voice samples</Badge>
          <Badge variant="secondary">{v.counts.stories} stories</Badge>
          <Badge variant="secondary">{v.counts.references} references</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          This is the model of you the engine writes from. To change it, run{" "}
          <a href={`${import.meta.env.BASE_URL}app/onboard-v2`} className="underline">the profile conversation</a>.
        </p>
      </div>

      {/* Positioning */}
      <Section icon={<Target className="w-4 h-4" />} title="Positioning" subtitle="Your sharpest claim and what you reject">
        {v.positioning?.claim ? (
          <div className="space-y-2 text-sm">
            <p className="text-[15px] font-medium">{v.positioning.claim}</p>
            {v.positioning.defensibility && (
              <p className="text-muted-foreground">Why it's yours: {v.positioning.defensibility}</p>
            )}
            {v.positioning.adjacent_claims_rejected?.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {v.positioning.adjacent_claims_rejected.map((c, i) => (
                  <Badge key={i} variant="outline" className="text-xs">not: {c}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty>Not set yet — run the profile conversation.</Empty>
        )}
      </Section>

      {/* Voice */}
      <Section icon={<Mic className="w-4 h-4" />} title="Voice" subtitle="How you actually sound, from your real posts">
        {v.voice ? (
          <div className="space-y-3 text-sm">
            {v.voice.description && <p>{v.voice.description}</p>}
            {v.voice.sentence_stats && (
              <p className="text-muted-foreground">
                Rhythm: ~{v.voice.sentence_stats.avg_len?.toFixed(0)} words/sentence,{" "}
                {Math.round((v.voice.sentence_stats.declarative_ratio ?? 0) * 100)}% declarative,{" "}
                {Math.round((v.voice.sentence_stats.question_ratio ?? 0) * 100)}% questions.
              </p>
            )}
            {v.voice.lexicon?.signature_words?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {v.voice.lexicon.signature_words.slice(0, 18).map((w, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{w}</Badge>
                ))}
              </div>
            ) : null}
            {v.voice.signature_moves?.length ? (
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {v.voice.signature_moves.slice(0, 6).map((m, i) => (
                  <li key={i}>{m.pattern}</li>
                ))}
              </ul>
            ) : null}
            {v.voice.confidence != null && (
              <Badge variant="outline" className="text-xs">
                {(v.voice.confidence * 100).toFixed(0)}% confidence · {v.voice.sample_count} samples
              </Badge>
            )}
          </div>
        ) : (
          <Empty>No voice extracted yet — run calibration.</Empty>
        )}
      </Section>

      {/* Worldview */}
      <Section icon={<Brain className="w-4 h-4" />} title="Worldview" subtitle="The beliefs underneath your content">
        {v.worldview?.beliefs?.length ? (
          <ul className="space-y-3 text-sm">
            {v.worldview.beliefs.map((b, i) => (
              <li key={i}>
                <p className="font-medium">{b.claim}</p>
                {b.why_held && <p className="text-muted-foreground">{b.why_held}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No beliefs captured yet.</Empty>
        )}
      </Section>

      {/* Stories */}
      <Section icon={<BookOpen className="w-4 h-4" />} title="Story bank" subtitle="Your real stories the ghostwriter can anchor to">
        {v.stories.length ? (
          <ul className="space-y-2 text-sm">
            {v.stories.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <Badge variant={s.status === "confirmed" ? "default" : "outline"} className="text-[10px] mt-0.5 shrink-0">
                  {s.status}
                </Badge>
                <div>
                  <span>{s.summary}</span>
                  {s.themes?.length ? (
                    <span className="text-muted-foreground"> · {s.themes.join(", ")}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No stories yet.</Empty>
        )}
      </Section>

      {/* References */}
      <Section icon={<Quote className="w-4 h-4" />} title="References" subtitle="People, books, frameworks you return to">
        {v.references.length ? (
          <div className="flex flex-wrap gap-1.5">
            {v.references.map((r) => (
              <Badge key={r.id} variant={r.status === "confirmed" ? "default" : "outline"} className="text-xs">
                {r.kind}: {r.label}
              </Badge>
            ))}
          </div>
        ) : (
          <Empty>No references yet.</Empty>
        )}
      </Section>

      {/* Negative space */}
      <Section icon={<Ban className="w-4 h-4" />} title="Negative space" subtitle="What the ghostwriter will never write">
        {v.negative_space ? (
          <div className="space-y-2 text-sm">
            {renderBanRow("Banned words", v.negative_space.refused_words)}
            {renderBanRow("Refused topics", v.negative_space.refused_topics)}
            {renderBanRow("Refused takes", v.negative_space.refused_takes)}
            {renderBanRow("Refused formats", v.negative_space.refused_formats)}
          </div>
        ) : (
          <Empty>Not set yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}

function renderBanRow(label: string, items?: string[]) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1">{label}:</span>
      {items.map((it, i) => (
        <Badge key={i} variant="outline" className="text-xs">{it}</Badge>
      ))}
    </div>
  );
}
