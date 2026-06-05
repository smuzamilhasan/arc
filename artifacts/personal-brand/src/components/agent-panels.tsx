import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRunManager,
  useListManagerRuns,
  getListManagerRunsQueryKey,
  getGetDossierQueryKey,
  getGetAssistantMessagesQueryKey,
  getGetAssistantUnreadQueryKey,
  useGetDossier,
  useGenerateDossier,
} from "@workspace/api-client-react";
import {
  Loader2,
  ArrowRight,
  Telescope,
  RotateCcw,
  Globe,
  CalendarDays,
  PenLine,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { RunCard } from "@/components/manager-run";
import { PlannerDialog } from "@/components/scheduling-dialogs";
import { GhostwriterDialog } from "@/components/ghostwriter-dialog";

function FullPageLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link href={href}>
      <span
        onClick={onNavigate}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {label} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function ManagerPanelView({ onNavigate }: { onNavigate: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");

  const { data: runs = [] } = useListManagerRuns({
    query: { queryKey: getListManagerRunsQueryKey() },
  });
  const runManager = useRunManager();
  const latestRun = runs[0];
  const running = runManager.isPending;

  const handleRun = () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      toast({ title: "Tell the Manager what you want", variant: "destructive" });
      return;
    }
    runManager.mutate(
      { data: { instruction: trimmed } },
      {
        onSuccess: () => {
          setInstruction("");
          queryClient.invalidateQueries({ queryKey: getListManagerRunsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDossierQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAssistantMessagesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAssistantUnreadQueryKey() });
          toast({ title: "The Manager has delegated your instruction." });
        },
        onError: (err) => {
          const status = (err as { status?: number } | undefined)?.status;
          toast({
            title: "The Manager could not run",
            description:
              status === 429
                ? "Please wait a moment and try again."
                : status === 404
                  ? "Finish onboarding to set up your profile first."
                  : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 p-4">
        <p className="text-sm text-muted-foreground">
          Give one instruction. The Manager breaks it down and delegates each piece to the right
          agent.
        </p>
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Research my space, sharpen my positioning, and draft a few posts for this week."
          rows={3}
          maxLength={2000}
          disabled={running}
          className="mt-3 resize-none text-sm"
        />
        <div className="mt-3 flex items-center justify-between">
          <FullPageLink href="/manager" label="Full history" onNavigate={onNavigate} />
          <Button size="sm" onClick={handleRun} disabled={running}>
            {running && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {running ? "Delegating..." : "Delegate"}
          </Button>
        </div>
        {running && (
          <p className="mt-2 text-xs text-muted-foreground">
            The Manager is briefing each agent in turn. This can take a minute.
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {latestRun ? (
            <RunCard run={latestRun} />
          ) : (
            <p className="text-sm font-light text-muted-foreground">
              No runs yet. Give the Manager your first instruction above.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function InvestigatorPanelView({ onNavigate }: { onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: dossier, isLoading } = useGetDossier({
    query: { queryKey: getGetDossierQueryKey(), retry: false },
  });
  const generateDossier = useGenerateDossier();
  const generating = generateDossier.isPending;

  const runGenerate = () => {
    generateDossier.mutate(
      { data: undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDossierQueryKey() });
          toast({ title: "Briefing dossier ready" });
        },
        onError: () => {
          toast({
            title: "Could not complete the investigation",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Research your public footprint and the competitors you are up against, compiled into a
            briefing dossier that informs your whole strategy.
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading dossier...
            </div>
          ) : dossier ? (
            <div className="rounded-lg border border-border/60 bg-card/60 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
                <Globe className="h-3.5 w-3.5" /> Public footprint
              </div>
              <p className="mt-2 text-sm font-light leading-relaxed text-foreground/90 line-clamp-6">
                {dossier.footprintSummary}
              </p>
              {dossier.competitors.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {dossier.competitors.length}{" "}
                  {dossier.competitors.length === 1 ? "competitor" : "competitors"} mapped.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-light text-muted-foreground">
              No dossier yet. Run the investigation to research your public footprint.
            </p>
          )}
        </div>
      </ScrollArea>
      <div className="space-y-3 border-t border-border/60 p-4">
        <Button onClick={runGenerate} disabled={generating} className="w-full gap-2">
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : dossier ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Telescope className="h-4 w-4" />
          )}
          {generating
            ? "Researching..."
            : dossier
              ? "Re-research"
              : "Run the investigation"}
        </Button>
        <FullPageLink href="/dossier" label="Open the full dossier" onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function PlannerPanelView({ onNavigate }: { onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          arc reads your narrative and content strategy to propose a calendar of post slots and
          fresh backlog ideas. Nothing is saved until you confirm.
        </p>
      </div>
      <div className="space-y-3 border-t border-border/60 p-4">
        <Button onClick={() => setOpen(true)} className="w-full gap-2">
          <Wand2 className="h-4 w-4" /> Generate a content plan
        </Button>
        <FullPageLink href="/calendar" label="Open the full calendar" onNavigate={onNavigate} />
      </div>
      <PlannerDialog
        open={open}
        onOpenChange={setOpen}
        onApplied={() => {
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: getListManagerRunsQueryKey() });
        }}
      />
    </div>
  );
}

export function GhostwriterPanelView({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Drafts written in your voice from your narrative and profile. Request a draft, edit it,
          and save it to your library.
        </p>
      </div>
      <div className="space-y-3 border-t border-border/60 p-4">
        <Button onClick={() => setOpen(true)} className="w-full gap-2">
          <PenLine className="h-4 w-4" /> Write a draft
        </Button>
        <FullPageLink href="/content" label="Open the full Content page" onNavigate={onNavigate} />
      </div>
      <GhostwriterDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
