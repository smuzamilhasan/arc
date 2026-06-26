// /app/studio — the v2 home. The single front door to the content engine.
//
// Orients the user through the flow (calibrate voice → build profile → write),
// showing real status pulled from GET /api/v2/profile so each step knows whether
// it's done. This is the connective tissue that makes the v2 surfaces feel like
// one product rather than separate tools.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Mic,
  MessagesSquare,
  PenLine,
  User,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";
import { ProfileSharpenCard } from "@/components/profile-sharpen-card";

type ProfileV2 = {
  identity?: { full_name?: string } | null;
  positioning?: { claim?: string } | null;
  voice?: { confidence?: number; sample_count?: number } | null;
  worldview?: { beliefs?: unknown[] } | null;
  stories?: Array<{ id: number }>;
  counts?: { voice_samples: number; stories: number; references: number };
};

export default function StudioPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileV2 | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clientId = getActiveClientId();
        const res = await fetch(`${import.meta.env.BASE_URL}api/v2/profile`, {
          headers: { ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}) },
        });
        if (res.ok && !cancelled) setProfile(await res.json());
      } catch {
        /* leave profile null → everything shows as "to do" */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sampleCount = profile?.counts?.voice_samples ?? profile?.voice?.sample_count ?? 0;
  const hasVoice = sampleCount >= 10 && (profile?.voice?.confidence ?? 0) > 0;
  const hasPositioning = Boolean(profile?.positioning?.claim?.trim());
  const storyCount = profile?.counts?.stories ?? profile?.stories?.length ?? 0;
  const beliefCount = profile?.worldview?.beliefs?.length ?? 0;

  // Overall readiness: voice extracted + positioning set = ready to write.
  const ready = hasVoice && hasPositioning;

  const steps = [
    {
      n: 1,
      key: "calibrate",
      icon: Mic,
      title: "Calibrate your voice",
      desc: "Pull your real posts so the engine learns how you actually sound.",
      href: "/calibrate",
      done: hasVoice,
      doneLabel: `${sampleCount} samples · ${Math.round((profile?.voice?.confidence ?? 0) * 100)}% confident`,
      cta: hasVoice ? "Re-run" : "Start here",
    },
    {
      n: 2,
      key: "profile",
      icon: MessagesSquare,
      title: "Build your profile",
      desc: "A short conversation fills in positioning, worldview, and confirms your stories.",
      href: "/onboard-v2",
      done: hasPositioning,
      doneLabel: `${beliefCount} beliefs · ${storyCount} stories`,
      cta: hasPositioning ? "Continue" : "Build it",
    },
    {
      n: 3,
      key: "write",
      icon: PenLine,
      title: "Write content",
      desc: "Generate drafts in your voice, grounded in your real material. Save them to your calendar.",
      href: "/ghostwriter-test",
      done: false,
      doneLabel: "",
      cta: ready ? "Write a post" : "Write a post",
      locked: !hasVoice,
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Studio
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Your content engine. Calibrate your voice, build your profile, and write posts that
            sound unmistakably like you.
          </p>
        </div>
        {loading ? (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> checking
          </Badge>
        ) : ready ? (
          <Badge className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ready to write
          </Badge>
        ) : (
          <Badge variant="secondary">Setup in progress</Badge>
        )}
      </div>

      {/* Progressive profiling — one question at a time */}
      <ProfileSharpenCard />

      {/* Flow steps */}
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => {
          const Icon = s.icon;
          const locked = "locked" in s && s.locked;
          return (
            <Card
              key={s.key}
              className={
                "flex flex-col " +
                (s.done ? "border-primary/40" : locked ? "opacity-60" : "")
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  {s.done ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">0{s.n}</span>
                  )}
                </div>
                <CardTitle className="text-base mt-3">{s.title}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                {s.done && s.doneLabel && (
                  <p className="text-xs text-muted-foreground mb-3">{s.doneLabel}</p>
                )}
                {locked ? (
                  <Button variant="outline" disabled className="w-full">
                    Calibrate first
                  </Button>
                ) : (
                  <Link href={s.href}>
                    <Button variant={s.done ? "outline" : "default"} className="w-full">
                      {s.cta}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Secondary surfaces */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/profile-v2">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Your profile</div>
                <div className="text-sm text-muted-foreground">
                  See everything the engine knows about your voice and positioning.
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/calendar">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Content calendar</div>
                <div className="text-sm text-muted-foreground">
                  Drafts you save land here, ready to schedule and publish.
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
