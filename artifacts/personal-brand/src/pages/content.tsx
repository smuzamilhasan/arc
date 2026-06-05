import { useCallback, useEffect, useRef, useState } from "react";
import {
  useListPosts,
  useDeletePost,
  useUpdatePost,
  useScheduleBatchPosts,
  getListPostsQueryKey,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetContentStrategy,
  getGetContentStrategyQueryKey,
  useGenerateContentStrategy,
  useGenerateContentPlan,
  useApplyContentPlan,
  getListIdeasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  Search,
  FileText,
  Sparkles,
  RotateCcw,
  Repeat2,
  Layers,
  GraduationCap,
  BarChart3,
  Flame,
  BookOpen,
  Users,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Lightbulb,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Post, ContentStrategy, ContentMixItem, ContentPlanProposal, PlannedSlot, PlannedIdea } from "@workspace/api-client-react";
import { PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { rescheduleToDay, shiftByDays } from "@/lib/schedule";
import { GenerateGate } from "@/components/locked-panel";
import { PostEditorDialog } from "@/components/post-editor";
import { GhostwriterDialog, type GhostwriterPrefill } from "@/components/ghostwriter-dialog";
import { ContentModeToggle, type ContentMode } from "@/components/content-mode-toggle";
import { useLocation, useSearch } from "wouter";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function mixIcon(type: string) {
  const t = type.toLowerCase();
  if (t.startsWith("educ")) return GraduationCap;
  if (t.startsWith("anal")) return BarChart3;
  if (t.startsWith("opin")) return Flame;
  if (t.startsWith("stor")) return BookOpen;
  if (t.startsWith("comm")) return Users;
  return Layers;
}

function StrategyDashboard({
  strategy,
  onRegenerate,
  regenerating,
}: {
  strategy: ContentStrategy;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Content Strategy
          </p>
          <h2 className="font-serif text-3xl tracking-tight text-foreground">
            Your publishing engine
          </h2>
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

      {/* Posting cadence per platform */}
      {strategy.platformPlan.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-xl text-foreground">Posting cadence</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {strategy.platformPlan.map((p, i) => (
              <Card key={i} className="border-border/50 bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="font-serif text-lg font-normal">{p.platform}</CardTitle>
                    {p.frequency && (
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full border-primary/20 bg-primary/5 text-primary"
                      >
                        {p.frequency}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.focus && (
                    <p className="text-sm font-light leading-relaxed text-foreground/90">{p.focus}</p>
                  )}
                  {p.formats.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {p.formats.map((f, j) => (
                        <Chip key={j}>{f}</Chip>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Content mix */}
      {strategy.contentMix.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-xl text-foreground">Content mix</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategy.contentMix.map((m: ContentMixItem, i: number) => {
              const Icon = mixIcon(m.type);
              return (
                <Card key={i} className="flex flex-col border-border/50 bg-card shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <CardTitle className="font-serif text-lg font-normal">{m.type}</CardTitle>
                      </div>
                      {m.weight && (
                        <span className="text-sm font-medium text-primary">{m.weight}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    {m.description && (
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {m.description}
                      </p>
                    )}
                    {m.whyForClient && (
                      <p className="text-xs font-light italic leading-relaxed text-muted-foreground">
                        {m.whyForClient}
                      </p>
                    )}
                    {m.exampleTopics.length > 0 && (
                      <ul className="space-y-1.5 pt-1">
                        {m.exampleTopics.map((t, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm font-light">
                            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Content systems */}
      {(strategy.signatureSeries.length > 0 || strategy.postFormats.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Repeat2 className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-xl text-foreground">Content systems</h3>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {strategy.signatureSeries.length > 0 && (
              <Card className="border-border/50 bg-card shadow-sm">
                <CardHeader className="mb-2 border-b border-border/50 pb-4">
                  <CardTitle className="font-serif text-lg font-normal">Signature series</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 pt-2">
                  {strategy.signatureSeries.map((s, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-serif text-base text-foreground">{s.name}</h4>
                        {s.cadence && (
                          <span className="text-xs uppercase tracking-widest text-muted-foreground">
                            {s.cadence}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {s.description}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {strategy.postFormats.length > 0 && (
              <Card className="border-border/50 bg-card shadow-sm">
                <CardHeader className="mb-2 border-b border-border/50 pb-4">
                  <CardTitle className="font-serif text-lg font-normal">Repeatable formats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 pt-2">
                  {strategy.postFormats.map((f, i) => (
                    <div key={i} className="space-y-1">
                      <h4 className="font-serif text-base text-foreground">{f.name}</h4>
                      <p className="text-sm font-light leading-relaxed text-foreground/90">
                        {f.description}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Repurposing */}
      {strategy.repurposing && (
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Repeat2 className="h-5 w-5 text-primary" />
              <CardTitle className="font-serif text-lg font-normal">Repurposing flow</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-light leading-relaxed text-foreground/90">
              {strategy.repurposing}
            </p>
          </CardContent>
        </Card>
      )}

      {strategy.closing && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
          <p className="mx-auto max-w-2xl font-serif text-xl font-normal italic leading-relaxed text-foreground">
            {strategy.closing}
          </p>
        </div>
      )}
    </div>
  );
}

function ContentLibrary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<number | null>(null);
  const [view, setView] = useState<"library" | "calendar">("library");
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [planStartDate, setPlanStartDate] = useState("");
  const [planInterval, setPlanInterval] = useState("1");
  const [planTime, setPlanTime] = useState("09:00");
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isGhostwriterOpen, setIsGhostwriterOpen] = useState(false);
  const [ghostwriterPrefill, setGhostwriterPrefill] = useState<GhostwriterPrefill | undefined>(undefined);
  const search = useSearch();
  const [, navigate] = useLocation();

  // Open the Ghostwriter prefilled when arriving from the Idea Bank via
  // /content?draftIdea=<id>&draftTitle=<title>. Strip the params afterward so a
  // refresh or back-navigation doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const draftIdea = params.get("draftIdea");
    if (!draftIdea) return;
    const id = Number(draftIdea);
    if (!Number.isFinite(id)) return;
    const title = params.get("draftTitle") ?? undefined;
    const platform = params.get("draftPlatform") ?? undefined;
    setGhostwriterPrefill({
      ideaId: id,
      ideaTitle: title,
      platform: platform as GhostwriterPrefill["platform"],
    });
    setIsGhostwriterOpen(true);
    navigate("/content", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openGhostwriter = () => {
    setGhostwriterPrefill(undefined);
    setIsGhostwriterOpen(true);
  };

  // Always load the full library (unfiltered) so the calendar and the batch
  // planner see every post regardless of the active filters.
  const { data: posts = [], isLoading } = useListPosts(undefined, {
    query: { queryKey: getListPostsQueryKey() },
  });

  const deletePost = useDeletePost();
  const updatePost = useUpdatePost();
  const scheduleBatch = useScheduleBatchPosts();

  const filteredPosts = posts.filter((post) => {
    if (platformFilter !== "all" && post.platform !== platformFilter) return false;
    if (statusFilter !== "all" && post.status !== statusFilter) return false;
    const q = searchQuery.toLowerCase();
    return post.title.toLowerCase().includes(q) || post.content.toLowerCase().includes(q);
  });

  const scheduledPosts = posts
    .filter((p) => p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

  const schedulablePosts = posts.filter((p) => p.status !== "published");

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

  const openPlanner = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setPlanStartDate(`${yyyy}-${mm}-${dd}`);
    setPlanInterval("1");
    setPlanTime("09:00");
    setSelectedIds(schedulablePosts.filter((p) => p.status === "draft").map((p) => p.id));
    setIsPlanOpen(true);
  };

  const handleScheduleBatch = () => {
    if (selectedIds.length === 0 || !planStartDate) return;
    // Schedule in the order the posts appear in the library list.
    const orderedIds = schedulablePosts
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
          setIsPlanOpen(false);
          setSelectedIds([]);
          setView("calendar");
        },
        onError: () =>
          toast({ title: "Could not schedule posts", variant: "destructive" }),
      },
    );
  };

  // Move a single post to a different calendar day, preserving its time of day.
  const handleReschedule = (post: Post, newDayKey: string) => {
    if (!post.scheduledAt) return;
    const nextIso = rescheduleToDay(post.scheduledAt, newDayKey);
    if (nextIso === null) return;
    const newDate = new Date(nextIso);
    updatePost.mutate(
      { id: post.id, data: { scheduledAt: nextIso } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          toast({
            title: "Post rescheduled",
            description: `Moved to ${format(newDate, "EEEE, MMM d")}.`,
          });
        },
        onError: () =>
          toast({ title: "Could not reschedule post", variant: "destructive" }),
      },
    );
  };

  // Shift every post on a given day forward/back by a number of days.
  const handleShiftDay = async (
    dayPosts: Post[],
    deltaDays: number,
  ) => {
    const movable = dayPosts.filter((p) => p.scheduledAt);
    if (movable.length === 0 || deltaDays === 0) return;
    try {
      await Promise.all(
        movable.map((post) =>
          updatePost.mutateAsync({
            id: post.id,
            data: { scheduledAt: shiftByDays(post.scheduledAt!, deltaDays) },
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      const direction = deltaDays > 0 ? "later" : "earlier";
      const magnitude = Math.abs(deltaDays);
      toast({
        title: "Day rescheduled",
        description: `${movable.length} ${movable.length === 1 ? "post" : "posts"} moved ${magnitude} ${magnitude === 1 ? "day" : "days"} ${direction}.`,
      });
    } catch {
      toast({ title: "Could not shift posts", variant: "destructive" });
    }
  };


  const handleOpenEditor = (post?: Post) => {
    setEditingPost(post ?? null);
    setIsEditorOpen(true);
  };

  const handleDelete = () => {
    if (postToDelete) {
      deletePost.mutate(
        { id: postToDelete },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post deleted" });
            setIsDeleteDialogOpen(false);
            setPostToDelete(null);
          },
          onError: () => toast({ title: "Error deleting post", variant: "destructive" })
        }
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'published': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'scheduled': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground border-border/50';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <header className="space-y-2">
          <h2 className="text-3xl font-serif text-foreground tracking-tight">Content Library</h2>
          <p className="text-muted-foreground text-lg font-light">Draft, schedule, and publish your ideas.</p>
        </header>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center rounded-full border border-border/50 bg-card/50 p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("library")}
              className={`gap-1.5 rounded-full px-4 ${view === "library" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Library
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("calendar")}
              className={`gap-1.5 rounded-full px-4 ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsGenerateOpen(true)}
            className="rounded-full gap-2 h-11 px-5"
          >
            <Wand2 className="w-4 h-4" /> Generate calendar
          </Button>
          <Button
            variant="outline"
            onClick={openPlanner}
            disabled={schedulablePosts.length === 0}
            className="rounded-full gap-2 h-11 px-5"
          >
            <CalendarClock className="w-4 h-4" /> Plan schedule
          </Button>
          <Button
            variant="outline"
            onClick={openGhostwriter}
            className="rounded-full gap-2 h-11 px-5 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
          >
            <Sparkles className="w-4 h-4" /> Ghostwriter
          </Button>
          <Button onClick={() => handleOpenEditor()} className="rounded-full bg-primary hover:bg-primary/90 gap-2 h-11 px-6 shadow-sm">
            <Plus className="w-4 h-4" /> New Post
          </Button>
        </div>
      </div>

      {view === "calendar" ? (
        <ScheduleCalendar
          posts={scheduledPosts}
          isLoading={isLoading}
          onSelect={handleOpenEditor}
          onPlan={openPlanner}
          canPlan={schedulablePosts.length > 0}
          onReschedule={handleReschedule}
          onShiftDay={handleShiftDay}
          isUpdating={updatePost.isPending}
        />
      ) : (
      <>
      <div className="flex flex-col md:flex-row gap-4 items-center bg-card/50 backdrop-blur-sm p-4 rounded-xl border border-border/50 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            className="pl-11 h-11 bg-background border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto shrink-0">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-full md:w-[160px] h-11 bg-background border-border/50">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="twitter">X (Twitter)</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="blog">Blog</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[160px] h-11 bg-background border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-24 bg-card/30 rounded-xl border border-border/50 border-dashed">
          <div className="bg-primary/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-serif mb-2 text-foreground">A blank canvas</h3>
          <p className="text-muted-foreground font-light max-w-md mx-auto mb-8">
            {searchQuery || platformFilter !== "all" || statusFilter !== "all"
              ? "No posts match your current filters."
              : "Your content library is empty. Start translating your narrative into posts."}
          </p>
          {(searchQuery || platformFilter !== "all" || statusFilter !== "all") ? (
            <Button variant="outline" className="rounded-full" onClick={() => {
              setSearchQuery("");
              setPlatformFilter("all");
              setStatusFilter("all");
            }}>
              Clear Filters
            </Button>
          ) : (
            <Button onClick={() => handleOpenEditor()} className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 px-6">
              Write First Post <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map(post => (
            <Card key={post.id} className="flex flex-col border-border/50 shadow-sm hover:shadow-md transition-all group bg-card hover:border-primary/20 cursor-pointer" onClick={() => handleOpenEditor(post)}>
              <CardHeader className="pb-4 pt-6 px-6">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className={`capitalize border ${getStatusColor(post.status)} px-2.5 py-0.5 rounded-full font-medium text-[10px] tracking-wider`}>
                    {post.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-widest">
                    {post.platform}
                  </span>
                </div>
                <CardTitle className="font-serif text-xl line-clamp-2 leading-tight group-hover:text-primary transition-colors">{post.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between px-6 pb-6">
                <p className="text-muted-foreground text-sm line-clamp-3 mb-6 font-light leading-relaxed">
                  {post.content}
                </p>
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    {post.scheduledAt ? (
                      <>
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {format(new Date(post.scheduledAt), "MMM d, yyyy")}
                      </>
                    ) : (
                      <span>Updated {format(new Date(post.updatedAt), "MMM d")}</span>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => {
                      e.stopPropagation();
                      setPostToDelete(post.id);
                      setIsDeleteDialogOpen(true);
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>
      )}

      {/* Editor Dialog */}
      <PostEditorDialog open={isEditorOpen} onOpenChange={setIsEditorOpen} post={editingPost} />

      {/* Ghostwriter Dialog */}
      <GhostwriterDialog open={isGhostwriterOpen} onOpenChange={setIsGhostwriterOpen} prefill={ghostwriterPrefill} />

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md border-border/50 rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Delete Post</DialogTitle>
            <DialogDescription className="text-base font-light">
              Are you sure you want to delete this post? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-full">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePost.isPending} className="rounded-full gap-2 px-6">
              {deletePost.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch schedule planner */}
      <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
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
              {schedulablePosts.length === 0 ? (
                <p className="text-sm text-muted-foreground font-light py-8 text-center">
                  No draft or scheduled posts available to plan.
                </p>
              ) : (
                schedulablePosts.map((post) => {
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
                <Button variant="ghost" onClick={() => setIsPlanOpen(false)} className="text-muted-foreground">
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

      {/* AI content calendar planner */}
      <PlannerDialog
        open={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
          setIsGenerateOpen(false);
          setView("calendar");
        }}
      />
    </div>
  );
}

function PlannerDialog({
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

function ScheduleCalendar({
  posts,
  isLoading,
  onSelect,
  onPlan,
  canPlan,
  onReschedule,
  onShiftDay,
  isUpdating,
}: {
  posts: Post[];
  isLoading: boolean;
  onSelect: (post: Post) => void;
  onPlan: () => void;
  canPlan: boolean;
  onReschedule: (post: Post, newDayKey: string) => void;
  onShiftDay: (dayPosts: Post[], deltaDays: number) => void;
  isUpdating: boolean;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-24 bg-card/30 rounded-xl border border-border/50 border-dashed">
        <div className="bg-primary/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
          <CalendarDays className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-serif mb-2 text-foreground">Nothing scheduled yet</h3>
        <p className="text-muted-foreground font-light max-w-md mx-auto mb-8">
          Lay out a batch of drafts across the next days or weeks to turn your content plan into a real schedule.
        </p>
        {canPlan && (
          <Button onClick={onPlan} className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 px-6">
            <CalendarClock className="w-4 h-4" /> Plan schedule
          </Button>
        )}
      </div>
    );
  }

  // Group scheduled posts by calendar day.
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const key = format(new Date(post.scheduledAt!), "yyyy-MM-dd");
    const list = groups.get(key) ?? [];
    list.push(post);
    groups.set(key, list);
  }
  const orderedDays = Array.from(groups.keys()).sort();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "scheduled":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      default:
        return "bg-muted text-muted-foreground border-border/50";
    }
  };

  return (
    <div className="space-y-8">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
        Drag a post onto another day to reschedule it, or shift a whole day with the arrows.
      </p>
      {orderedDays.map((day) => {
        const dayDate = new Date(`${day}T00:00:00`);
        const dayPosts = groups.get(day)!;
        const isDropTarget = dragOverDay === day;
        return (
          <div key={day} className="relative pl-6">
            <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="absolute left-[4.5px] top-4 bottom-0 w-px bg-border/60" />
            <div className="mb-3 flex items-center gap-3">
              <h3 className="font-serif text-xl text-foreground">{format(dayDate, "EEEE, MMM d")}</h3>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {dayPosts.length} {dayPosts.length === 1 ? "post" : "posts"}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isUpdating}
                  onClick={() => onShiftDay(dayPosts, -1)}
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  title="Shift this day one day earlier"
                  aria-label="Shift this day one day earlier"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isUpdating}
                  onClick={() => onShiftDay(dayPosts, 1)}
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  title="Shift this day one day later"
                  aria-label="Shift this day one day later"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverDay !== day) setDragOverDay(day);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverDay((prev) => (prev === day ? null : prev));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                const post = posts.find((p) => p.id === id);
                setDragOverDay(null);
                setDraggingId(null);
                if (post) onReschedule(post, day);
              }}
              className={`grid grid-cols-1 gap-3 rounded-xl sm:grid-cols-2 lg:grid-cols-3 ${
                isDropTarget
                  ? "outline-dashed outline-2 outline-primary/40 outline-offset-4"
                  : ""
              }`}
            >
              {dayPosts.map((post) => (
                <Card
                  key={post.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(post.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(post.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverDay(null);
                  }}
                  onClick={() => onSelect(post)}
                  className={`group cursor-pointer border-border/50 bg-card shadow-sm transition-all hover:border-primary/20 hover:shadow-md ${
                    draggingId === post.id ? "opacity-40" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground active:cursor-grabbing" />
                        <CalendarClock className="h-3.5 w-3.5" />
                        {format(new Date(post.scheduledAt!), "h:mm a")}
                      </span>
                      <Badge
                        variant="outline"
                        className={`capitalize border ${getStatusColor(post.status)} rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wider`}
                      >
                        {post.status}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 font-serif text-base leading-tight text-foreground">{post.title}</p>
                    <span className="mt-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      {post.platform}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tracks, per client, the strategy `updatedAt` the user has already viewed.
// When a regeneration changes `updatedAt` and the user hasn't opened the
// Strategy view since, `unseen` is true so the toggle can show a dot. The
// last-seen value lives in localStorage (no backend "seen" tracking).
function useStrategySeen(
  clientId: number | undefined,
  updatedAt: string | undefined,
) {
  const storageKey = clientId ? `arc:strategy-seen:${clientId}` : null;
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setSeenAt(null);
      return;
    }
    try {
      setSeenAt(localStorage.getItem(storageKey));
    } catch {
      setSeenAt(null);
    }
  }, [storageKey]);

  const markSeen = useCallback(() => {
    if (!storageKey || !updatedAt) return;
    try {
      localStorage.setItem(storageKey, updatedAt);
    } catch {
      // Ignore storage failures (private mode / quota); the dot just persists.
    }
    setSeenAt(updatedAt);
  }, [storageKey, updatedAt]);

  const unseen = Boolean(updatedAt) && seenAt !== updatedAt;
  return { unseen, markSeen };
}

function ContentShell({ mode }: { mode: ContentMode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [autoGenFailed, setAutoGenFailed] = useState(false);
  const autoGenAttempted = useRef(false);

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const { data: platformStrategy, isLoading: isPlatformsLoading } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });
  const { data: strategy, isLoading: isStrategyLoading } = useGetContentStrategy({
    query: { queryKey: getGetContentStrategyQueryKey(), retry: false },
  });

  const generateStrategy = useGenerateContentStrategy();

  const { unseen: strategyUnseen, markSeen } = useStrategySeen(
    client?.id,
    strategy?.updatedAt,
  );

  // While the user is on the Strategy view, record the current strategy as seen
  // so the toggle dot clears and stays cleared until the next regeneration.
  useEffect(() => {
    if (mode === "strategy" && strategy?.updatedAt) markSeen();
  }, [mode, strategy?.updatedAt, markSeen]);

  const gateCtx = { client, hasPlatformStrategy: Boolean(platformStrategy) };
  const platformsReady = isPanelUnlocked("content", gateCtx);

  const runGenerate = (isAuto: boolean, feedback?: string) => {
    generateStrategy.mutate(
      { data: feedback ? { feedback } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetContentStrategyQueryKey() });
          if (!isAuto) toast({ title: "Content strategy generated" });
        },
        onError: () => {
          if (isAuto) setAutoGenFailed(true);
          toast({
            title: "Could not generate content strategy",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const { requestFeedback, dialog } = useRegenerateFeedback({
    title: "Refine your content strategy",
    description:
      "Optionally tell the AI what to change before it regenerates your content strategy. Leave blank to regenerate as before.",
  });

  const handleRegenerate = () =>
    requestFeedback(Boolean(strategy), (fb) => runGenerate(false, fb));

  const canAutoGenerate = platformsReady && !strategy && !autoGenFailed;

  // Auto-generate the strategy the first time the panel unlocks.
  useEffect(() => {
    if (autoGenAttempted.current) return;
    if (isClientLoading || isPlatformsLoading || isStrategyLoading) return;
    if (!canAutoGenerate) return;
    autoGenAttempted.current = true;
    runGenerate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoGenerate, isClientLoading, isPlatformsLoading, isStrategyLoading]);

  if (isClientLoading || isPlatformsLoading || isStrategyLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  // Locked: blueprint and/or platform strategy not yet complete. Surface the
  // prerequisite checklist right at the generate action instead of a separate
  // locked panel.
  if (!platformsReady) {
    return (
      <GenerateGate
        title={PANEL_GATES.content.title}
        description="Your Blueprint and platform strategy are ready. Generate a tailored content strategy."
        lockedDescription={PANEL_GATES.content.description}
        prerequisites={panelGatePrerequisites("content", gateCtx)}
        onGenerate={() => runGenerate(false)}
        generating={generateStrategy.isPending}
      />
    );
  }

  // Unlocked, generating the first strategy with nothing stored yet.
  if (generateStrategy.isPending && !strategy) {
    return (
      <div className="mx-auto mt-20 max-w-2xl space-y-8 text-center animate-in fade-in duration-1000">
        <div className="relative mx-auto mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-primary/10 bg-primary/5 text-primary">
          <Sparkles className="h-10 w-10 animate-pulse" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary"
            style={{ animationDuration: "4s" }}
          />
        </div>
        <h2 className="font-serif text-3xl tracking-tight">Designing your content engine</h2>
        <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
          arc is translating your Blueprint and platform strategy into a concrete content strategy:
          cadence, content mix, and repeatable systems. This takes about 15-30 seconds.
        </p>
      </div>
    );
  }

  // Unlocked but generation failed and nothing stored yet.
  if (!strategy) {
    return (
      <GenerateGate
        title={PANEL_GATES.content.title}
        description="Your Blueprint and platform strategy are ready. Generate a tailored content strategy."
        lockedDescription={PANEL_GATES.content.description}
        prerequisites={panelGatePrerequisites("content", gateCtx)}
        onGenerate={() => runGenerate(false)}
        generating={generateStrategy.isPending}
      />
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <ContentModeToggle active={mode} strategyUnseen={strategyUnseen} />
      {mode === "strategy" ? (
        <StrategyDashboard
          strategy={strategy}
          onRegenerate={handleRegenerate}
          regenerating={generateStrategy.isPending}
        />
      ) : (
        <ContentLibrary />
      )}
      {dialog}
    </div>
  );
}

export default function Content() {
  return <ContentShell mode="create" />;
}

export function ContentStrategyPage() {
  return <ContentShell mode="strategy" />;
}
