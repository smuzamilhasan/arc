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
import { AlertTriangle, Mic, Target, Brain, BookOpen, Quote, Ban, Users, Briefcase, Flag, Tag, SlidersHorizontal, Layers, Share2, Globe, Star } from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";
import { WorkingIndicator, WORK_MESSAGES } from "@/components/working-indicator";

type ProfileV2 = {
  identity: { full_name: string; headline: string };
  positioning: { claim?: string; defensibility?: string; adjacent_claims_rejected?: string[] } | null;
  icp: {
    archetypes?: Array<{ label: string; jobs_to_be_done?: string[]; pains?: string[] }>;
    secondary_audiences?: string[];
    estimated_tam?: string;
    disqualifications?: string[];
  } | null;
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
  identity_v2: {
    role?: string; title?: string; company?: string; industry?: string; seniority?: string;
    education?: string[]; geography_base?: string; geography_market?: string[];
    languages?: string[]; content_script?: string; credentials?: string[]; career_arc?: string;
  } | null;
  goals: { brand_goals?: string[]; business_goals?: string[]; success_metrics?: string[]; time_horizon?: string; current_state?: string; desired_state?: string } | null;
  offers: { offerings?: Array<{ name: string; type: string; description?: string; price_note?: string }>; lead_magnets?: string[]; promoting_now?: string; preferred_ctas?: string[] } | null;
  operating_prefs: { content_time_per_week?: string; approval_style?: string; risk_tolerance?: number; sustainable_cadence?: string } | null;
  content_strategy: { pillars?: Array<{ name: string; description?: string }>; formats?: string[]; hooks?: string[]; recurring_series?: string[]; repurposing_rules?: string[] } | null;
  channels: { channels?: Array<{ platform: string; handle?: string; url?: string; is_primary?: boolean; audience_size?: number; cadence?: string }> } | null;
  market_context: { competitors?: Array<{ name: string; note?: string }>; trends?: string[]; white_space?: string[] } | null;
  reputation: { followings?: Array<{ platform: string; count: number }>; current_perception?: string; desired_perception?: string; perception_gap?: string } | null;
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
      <div className="container mx-auto max-w-4xl py-8">
        <WorkingIndicator messages={WORK_MESSAGES.profile} />
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

      {/* Identity */}
      <Section icon={<Briefcase className="w-4 h-4" />} title="Identity" subtitle="Who you are, in the world's terms">
        {v.identity_v2 &&
        (v.identity_v2.role || v.identity_v2.title || v.identity_v2.company || v.identity_v2.industry || v.identity_v2.career_arc || v.identity_v2.education?.length || v.identity_v2.languages?.length || v.identity_v2.geography_base) ? (
          <div className="space-y-2 text-sm">
            {renderField("Role", v.identity_v2.role || v.identity_v2.title)}
            {renderField("Company", v.identity_v2.company)}
            {renderField("Industry", v.identity_v2.industry)}
            {renderField("Seniority", v.identity_v2.seniority)}
            {renderField("Based in", v.identity_v2.geography_base)}
            {renderBanRow("Markets", v.identity_v2.geography_market)}
            {renderBanRow("Languages", v.identity_v2.languages)}
            {renderBanRow("Education", v.identity_v2.education)}
            {renderBanRow("Credentials", v.identity_v2.credentials)}
            {v.identity_v2.career_arc && <p className="text-muted-foreground">{v.identity_v2.career_arc}</p>}
          </div>
        ) : (
          <Empty>Not set yet — run the profile conversation.</Empty>
        )}
      </Section>

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

      {/* Audience / ICP */}
      <Section icon={<Users className="w-4 h-4" />} title="Audience" subtitle="Who you're for — and who you're not">
        {v.icp?.archetypes?.length || v.icp?.secondary_audiences?.length || v.icp?.disqualifications?.length ? (
          <div className="space-y-3 text-sm">
            {v.icp.archetypes?.map((a, i) => (
              <div key={i}>
                <p className="font-medium">{a.label}</p>
                {a.jobs_to_be_done?.length ? <p className="text-muted-foreground">Wants: {a.jobs_to_be_done.join(", ")}</p> : null}
                {a.pains?.length ? <p className="text-muted-foreground">Pains: {a.pains.join(", ")}</p> : null}
              </div>
            ))}
            {renderBanRow("Also reaches", v.icp.secondary_audiences)}
            {renderField("Market size", v.icp.estimated_tam)}
            {renderBanRow("Not for", v.icp.disqualifications)}
          </div>
        ) : (
          <Empty>No audience defined yet.</Empty>
        )}
      </Section>

      {/* Goals */}
      <Section icon={<Flag className="w-4 h-4" />} title="Goals" subtitle="What this brand is for">
        {v.goals && (v.goals.brand_goals?.length || v.goals.business_goals?.length || v.goals.success_metrics?.length || v.goals.time_horizon || v.goals.desired_state) ? (
          <div className="space-y-2 text-sm">
            {renderBanRow("Brand goals", v.goals.brand_goals)}
            {renderBanRow("Business goals", v.goals.business_goals)}
            {renderBanRow("Success metrics", v.goals.success_metrics)}
            {renderField("Horizon", v.goals.time_horizon)}
            {renderField("Now", v.goals.current_state)}
            {renderField("Aiming for", v.goals.desired_state)}
          </div>
        ) : (
          <Empty>Not set yet.</Empty>
        )}
      </Section>

      {/* Offers */}
      <Section icon={<Tag className="w-4 h-4" />} title="Offers" subtitle="What you sell or drive toward">
        {v.offers && (v.offers.offerings?.length || v.offers.lead_magnets?.length || v.offers.promoting_now || v.offers.preferred_ctas?.length) ? (
          <div className="space-y-2 text-sm">
            {v.offers.offerings?.length ? (
              <ul className="space-y-1">
                {v.offers.offerings.map((o, i) => (
                  <li key={i}>
                    <span className="font-medium">{o.name}</span>{" "}
                    <Badge variant="outline" className="text-[10px]">{o.type}</Badge>
                    {o.price_note ? <span className="text-muted-foreground"> · {o.price_note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {renderField("Promoting now", v.offers.promoting_now)}
            {renderBanRow("Lead magnets", v.offers.lead_magnets)}
            {renderBanRow("Preferred CTAs", v.offers.preferred_ctas)}
          </div>
        ) : (
          <Empty>Not set yet.</Empty>
        )}
      </Section>

      {/* Content strategy */}
      <Section icon={<Layers className="w-4 h-4" />} title="Content strategy" subtitle="What you publish, and how">
        {v.content_strategy && (v.content_strategy.pillars?.length || v.content_strategy.formats?.length || v.content_strategy.recurring_series?.length || v.content_strategy.hooks?.length) ? (
          <div className="space-y-2 text-sm">
            {v.content_strategy.pillars?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {v.content_strategy.pillars.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{p.name}</Badge>
                ))}
              </div>
            ) : null}
            {renderBanRow("Formats", v.content_strategy.formats)}
            {renderBanRow("Recurring series", v.content_strategy.recurring_series)}
            {renderBanRow("Hooks", v.content_strategy.hooks)}
          </div>
        ) : (
          <Empty>Not set yet.</Empty>
        )}
      </Section>

      {/* Channels */}
      <Section icon={<Share2 className="w-4 h-4" />} title="Channels" subtitle="Where you show up">
        {v.channels?.channels?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {v.channels.channels.map((c, i) => (
              <Badge key={i} variant={c.is_primary ? "default" : "outline"} className="text-xs">
                {c.platform}
                {c.handle ? ` · ${c.handle}` : ""}
                {c.audience_size ? ` · ${c.audience_size.toLocaleString()}` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <Empty>No channels yet.</Empty>
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

      {/* Operating preferences */}
      <Section icon={<SlidersHorizontal className="w-4 h-4" />} title="Operating preferences" subtitle="How you want to work">
        {v.operating_prefs && (v.operating_prefs.content_time_per_week || v.operating_prefs.approval_style || v.operating_prefs.sustainable_cadence || v.operating_prefs.risk_tolerance != null) ? (
          <div className="space-y-2 text-sm">
            {renderField("Time per week", v.operating_prefs.content_time_per_week)}
            {renderField("Sustainable cadence", v.operating_prefs.sustainable_cadence)}
            {renderField("Approval", v.operating_prefs.approval_style?.replace(/_/g, " "))}
            {v.operating_prefs.risk_tolerance != null
              ? renderField("Risk tolerance", `${Math.round(v.operating_prefs.risk_tolerance * 100)}%`)
              : null}
          </div>
        ) : (
          <Empty>Not set yet.</Empty>
        )}
      </Section>

      {/* Market context */}
      <Section icon={<Globe className="w-4 h-4" />} title="Market context" subtitle="Your landscape — researched, not asked">
        {v.market_context && (v.market_context.competitors?.length || v.market_context.trends?.length || v.market_context.white_space?.length) ? (
          <div className="space-y-2 text-sm">
            {v.market_context.competitors?.length ? renderBanRow("Competitors", v.market_context.competitors.map((c) => c.name)) : null}
            {renderBanRow("Trends you ride", v.market_context.trends)}
            {renderBanRow("White space", v.market_context.white_space)}
          </div>
        ) : (
          <Empty>Not researched yet.</Empty>
        )}
      </Section>

      {/* Reputation */}
      <Section icon={<Star className="w-4 h-4" />} title="Reputation" subtitle="How you're seen — researched, not asked">
        {v.reputation && (v.reputation.followings?.length || v.reputation.current_perception || v.reputation.desired_perception) ? (
          <div className="space-y-2 text-sm">
            {v.reputation.followings?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {v.reputation.followings.map((f, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{f.platform}: {f.count.toLocaleString()}</Badge>
                ))}
              </div>
            ) : null}
            {renderField("Seen as", v.reputation.current_perception)}
            {renderField("Wants to be seen as", v.reputation.desired_perception)}
            {renderField("The gap", v.reputation.perception_gap)}
          </div>
        ) : (
          <Empty>Not researched yet.</Empty>
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

function renderField(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
