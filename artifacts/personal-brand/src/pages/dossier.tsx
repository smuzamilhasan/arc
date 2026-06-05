import { useState } from "react";
import {
  useGetDossier,
  getGetDossierQueryKey,
  useGenerateDossier,
  useGetClient,
  getGetClientQueryKey,
  BriefingDossier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Telescope,
  RotateCcw,
  Globe,
  Users,
  Link2,
  ExternalLink,
  Sparkles,
  FileText,
  TrendingUp,
  Radar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";

function BetaNotice() {
  const upcoming = [
    {
      icon: FileText,
      title: "Active content tracking",
      description: "Continuous monitoring of your own published content, gathered in one place.",
    },
    {
      icon: TrendingUp,
      title: "Live industry stream",
      description: "A running feed of developments and signals across your industry.",
    },
    {
      icon: Radar,
      title: "Competitor content stream",
      description: "A running stream of what your competitors are publishing, by industry.",
    },
  ];

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-2xl text-foreground">A first look</h2>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-xs font-medium uppercase tracking-widest text-primary">
                Beta
              </span>
            </div>
            <p className="max-w-2xl text-sm font-light leading-relaxed text-muted-foreground">
              The Investigator is an early preview, actively being improved. A more detailed version
              is coming soon, with deeper, continuously updated research.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {upcoming.map((item) => (
            <div key={item.title} className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <item.icon className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-widest">{item.title}</p>
              </div>
              <p className="text-sm font-light leading-relaxed text-foreground/80">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Results({
  dossier,
  onRegenerate,
  regenerating,
}: {
  dossier: BriefingDossier;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const generated = dossier.generatedAt
    ? new Date(dossier.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Investigator
          </p>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Briefing Dossier</h1>
          <p className="text-lg font-light leading-relaxed text-muted-foreground">
            What the public web says about you, and the landscape you compete in.
          </p>
          {generated && (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Last researched {generated}
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
          Re-research
        </Button>
      </div>

      <BetaNotice />

      {/* PUBLIC FOOTPRINT */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-3xl text-foreground">Public footprint</h2>
            <p className="text-sm text-muted-foreground">How you currently show up online.</p>
          </div>
        </div>
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="pt-6">
            <p className="text-base font-light leading-relaxed text-foreground/90">
              {dossier.footprintSummary}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* COMPETITIVE LANDSCAPE */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-3xl text-foreground">Competitive landscape</h2>
            <p className="text-sm text-muted-foreground">
              Who else competes for your audience and authority.
            </p>
          </div>
        </div>

        {dossier.competitors.length === 0 ? (
          <Card className="border-border/50 bg-card shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-light leading-relaxed text-muted-foreground">
                No clear competitors surfaced from current web research. Add more detail to your
                Blueprint (positioning, field, audience) and re-research to sharpen the landscape.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {dossier.competitors.map((c, i) => (
              <Card key={i} className="border-border/50 bg-card shadow-sm">
                <CardHeader className="mb-2 border-b border-border/50 pb-4">
                  <CardTitle className="font-serif text-xl font-normal">{c.name}</CardTitle>
                  {c.description && (
                    <CardDescription className="font-light">{c.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {c.positioning && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Positioning
                      </p>
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {c.positioning}
                      </p>
                    </div>
                  )}
                  {c.differentiation && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-widest text-primary">
                        How you differentiate
                      </p>
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {c.differentiation}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* SOURCES */}
      {dossier.sources.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-3xl text-foreground">Sources</h2>
              <p className="text-sm text-muted-foreground">Where this research came from.</p>
            </div>
          </div>
          <Card className="border-border/50 bg-card shadow-sm">
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {dossier.sources.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-light text-foreground/90 underline-offset-4 hover:text-primary hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function EmptyState({
  onGenerate,
  generating,
  hasClient,
}: {
  onGenerate: () => void;
  generating: boolean;
  hasClient: boolean;
}) {
  return (
    <div className="mx-auto mt-20 max-w-2xl space-y-8 animate-in fade-in duration-700">
      <div className="space-y-8 text-center">
        <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
          <Telescope className="h-9 w-9" />
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">The Investigator</h1>
          <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
            Research your public footprint and the competitors you are up against, compiled into a
            briefing dossier that informs your whole strategy.
          </p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={generating || !hasClient}
          size="lg"
          className="gap-2 rounded-full"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Telescope className="h-4 w-4" />
          )}
          {generating ? "Researching" : "Run the investigation"}
        </Button>
      </div>

      <BetaNotice />
    </div>
  );
}

export default function Dossier() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generateFailed, setGenerateFailed] = useState(false);

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  const { data: dossier, isLoading: isDossierLoading } = useGetDossier({
    query: { queryKey: getGetDossierQueryKey(), retry: false },
  });

  const generateDossier = useGenerateDossier();

  const runGenerate = (feedback?: string) => {
    setGenerateFailed(false);
    generateDossier.mutate(
      { data: feedback ? { feedback } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDossierQueryKey() });
          toast({ title: "Briefing dossier ready" });
        },
        onError: () => {
          setGenerateFailed(true);
          toast({
            title: "Could not complete the investigation",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const { requestFeedback, dialog } = useRegenerateFeedback({
    title: "Refine the investigation",
    description:
      "Optionally tell the Investigator what to focus on before it re-researches. Leave blank to research as before.",
  });

  const handleRegenerate = () => requestFeedback(Boolean(dossier), (fb) => runGenerate(fb));

  if (isClientLoading || isDossierLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (generateDossier.isPending && !dossier) {
    return (
      <div className="mx-auto mt-20 max-w-2xl space-y-8 text-center animate-in fade-in duration-1000">
        <div className="relative mx-auto mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
          <Telescope className="h-10 w-10 animate-pulse" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary"
            style={{ animationDuration: "4s" }}
          />
        </div>
        <h2 className="font-serif text-3xl tracking-tight">Investigating</h2>
        <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
          arc is searching the live web for your public footprint and mapping the competitors in
          your field. This takes about 15-30 seconds.
        </p>
      </div>
    );
  }

  if (!dossier) {
    return (
      <>
        <EmptyState
          onGenerate={() => runGenerate()}
          generating={generateDossier.isPending}
          hasClient={Boolean(client)}
        />
        {generateFailed && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            The investigation could not be completed. Please try again.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <Results
        dossier={dossier}
        onRegenerate={handleRegenerate}
        regenerating={generateDossier.isPending}
      />
      {dialog}
    </>
  );
}
