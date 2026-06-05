import { useEffect, useRef, useState } from "react";
import {
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGeneratePlatforms,
  useGetClient,
  getGetClientQueryKey,
  PlatformStrategy,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Sparkles,
  Globe,
  Radio,
  Users,
  Mic,
  GraduationCap,
  Network,
  Layers,
  Zap,
  Mail,
  Megaphone,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { overallCompletion, PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { GenerateGate } from "@/components/locked-panel";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function OfflineRow({
  icon: Icon,
  title,
  guide,
  body,
}: {
  icon: React.ElementType;
  title: string;
  guide: string;
  body: string;
}) {
  if (!body?.trim()) return null;
  return (
    <div className="flex gap-4">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
        <Icon className="h-5 w-5 stroke-[1.5]" />
      </div>
      <div className="space-y-1">
        <h4 className="font-serif text-lg text-foreground">{title}</h4>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{guide}</p>
        <p className="text-sm font-light leading-relaxed text-foreground/90">{body}</p>
      </div>
    </div>
  );
}

function Results({
  strategy,
  onRegenerate,
  regenerating,
}: {
  strategy: PlatformStrategy;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const { online, offline } = strategy;

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Platforms &amp; Presence
          </p>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Digital + Physical
          </h1>
          {strategy.summary && (
            <p className="text-lg font-light leading-relaxed text-muted-foreground">
              {strategy.summary}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={regenerating}
          className="shrink-0 gap-2 rounded-full"
        >
          {regenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Regenerate
        </Button>
      </div>

      {/* ONLINE */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-3xl text-foreground">Online</h2>
            <p className="text-sm text-muted-foreground">Online gives scale.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Primary platforms */}
          <Card className="border-border/50 bg-card shadow-sm lg:col-span-2">
            <CardHeader className="mb-4 border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <Radio className="h-5 w-5 text-primary" />
                <CardTitle className="font-serif text-xl font-normal">
                  Platforms to dominate
                </CardTitle>
              </div>
              <CardDescription className="font-light">
                Pick 1-2 primary platforms to dominate, others to mirror.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {online.primary.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-primary/20 bg-primary/5 p-5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {i + 1}
                      </span>
                      <h4 className="font-serif text-lg text-foreground">{p.platform}</h4>
                    </div>
                    <p className="text-sm font-light leading-relaxed text-foreground/90">
                      {p.reason}
                    </p>
                  </div>
                ))}
              </div>
              {online.mirror.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Mirror content to
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {online.mirror.map((m, i) => (
                      <Chip key={i}>{m}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Long-form depth */}
          <Card className="border-border/50 bg-card shadow-sm">
            <CardHeader className="mb-4 border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="font-serif text-xl font-normal">Long-form depth</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-light leading-relaxed text-foreground/90">
                {online.longForm.recommendation}
              </p>
              <div className="flex flex-wrap gap-2">
                {online.longForm.platforms.map((p: string, i: number) => (
                  <Chip key={i}>{p}</Chip>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Short-form reach */}
          <Card className="border-border/50 bg-card shadow-sm">
            <CardHeader className="mb-4 border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle className="font-serif text-xl font-normal">Short-form reach</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-light leading-relaxed text-foreground/90">
                {online.shortForm.recommendation}
              </p>
              <div className="flex flex-wrap gap-2">
                {online.shortForm.platforms.map((p: string, i: number) => (
                  <Chip key={i}>{p}</Chip>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Authority / infrastructure */}
          <Card className="border-border/50 bg-card shadow-sm">
            <CardHeader className="mb-4 border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 text-primary" />
                <CardTitle className="font-serif text-xl font-normal">
                  Authority &amp; infrastructure
                </CardTitle>
              </div>
              <CardDescription className="font-light">Personal website</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-light leading-relaxed text-foreground/90">
                {online.website.recommendation}
              </p>
              <ul className="space-y-2">
                {online.website.elements.map((el: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-light">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{el}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Newsletter */}
          <Card className="border-border/50 bg-card shadow-sm">
            <CardHeader className="mb-4 border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="font-serif text-xl font-normal">Email newsletter</CardTitle>
              </div>
              <CardDescription className="font-light">
                Still the best owned channel for serious thought leadership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-light leading-relaxed text-foreground/90">
                {online.newsletter}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* OFFLINE */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-3xl text-foreground">Offline</h2>
            <p className="text-sm text-muted-foreground">Offline gives depth &amp; seriousness.</p>
          </div>
        </div>

        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="space-y-8 pt-8">
            {offline.intro && (
              <p className="border-l-2 border-primary/30 pl-6 text-lg font-light italic leading-relaxed text-foreground/90">
                {offline.intro}
              </p>
            )}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <OfflineRow
                icon={Mic}
                title="Speaking &amp; events"
                guide="Conferences, panels, lectures, fireside chats"
                body={offline.speaking}
              />
              <OfflineRow
                icon={Users}
                title="Workshops &amp; roundtables"
                guide="Curated small groups, the right people in one room"
                body={offline.workshops}
              />
              <OfflineRow
                icon={Network}
                title="Industry associations / forums"
                guide="Boards, committees, advisory groups"
                body={offline.associations}
              />
              <OfflineRow
                icon={GraduationCap}
                title="Teaching &amp; mentoring"
                guide="Cohort courses, adjunct teaching, accelerator mentorship"
                body={offline.teaching}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {strategy.closing && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
          <p className="mx-auto max-w-2xl font-serif text-xl font-normal italic leading-relaxed text-foreground">
            {strategy.closing}
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
            Online gives scale. Offline gives depth &amp; seriousness.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Platforms() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [autoGenFailed, setAutoGenFailed] = useState(false);
  const autoGenAttempted = useRef(false);

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  const { data: strategy, isLoading: isStrategyLoading } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });

  const generatePlatforms = useGeneratePlatforms();

  const blueprintComplete = overallCompletion(client).pct === 100;

  const runGenerate = (isAuto: boolean, feedback?: string) => {
    generatePlatforms.mutate(
      { data: feedback ? { feedback } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPlatformsQueryKey() });
          if (!isAuto) toast({ title: "Platform strategy generated" });
        },
        onError: () => {
          if (isAuto) setAutoGenFailed(true);
          toast({
            title: "Could not generate platform strategy",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const { requestFeedback, dialog } = useRegenerateFeedback({
    title: "Refine your platform strategy",
    description:
      "Optionally tell the AI what to change before it regenerates your platform strategy. Leave blank to regenerate as before.",
  });

  const handleRegenerate = () =>
    requestFeedback(Boolean(strategy), (fb) => runGenerate(false, fb));

  const canAutoGenerate =
    blueprintComplete && !strategy && !autoGenFailed;

  // Auto-generate the strategy the first time the panel unlocks.
  useEffect(() => {
    if (autoGenAttempted.current) return;
    if (isClientLoading || isStrategyLoading) return;
    if (!canAutoGenerate) return;
    autoGenAttempted.current = true;
    runGenerate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoGenerate, isClientLoading, isStrategyLoading]);

  const gateCtx = { client, hasPlatformStrategy: Boolean(strategy) };
  const locked = !isPanelUnlocked("platforms", gateCtx);

  if (isClientLoading || isStrategyLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  // Locked: blueprint not yet fully filled. Surface the prerequisite checklist
  // right at the generate action instead of a separate locked panel.
  if (locked) {
    return (
      <GenerateGate
        title={PANEL_GATES.platforms.title}
        description="Your Blueprint is complete. Generate a tailored digital and physical presence strategy."
        lockedDescription={PANEL_GATES.platforms.description}
        prerequisites={panelGatePrerequisites("platforms", gateCtx)}
        onGenerate={() => runGenerate(false)}
        generating={generatePlatforms.isPending}
      />
    );
  }

  // Unlocked, generating (auto or manual) with no existing strategy.
  if (generatePlatforms.isPending && !strategy) {
    return (
      <div className="mx-auto mt-20 max-w-2xl space-y-8 text-center animate-in fade-in duration-1000">
        <div className="relative mx-auto mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
          <Sparkles className="h-10 w-10 animate-pulse" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary"
            style={{ animationDuration: "4s" }}
          />
        </div>
        <h2 className="font-serif text-3xl tracking-tight">Mapping your presence</h2>
        <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
          arc is translating your Blueprint into a concrete platform strategy across digital and
          physical channels. This takes about 15-30 seconds.
        </p>
      </div>
    );
  }

  // Unlocked but generation failed and nothing stored yet.
  if (!strategy) {
    return (
      <GenerateGate
        title={PANEL_GATES.platforms.title}
        description="Your Blueprint is complete. Generate a tailored digital and physical presence strategy."
        lockedDescription={PANEL_GATES.platforms.description}
        prerequisites={panelGatePrerequisites("platforms", gateCtx)}
        onGenerate={() => runGenerate(false)}
        generating={generatePlatforms.isPending}
      />
    );
  }

  return (
    <>
      <Results
        strategy={strategy}
        onRegenerate={handleRegenerate}
        regenerating={generatePlatforms.isPending}
      />
      {dialog}
    </>
  );
}
