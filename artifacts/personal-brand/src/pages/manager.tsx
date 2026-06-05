import { useState } from "react";
import {
  useRunManager,
  useListManagerRuns,
  getListManagerRunsQueryKey,
  useApplyContentPlan,
  useCreatePost,
  getListPostsQueryKey,
  getGetDossierQueryKey,
  getListIdeasQueryKey,
  getGetAssistantMessagesQueryKey,
  getGetAssistantUnreadQueryKey,
  ManagerRun,
  ManagerTask,
  PostInputPlatform,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2,
  Network,
  Telescope,
  MessagesSquare,
  CalendarDays,
  PenLine,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const AGENT_META: Record<
  ManagerTask["agent"],
  { label: string; icon: typeof Telescope; href: string }
> = {
  investigator: { label: "Investigator", icon: Telescope, href: "/dossier" },
  strategist: { label: "Strategist", icon: MessagesSquare, href: "/assistant" },
  planner: { label: "Planner", icon: CalendarDays, href: "/calendar" },
  ghostwriter: { label: "Ghostwriter", icon: PenLine, href: "/content" },
};

const EXAMPLES = [
  "Research my space, sharpen my positioning, and draft a few posts I can publish this week.",
  "I'm pivoting into AI strategy consulting. Rework my narrative and plan next week's content.",
  "Find out who my main competitors are and how I should stand out from them.",
];

function StatusBadge({ status }: { status: ManagerTask["status"] }) {
  const map = {
    completed: {
      icon: CheckCircle2,
      cls: "text-emerald-600",
      label: "Completed",
    },
    failed: { icon: XCircle, cls: "text-destructive", label: "Failed" },
    skipped: { icon: MinusCircle, cls: "text-muted-foreground", label: "Skipped" },
    running: { icon: Loader2, cls: "text-primary", label: "Running" },
    pending: { icon: MinusCircle, cls: "text-muted-foreground", label: "Pending" },
  } as const;
  const { icon: Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cls}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function PlannerOutput({ task }: { task: ManagerTask }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const applyPlan = useApplyContentPlan();
  const [applied, setApplied] = useState(false);

  const slots = task.output?.slots ?? [];
  const ideas = task.output?.ideas ?? [];
  if (slots.length === 0 && ideas.length === 0) return null;

  const handleApply = () => {
    applyPlan.mutate(
      { data: { slots, ideas } },
      {
        onSuccess: (result) => {
          setApplied(true);
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
          toast({
            title: "Calendar updated",
            description: `${result.posts.length} ${result.posts.length === 1 ? "slot" : "slots"} scheduled${result.ideas.length > 0 ? ` and ${result.ideas.length} ${result.ideas.length === 1 ? "idea" : "ideas"} added` : ""}.`,
          });
        },
        onError: () => toast({ title: "Could not add the plan", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="mt-3 space-y-3">
      <ul className="space-y-1.5">
        {slots.slice(0, 6).map((slot, i) => (
          <li key={i} className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
              {slot.platform}
            </span>
            <span className="text-foreground">{slot.title}</span>
          </li>
        ))}
        {slots.length > 6 && (
          <li className="text-xs text-muted-foreground">+ {slots.length - 6} more slots</li>
        )}
      </ul>
      <Button size="sm" onClick={handleApply} disabled={applied || applyPlan.isPending}>
        {applyPlan.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        {applied ? "Added to calendar" : "Add to calendar"}
      </Button>
    </div>
  );
}

function GhostwriterOutput({ task }: { task: ManagerTask }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPost = useCreatePost();
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());

  const drafts = task.output?.drafts ?? [];
  const rawPlatform = task.output?.platform ?? "linkedin";
  const platform: PostInputPlatform =
    rawPlatform in PostInputPlatform
      ? (rawPlatform as PostInputPlatform)
      : PostInputPlatform.linkedin;
  if (drafts.length === 0) return null;

  const handleSave = (index: number) => {
    const d = drafts[index];
    createPost.mutate(
      {
        data: {
          title: d.title,
          content: d.content,
          platform,
          status: "draft",
        },
      },
      {
        onSuccess: () => {
          setSavedIndexes((prev) => new Set(prev).add(index));
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          toast({ title: "Saved to library", description: "Added as a draft post." });
        },
        onError: () => toast({ title: "Could not save draft", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="mt-3 space-y-4">
      {drafts.map((draft, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-background p-4">
          <p className="font-medium text-foreground">{draft.title}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground line-clamp-6">
            {draft.content}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => handleSave(i)}
            disabled={savedIndexes.has(i) || createPost.isPending}
          >
            {savedIndexes.has(i) ? "Saved as draft" : "Save as draft"}
          </Button>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: ManagerTask }) {
  const meta = AGENT_META[task.agent];
  const Icon = meta.icon;
  const proposals = task.output?.proposals ?? [];

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/50">
              <Icon className="h-4 w-4 text-foreground stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                {meta.label}
              </p>
              <p className="font-serif text-lg leading-tight text-foreground">{task.title}</p>
            </div>
          </div>
          <StatusBadge status={task.status} />
        </div>

        {task.brief && (
          <p className="mt-3 text-sm font-light italic leading-relaxed text-muted-foreground">
            {task.brief}
          </p>
        )}

        <p className="mt-3 text-sm leading-relaxed text-foreground">{task.resultSummary}</p>

        {task.agent === "investigator" && task.status === "completed" && (
          <Link href={meta.href}>
            <span className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              View the dossier <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}

        {task.agent === "strategist" && proposals.length > 0 && (
          <div className="mt-3 space-y-2">
            <ul className="space-y-1.5">
              {proposals.map((p, i) => (
                <li key={i} className="text-sm text-foreground">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground"> — {p.rationale}</span>
                </li>
              ))}
            </ul>
            <Link href={meta.href}>
              <span className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Review and confirm in the Strategist <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </div>
        )}

        {task.agent === "planner" && task.status === "completed" && <PlannerOutput task={task} />}
        {task.agent === "ghostwriter" && task.status === "completed" && (
          <GhostwriterOutput task={task} />
        )}
      </CardContent>
    </Card>
  );
}

function RunCard({ run }: { run: ManagerRun }) {
  const created = new Date(run.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="space-y-4">
      <div className="space-y-2 border-l-2 border-primary/40 pl-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{created}</p>
        <p className="font-serif text-xl leading-snug text-foreground">"{run.instruction}"</p>
        {run.summary && (
          <p className="text-sm font-light leading-relaxed text-muted-foreground">{run.summary}</p>
        )}
      </div>
      {run.tasks.length === 0 ? (
        <p className="pl-4 text-sm text-muted-foreground">
          The Manager did not delegate any tasks for this instruction.
        </p>
      ) : (
        <div className="space-y-3">
          {run.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Manager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");

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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="max-w-3xl space-y-3">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
          <Network className="h-4 w-4" /> Manager
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">
          Run the whole team from one instruction
        </h1>
        <p className="text-lg font-light leading-relaxed text-muted-foreground">
          Give one high-level instruction. The Manager breaks it down and delegates each piece to
          the right agent — Investigator, Strategist, Planner, and Ghostwriter — in the right order.
          You stay in control: anything that changes your strategy or content waits for your
          confirmation.
        </p>
      </div>

      <Card className="mt-8 border-border/60">
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

      <div className="mt-12 space-y-10">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading past runs...
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm font-light text-muted-foreground">
            No runs yet. Give the Manager your first instruction above.
          </p>
        ) : (
          runs.map((run) => <RunCard key={run.id} run={run} />)
        )}
      </div>
    </div>
  );
}
