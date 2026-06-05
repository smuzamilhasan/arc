import { useEffect, useState } from "react";
import {
  useGenerateContentPlan,
  useApplyContentPlan,
  useScheduleBatchPosts,
  getListPostsQueryKey,
} from "@workspace/api-client-react";
import type {
  Post,
  ContentPlanProposal,
  PlannedSlot,
  PlannedIdea,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  CalendarClock,
  CalendarDays,
  Wand2,
  RotateCcw,
  Lightbulb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

// Lay out a chosen set of draft/scheduled posts across the calendar at a fixed
// cadence. Self-contained: manages its own setup state and resets every time it
// opens. Calls onApplied() after a successful batch schedule.
export function BatchScheduleDialog({
  open,
  onOpenChange,
  posts,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: Post[];
  onApplied?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scheduleBatch = useScheduleBatchPosts();
  const [planStartDate, setPlanStartDate] = useState("");
  const [planInterval, setPlanInterval] = useState("1");
  const [planTime, setPlanTime] = useState("09:00");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Default to today, daily cadence, 9am, with all drafts pre-selected whenever
  // the dialog opens.
  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setPlanStartDate(`${yyyy}-${mm}-${dd}`);
    setPlanInterval("1");
    setPlanTime("09:00");
    setSelectedIds(posts.filter((p) => p.status === "draft").map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // The scheduled date for the post at a given position in the plan, built from
  // numeric Y/M/D parts (matching the server) so it never drifts by a timezone
  // and never throws on a transiently empty/invalid start date as the user types.
  const previewDate = (order: number): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planStartDate);
    if (!m) return null;
    const [, y, mo, d] = m;
    const [hh, mm] = (planTime || "09:00").split(":");
    const step = Math.max(1, Number(planInterval) || 1);
    const date = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d) + order * step,
      Number(hh) || 0,
      Number(mm) || 0,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const handleScheduleBatch = () => {
    if (selectedIds.length === 0 || !planStartDate) return;
    // Schedule in the order the posts appear in the library list.
    const orderedIds = posts
      .filter((p) => selectedIds.includes(p.id))
      .map((p) => p.id);
    scheduleBatch.mutate(
      {
        data: {
          postIds: orderedIds,
          startDate: planStartDate,
          intervalDays: Math.max(1, Number(planInterval) || 1),
          time: planTime || "09:00",
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          toast({
            title: "Schedule planned",
            description: `${updated.length} ${updated.length === 1 ? "post" : "posts"} laid out on the calendar.`,
          });
          onOpenChange(false);
          setSelectedIds([]);
          onApplied?.();
        },
        onError: () =>
          toast({ title: "Could not schedule posts", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden border-border/50 rounded-xl shadow-2xl">
        <DialogHeader className="p-7 pb-4 border-b border-border/50 shrink-0 bg-card">
          <DialogTitle className="font-serif text-2xl font-normal">Plan a schedule</DialogTitle>
          <DialogDescription className="text-sm font-light">
            Pick the posts you want to publish, choose a start date and cadence, and arc will lay them out across the calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-7 pb-4 border-b border-border/50 bg-background shrink-0">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Start date</Label>
              <Input
                type="date"
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                className="h-11 bg-card border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Every</Label>
              <Select value={planInterval} onValueChange={setPlanInterval}>
                <SelectTrigger className="h-11 bg-card border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="2">2 days</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">1 week</SelectItem>
                  <SelectItem value="14">2 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Time</Label>
              <Input
                type="time"
                value={planTime}
                onChange={(e) => setPlanTime(e.target.value)}
                className="h-11 bg-card border-border/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-7 space-y-2 bg-background">
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground font-light py-8 text-center">
                No draft or scheduled posts available to plan.
              </p>
            ) : (
              posts.map((post) => {
                const checked = selectedIds.includes(post.id);
                const order = selectedIds.indexOf(post.id);
                const scheduledOn = checked && order >= 0 ? previewDate(order) : null;
                return (
                  <button
                    type="button"
                    key={post.id}
                    onClick={() => toggleSelected(post.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${checked ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card hover:border-border"}`}
                  >
                    <Checkbox checked={checked} className="mt-0.5 pointer-events-none" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{post.title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">{post.platform}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs font-light text-muted-foreground">{post.content}</p>
                    </div>
                    {scheduledOn && (
                      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        {format(scheduledOn, "MMM d")}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter className="p-5 border-t border-border/50 bg-card shrink-0 sm:justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                Cancel
              </Button>
              <Button
                onClick={handleScheduleBatch}
                disabled={selectedIds.length === 0 || !planStartDate || scheduleBatch.isPending}
                className="rounded-full gap-2 px-6"
              >
                {scheduleBatch.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="h-4 w-4" />
                )}
                Schedule {selectedIds.length > 0 ? selectedIds.length : ""}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// AI content-calendar planner: reads the narrative + content strategy to propose
// an ephemeral plan of post slots and backlog ideas, then applies the kept ones.
export function PlannerDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState("1");
  const [feedback, setFeedback] = useState("");
  const [proposal, setProposal] = useState<ContentPlanProposal | null>(null);
  const [keptSlots, setKeptSlots] = useState<Set<number>>(new Set());
  const [keptIdeas, setKeptIdeas] = useState<Set<number>>(new Set());

  const generatePlan = useGenerateContentPlan();
  const applyPlan = useApplyContentPlan();

  // Default the start date to the upcoming Monday whenever the dialog opens, and
  // clear any prior proposal so the user starts from the setup step.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, "0");
    const dd = String(monday.getDate()).padStart(2, "0");
    setStartDate(`${yyyy}-${mm}-${dd}`);
    setWeeks("1");
    setFeedback("");
    setProposal(null);
    setKeptSlots(new Set());
    setKeptIdeas(new Set());
  }, [open]);

  const handleGenerate = () => {
    generatePlan.mutate(
      { data: { startDate: startDate || undefined, weeks: Number(weeks) || 1, feedback: feedback.trim() || undefined } },
      {
        onSuccess: (result) => {
          setProposal(result);
          setKeptSlots(new Set(result.slots.map((_, i) => i)));
          setKeptIdeas(new Set(result.ideas.map((_, i) => i)));
          if (result.slots.length === 0 && result.ideas.length === 0) {
            toast({
              title: "Nothing to plan yet",
              description: "The planner returned an empty calendar. Try adjusting your notes.",
            });
          }
        },
        onError: (err) => {
          const status = (err as { status?: number } | undefined)?.status;
          toast({
            title: "Could not generate a plan",
            description:
              status === 403
                ? "Finish your Blueprint and content strategy first."
                : status === 429
                  ? "You have hit the AI rate limit. Please try again later."
                  : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleApply = () => {
    if (!proposal) return;
    const slots: PlannedSlot[] = proposal.slots.filter((_, i) => keptSlots.has(i));
    const ideas: PlannedIdea[] = proposal.ideas.filter((_, i) => keptIdeas.has(i));
    if (slots.length === 0 && ideas.length === 0) {
      toast({ title: "Select at least one slot or idea to add.", variant: "destructive" });
      return;
    }
    applyPlan.mutate(
      { data: { slots, ideas } },
      {
        onSuccess: (result) => {
          toast({
            title: "Calendar updated",
            description: `${result.posts.length} ${result.posts.length === 1 ? "slot" : "slots"} scheduled${result.ideas.length > 0 ? ` and ${result.ideas.length} ${result.ideas.length === 1 ? "idea" : "ideas"} added to your backlog` : ""}.`,
          });
          onApplied();
        },
        onError: () => toast({ title: "Could not save the plan", variant: "destructive" }),
      },
    );
  };

  const toggleSlot = (i: number) =>
    setKeptSlots((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const toggleIdea = (i: number) =>
    setKeptIdeas((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  // Group kept-or-not slots by their calendar day for review.
  const slotsByDay: { day: string; items: { slot: PlannedSlot; index: number }[] }[] = [];
  if (proposal) {
    const map = new Map<string, { slot: PlannedSlot; index: number }[]>();
    proposal.slots.forEach((slot, index) => {
      const key = format(new Date(slot.targetDate), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ slot, index });
    });
    for (const [day, items] of map) slotsByDay.push({ day, items });
  }

  const keptSlotCount = keptSlots.size;
  const keptIdeaCount = keptIdeas.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden border-border/50 rounded-xl shadow-2xl">
        <DialogHeader className="p-7 pb-4 border-b border-border/50 shrink-0 bg-card">
          <DialogTitle className="font-serif text-2xl font-normal">Generate a content calendar</DialogTitle>
          <DialogDescription className="text-sm font-light">
            arc reads your narrative and content strategy to propose a calendar of post slots and fresh backlog ideas. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        {!proposal ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-7 space-y-5 bg-background">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 bg-card border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">How many weeks</Label>
                  <Select value={weeks} onValueChange={setWeeks}>
                    <SelectTrigger className="h-11 bg-card border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 week</SelectItem>
                      <SelectItem value="2">2 weeks</SelectItem>
                      <SelectItem value="3">3 weeks</SelectItem>
                      <SelectItem value="4">4 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Notes (optional)</Label>
                <Textarea
                  placeholder="Steer the plan, e.g. emphasize a launch, lean into a theme, or favor LinkedIn this week."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[88px] bg-card border-border/50 resize-none"
                />
              </div>
            </div>
            <DialogFooter className="p-5 border-t border-border/50 bg-card shrink-0">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={generatePlan.isPending} className="rounded-full gap-2 px-6">
                {generatePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate plan
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-7 space-y-6 bg-background">
              {proposal.summary && (
                <p className="text-sm font-light leading-relaxed text-foreground">{proposal.summary}</p>
              )}

              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-widest font-medium text-muted-foreground">
                  Proposed slots
                </h4>
                {slotsByDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-light">No slots proposed.</p>
                ) : (
                  slotsByDay.map(({ day, items }) => (
                    <div key={day} className="space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        {format(new Date(`${day}T00:00:00`), "EEEE, MMM d")}
                      </p>
                      {items.map(({ slot, index }) => {
                        const kept = keptSlots.has(index);
                        return (
                          <div
                            key={index}
                            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${kept ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card opacity-60"}`}
                          >
                            <Checkbox checked={kept} onCheckedChange={() => toggleSlot(index)} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-foreground">{slot.title}</span>
                                <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">{slot.platform}</span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-xs font-light text-muted-foreground">{slot.brief}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {slot.contentType && <Chip>{slot.contentType}</Chip>}
                                {slot.format && <Chip>{slot.format}</Chip>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {proposal.ideas.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-widest font-medium text-muted-foreground flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" /> Backlog ideas
                  </h4>
                  {proposal.ideas.map((idea, index) => {
                    const kept = keptIdeas.has(index);
                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${kept ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card opacity-60"}`}
                      >
                        <Checkbox checked={kept} onCheckedChange={() => toggleIdea(index)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-foreground">{idea.title}</span>
                            {idea.platform && (
                              <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">{idea.platform}</span>
                            )}
                          </div>
                          {idea.notes && <p className="mt-0.5 line-clamp-2 text-xs font-light text-muted-foreground">{idea.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="p-5 border-t border-border/50 bg-card shrink-0 sm:justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {keptSlotCount} {keptSlotCount === 1 ? "slot" : "slots"}, {keptIdeaCount} {keptIdeaCount === 1 ? "idea" : "ideas"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProposal(null)}
                  className="text-muted-foreground gap-1.5 h-8"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start over
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                  Cancel
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applyPlan.isPending || keptSlotCount + keptIdeaCount === 0}
                  className="rounded-full gap-2 px-6"
                >
                  {applyPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  Add to calendar
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
