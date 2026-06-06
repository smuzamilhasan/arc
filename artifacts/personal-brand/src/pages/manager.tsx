import { useState } from "react";
import {
  useRunManager,
  useListManagerRuns,
  getListManagerRunsQueryKey,
  getGetDossierQueryKey,
  getGetAssistantMessagesQueryKey,
  getGetAssistantUnreadQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RunCard } from "@/components/manager-run";
import { AgentGate } from "@/components/agent-gate";

const EXAMPLES = [
  "Research my space, sharpen my positioning, and draft a few posts I can publish this week.",
  "I'm pivoting into AI strategy consulting. Rework my narrative and plan next week's content.",
  "Find out who my main competitors are and how I should stand out from them.",
];

export default function Manager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);

  const { data: runs = [], isLoading } = useListManagerRuns({
    query: { queryKey: getListManagerRunsQueryKey() },
  });
  const runManager = useRunManager();

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
          // The Manager may have written across several surfaces — refresh them.
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

  const running = runManager.isPending;

  return (
    <AgentGate>
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight text-foreground">Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give one high-level instruction. The Manager breaks it down and delegates each piece to
          the right agent — Investigator, Strategist, Planner, and Ghostwriter — in the right order.
          You stay in control: anything that changes your strategy or content waits for your
          confirmation.
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-5">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Research my space, sharpen my positioning, and draft a few posts for this week."
            rows={3}
            maxLength={2000}
            disabled={running}
            className="resize-none border-border/60 text-base"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={running}
                onClick={() => setInstruction(ex)}
                className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground disabled:opacity-50"
              >
                {ex.length > 48 ? `${ex.slice(0, 48)}...` : ex}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleRun} disabled={running}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {running ? "Delegating..." : "Delegate to the team"}
            </Button>
          </div>
          {running && (
            <p className="mt-3 text-xs text-muted-foreground">
              The Manager is briefing each agent in turn. This can take a minute.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-10 space-y-10">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading past runs...
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm font-light text-muted-foreground">
            No runs yet. Give the Manager your first instruction above.
          </p>
        ) : (
          <>
            {runs.length > 1 && !showEarlier && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => setShowEarlier(true)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  Show earlier ({runs.length - 1})
                </Button>
              </div>
            )}
            {(showEarlier ? runs : runs.slice(0, 1)).map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </>
        )}
      </div>
    </div>
    </AgentGate>
  );
}
