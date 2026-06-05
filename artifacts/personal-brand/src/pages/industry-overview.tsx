import { useState } from "react";
import {
  useGetIndustryOverview,
  getGetIndustryOverviewQueryKey,
  useGenerateIndustryOverview,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetDashboard,
  getGetDashboardQueryKey,
  IndustryOverview as IndustryOverviewModel,
  IndustryPlayer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Sparkles,
  RotateCcw,
  Globe,
  MapPin,
  Swords,
  Users,
  ListChecks,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { GenerateGate } from "@/components/locked-panel";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";

function PlayerCard({ player, index }: { player: IndustryPlayer; index: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
          {index + 1}
        </span>
        <h4 className="font-serif text-lg text-foreground">{player.name}</h4>
      </div>
      {player.description && (
        <p className="text-sm font-light leading-relaxed text-foreground/90">
          {player.description}
        </p>
      )}
      {player.positioning && (
        <p className="mt-3 border-l-2 border-primary/30 pl-3 text-xs uppercase tracking-wide text-muted-foreground">
          {player.positioning}
        </p>
      )}
    </div>
  );
}

function Results({
  overview,
  onRegenerate,
  regenerating,
}: {
  overview: IndustryOverviewModel;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Industry Overview
          </p>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            {overview.industry || "Your industry landscape"}
          </h1>
          <div className="flex flex-wrap gap-2">
            {overview.industry && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                <Globe className="h-3.5 w-3.5" />
                {overview.industry}
              </span>
            )}
            {overview.geographyFocus && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {overview.geographyFocus}
              </span>
            )}
          </div>
          {overview.landscapeContext && (
            <p className="text-lg font-light leading-relaxed text-muted-foreground">
              {overview.landscapeContext}
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

      {overview.competitors.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-3xl text-foreground">Competitors to watch</h2>
              <p className="text-sm text-muted-foreground">
                Peers competing for the same audience and authority.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {overview.competitors.map((p, i) => (
              <PlayerCard key={i} player={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {overview.thoughtLeaders.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-3xl text-foreground">Thought leaders</h2>
              <p className="text-sm text-muted-foreground">
                The personal brands that set the standard in this field.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {overview.thoughtLeaders.map((p, i) => (
              <PlayerCard key={i} player={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {overview.playbook.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-3xl text-foreground">Industry playbook</h2>
              <p className="text-sm text-muted-foreground">
                How serious people in this field build their personal brand.
              </p>
            </div>
          </div>
          <Card className="border-border/50 bg-card shadow-sm">
            <CardContent className="space-y-6 pt-8">
              {overview.playbook.map((move, i) => (
                <div key={i} className="flex gap-4">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="space-y-1">
                    <h4 className="font-serif text-lg text-foreground">{move.title}</h4>
                    {move.detail && (
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {move.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {overview.sources.length > 0 && (
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-5">
            <CardTitle className="font-serif text-xl font-normal">Sources</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="space-y-2">
              {overview.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="underline-offset-2 group-hover:underline">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function IndustryOverviewPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const { data: platformStrategy, isLoading: isPlatformsLoading } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });
  const { data: dashboard, isLoading: isDashboardLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });
  const { data: overview, isLoading: isOverviewLoading } = useGetIndustryOverview({
    query: { queryKey: getGetIndustryOverviewQueryKey(), retry: false },
  });

  const generate = useGenerateIndustryOverview();

  const runGenerate = (feedback?: string) => {
    generate.mutate(
      { data: feedback ? { feedback } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetIndustryOverviewQueryKey() });
          toast({ title: "Industry overview generated" });
        },
        onError: () => {
          toast({
            title: "Could not generate industry overview",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const { requestFeedback, dialog } = useRegenerateFeedback({
    title: "Refine your industry overview",
    description:
      "Optionally tell the AI what to change before it regenerates your industry overview. Leave blank to regenerate as before.",
  });

  const handleRegenerate = () =>
    requestFeedback(Boolean(overview), (fb) => runGenerate(fb));

  const gateCtx = {
    client,
    hasAudit: Boolean(dashboard?.auditComplete),
    hasNarrative: Boolean(dashboard?.narrativeComplete),
    hasPlatformStrategy: Boolean(platformStrategy),
  };
  const unlocked = isPanelUnlocked("industry", gateCtx);

  if (isClientLoading || isPlatformsLoading || isDashboardLoading || isOverviewLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  // Generating with no existing overview.
  if (generate.isPending && !overview) {
    return (
      <div className="mx-auto mt-20 max-w-2xl space-y-8 text-center animate-in fade-in duration-1000">
        <div className="relative mx-auto mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
          <Sparkles className="h-10 w-10 animate-pulse" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary"
            style={{ animationDuration: "4s" }}
          />
        </div>
        <h2 className="font-serif text-3xl tracking-tight">Mapping your industry</h2>
        <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
          arc is researching your industry landscape, the people who shape it, and how to build a
          personal brand within it. This takes about 20-40 seconds.
        </p>
      </div>
    );
  }

  // Locked, or unlocked-but-not-yet-confirmed: this capstone never auto-generates.
  // The user must explicitly confirm they are happy with every prior panel first.
  if (!overview) {
    return (
      <GenerateGate
        title={PANEL_GATES.industry.title}
        description="This is the capstone. Once you're happy with your Blueprint, Audit, Narrative, and Platforms, confirm below and arc will map your industry landscape from everything you've built."
        lockedDescription={PANEL_GATES.industry.description}
        prerequisites={panelGatePrerequisites("industry", gateCtx)}
        onGenerate={() => runGenerate()}
        generating={generate.isPending}
        buttonLabel="I'm happy with all prior panels — map my industry"
      />
    );
  }

  void unlocked;

  return (
    <>
      <Results
        overview={overview}
        onRegenerate={handleRegenerate}
        regenerating={generate.isPending}
      />
      {dialog}
    </>
  );
}
