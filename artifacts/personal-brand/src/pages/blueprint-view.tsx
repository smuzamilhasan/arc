import {
  useGetClient,
  getGetClientQueryKey,
  useGetPortrait,
  getGetPortraitQueryKey,
  useGeneratePortrait,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BlueprintModeToggle } from "@/components/blueprint-mode-toggle";
import { useToast } from "@/hooks/use-toast";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function GeneratingState() {
  return (
    <div className="max-w-2xl mx-auto mt-16 space-y-8 text-center animate-in fade-in duration-700">
      <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/5 text-primary border border-primary/10">
        <Sparkles className="w-10 h-10 animate-pulse" />
        <div
          className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"
          style={{ animationDuration: "4s" }}
        />
      </div>
      <h2 className="text-3xl font-serif tracking-tight">
        Synthesizing your foundational profile
      </h2>
      <p className="text-muted-foreground text-lg font-light max-w-md mx-auto leading-relaxed">
        arc is reading your Blueprint and narrative and distilling the definitive
        portrait your content agents build from. This takes about 15-30 seconds.
      </p>
    </div>
  );
}

export default function BlueprintView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  const {
    data: portrait,
    isLoading: isPortraitLoading,
    error: portraitError,
    refetch: refetchPortrait,
  } = useGetPortrait({
    query: { queryKey: getGetPortraitQueryKey(), retry: false },
  });

  const portraitLoadFailed =
    !portrait &&
    portraitError instanceof ApiError &&
    portraitError.status !== 404;

  const generate = useGeneratePortrait();

  const runGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPortraitQueryKey() });
        toast({ title: "Foundational profile generated" });
      },
      onError: () => {
        toast({
          title: "Could not generate your profile",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      },
    });
  };

  const name = client?.fullName?.trim();

  if (isClientLoading || isPortraitLoading) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (generate.isPending) {
    return <GeneratingState />;
  }

  if (portraitLoadFailed) {
    return (
      <div className="space-y-12 pb-16">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Foundational Profile
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
              {name || "Your profile"}
            </h1>
          </div>
          <BlueprintModeToggle active="view" />
        </header>
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 text-destructive mb-5">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl text-foreground">
            Could not load your foundational profile
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            Something went wrong while fetching your profile. Please try again.
          </p>
          <Button
            onClick={() => refetchPortrait()}
            variant="outline"
            className="mt-6 gap-2 rounded-full"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-16">
      <header className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Foundational Profile
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
              {name || "Your profile"}
            </h1>
            <p className="text-muted-foreground text-lg mt-3 max-w-2xl">
              The synthesized portrait your content agents draw on as their single
              source of truth.
            </p>
          </div>
          <BlueprintModeToggle active="view" />
        </div>
      </header>

      {!portrait ? (
        <section className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-5">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl text-foreground">
            Generate your foundational profile
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            arc will synthesize everything in your Blueprint and narrative into a
            sharp, readable portrait of who you are — the same foundation it uses
            to create your content.
          </p>
          <Button
            onClick={runGenerate}
            className="mt-6 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="w-4 h-4" />
            Generate profile
          </Button>
        </section>
      ) : (
        <div className="space-y-10">
          {portrait.stale && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Your Blueprint has changed since this was generated
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Regenerate to refresh your foundational profile with your
                    latest details.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={runGenerate}
                className="gap-2 rounded-full shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </Button>
            </div>
          )}

          <section className="space-y-6">
            {portrait.headline && (
              <p className="font-serif text-2xl md:text-3xl text-foreground leading-snug max-w-3xl">
                {portrait.headline}
              </p>
            )}
            {portrait.summary && (
              <p className="text-lg text-foreground/90 leading-relaxed max-w-3xl whitespace-pre-wrap">
                {portrait.summary}
              </p>
            )}
          </section>

          <div className="space-y-10">
            {portrait.sections.map((section, i) => (
              <section
                key={i}
                className="space-y-3 border-l-2 border-primary/20 pl-6"
              >
                <h2 className="font-serif text-xl md:text-2xl text-foreground">
                  {section.title}
                </h2>
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap max-w-3xl">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-6 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Generated {formatDate(portrait.updatedAt)}
            </p>
            <Button
              variant="outline"
              onClick={runGenerate}
              className="gap-2 rounded-full"
            >
              {generate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
