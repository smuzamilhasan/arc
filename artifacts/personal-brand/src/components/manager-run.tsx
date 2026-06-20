import { useState } from "react";
import {
  useCreatePost,
  getListPostsQueryKey,
  ManagerRun,
  ManagerTask,
  PostInputPlatform,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2,
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
import { useToast } from "@/hooks/use-toast";

export const AGENT_META: Record<
  ManagerTask["agent"],
  { label: string; icon: typeof Telescope; href: string }
> = {
  investigator: { label: "Investigator", icon: Telescope, href: "/dossier" },
  strategist: { label: "Strategist", icon: MessagesSquare, href: "/assistant" },
  planner: { label: "Planner", icon: CalendarDays, href: "/planner" },
  ghostwriter: { label: "Ghostwriter", icon: PenLine, href: "/content" },
};

function StatusBadge({ status }: { status: ManagerTask["status"] }) {
  const map = {
    completed: {
      icon: CheckCircle2,
      cls: "text-teal-300",
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

        {(task.agent === "strategist" || task.agent === "planner") && proposals.length > 0 && (
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
                Review and confirm in the {meta.label} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </div>
        )}

        {task.agent === "ghostwriter" && task.status === "completed" && (
          <GhostwriterOutput task={task} />
        )}
      </CardContent>
    </Card>
  );
}

export function RunCard({ run }: { run: ManagerRun }) {
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
