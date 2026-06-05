import { useMemo, useState } from "react";
import {
  useListPosts,
  getListPostsQueryKey,
  getListIdeasQueryKey,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
} from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  Plus,
  Download,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportPostsCsv, exportPostsIcs } from "@/lib/export-plan";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { groupPostsByDay } from "@/lib/calendar";
import { LockedPanel } from "@/components/locked-panel";
import { PostEditorDialog } from "@/components/post-editor";
import { ShareMenu } from "@/components/share-menu";
import { BatchScheduleDialog, PlannerDialog } from "@/components/scheduling-dialogs";

// Color coding per platform, kept consistent between the legend and the cards.
const PLATFORM_STYLES: Record<
  string,
  { label: string; dot: string; card: string }
> = {
  linkedin: {
    label: "LinkedIn",
    dot: "bg-sky-500",
    card: "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20",
  },
  twitter: {
    label: "X (Twitter)",
    dot: "bg-slate-700",
    card: "border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20",
  },
  instagram: {
    label: "Instagram",
    dot: "bg-pink-500",
    card: "border-pink-500/30 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20",
  },
  blog: {
    label: "Blog",
    dot: "bg-emerald-500",
    card: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
  },
  other: {
    label: "Other",
    dot: "bg-amber-500",
    card: "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20",
  },
};

function platformStyle(platform: string) {
  return PLATFORM_STYLES[platform] ?? PLATFORM_STYLES.other;
}

// All known platform keys, in legend order.
const PLATFORM_KEYS = Object.keys(PLATFORM_STYLES);

// Map any post platform onto a known key (unknown values fall back to "other").
function normalizePlatform(platform: string) {
  return PLATFORM_STYLES[platform] ? platform : "other";
}

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarView = "month" | "week" | "day";

function FilterBar({
  selectedPlatforms,
  selectedStatuses,
  onTogglePlatform,
  onToggleStatus,
  onReset,
}: {
  selectedPlatforms: Set<string>;
  selectedStatuses: Set<string>;
  onTogglePlatform: (key: string) => void;
  onToggleStatus: (key: string) => void;
  onReset: () => void;
}) {
  const isFiltered =
    selectedPlatforms.size !== PLATFORM_KEYS.length ||
    selectedStatuses.size !== STATUS_OPTIONS.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-x-8 sm:gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Platforms
          </span>
          {PLATFORM_KEYS.map((key) => {
            const style = PLATFORM_STYLES[key];
            const active = selectedPlatforms.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onTogglePlatform(key)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-border bg-background text-foreground"
                    : "border-transparent bg-transparent text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-opacity",
                    style.dot,
                    active ? "opacity-100" : "opacity-30",
                  )}
                />
                {style.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Status
          </span>
          {STATUS_OPTIONS.map(({ key, label }) => {
            const active = selectedStatuses.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleStatus(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-transparent bg-transparent text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 self-start rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          Reset filters
        </Button>
      )}
    </div>
  );
}

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const style = platformStyle(post.platform);
  return (
    <div
      className={cn(
        "group/card relative flex w-full items-center gap-1.5 rounded-md border pl-2 pr-1 text-[11px] font-medium leading-tight transition-colors",
        style.card,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={post.title}
        className="flex flex-1 items-center gap-1.5 overflow-hidden py-1 text-left"
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
        <span className="truncate">{post.title}</span>
      </button>
      <ShareMenu
        post={post}
        align="start"
        className="h-5 w-5 shrink-0 opacity-0 focus-within:opacity-100 group-hover/card:opacity-100 [&_svg]:h-3 [&_svg]:w-3"
      />
    </div>
  );
}

// A richer card used in week/day views where there is room for the time + platform.
function PostRow({ post, onClick }: { post: Post; onClick: () => void }) {
  const style = platformStyle(post.platform);
  const at = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const time = at && !Number.isNaN(at.getTime()) ? format(at, "h:mm a") : null;
  return (
    <div
      className={cn(
        "group/row relative flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 transition-colors",
        style.card,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={post.title}
        className="flex flex-col gap-1 text-left"
      >
        <div className="flex items-center gap-1.5 pr-7">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
          <span className="truncate text-xs font-semibold leading-tight">{post.title}</span>
        </div>
        <div className="flex items-center gap-2 pl-3 text-[10px] font-medium uppercase tracking-wide opacity-80">
          <span>{style.label}</span>
          {time && (
            <>
              <span aria-hidden>·</span>
              <span className="normal-case tracking-normal">{time}</span>
            </>
          )}
        </div>
      </button>
      <div className="absolute right-1 top-1">
        <ShareMenu post={post} className="h-7 w-7 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100" />
      </div>
    </div>
  );
}

function AddButton({
  day,
  onAddPost,
  className,
}: {
  day: Date;
  onAddPost: (day: Date) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Add post on ${format(day, "MMMM d")}`}
      onClick={() => onAddPost(day)}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function MonthDayCell({
  day,
  monthCursor,
  posts,
  onPostClick,
  onAddPost,
}: {
  day: Date;
  monthCursor: Date;
  posts: Post[];
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const inMonth = isSameMonth(day, monthCursor);
  const today = isToday(day);

  return (
    <div
      className={cn(
        "group relative flex min-h-[7rem] flex-col gap-1 border-b border-r border-border/50 p-1.5 transition-colors",
        inMonth ? "bg-background" : "bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
            today
              ? "bg-primary text-primary-foreground"
              : inMonth
                ? "text-foreground"
                : "text-muted-foreground/50",
          )}
        >
          {format(day, "d")}
        </span>
        <AddButton
          day={day}
          onAddPost={onAddPost}
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        />
      </div>
      <div className="flex flex-col gap-1 overflow-hidden">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onClick={() => onPostClick(post)} />
        ))}
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  postsByDay,
  onPostClick,
  onAddPost,
}: {
  cursor: Date;
  postsByDay: Map<string, Post[]>;
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor));
    const gridEnd = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor]);

  return (
    <div className="overflow-hidden rounded-xl border-l border-t border-border/50 bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border/50 bg-secondary/30">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="border-r border-border/50 px-2 py-2 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <MonthDayCell
            key={day.toISOString()}
            day={day}
            monthCursor={cursor}
            posts={postsByDay.get(format(day, "yyyy-MM-dd")) ?? []}
            onPostClick={onPostClick}
            onAddPost={onAddPost}
          />
        ))}
      </div>
    </div>
  );
}

function WeekView({
  cursor,
  postsByDay,
  onPostClick,
  onAddPost,
}: {
  cursor: Date;
  postsByDay: Map<string, Post[]>;
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(cursor);
    return eachDayOfInterval({ start, end: endOfWeek(cursor) });
  }, [cursor]);

  return (
    <div className="overflow-hidden rounded-xl border-l border-t border-border/50 bg-card shadow-sm">
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const today = isToday(day);
          const posts = postsByDay.get(format(day, "yyyy-MM-dd")) ?? [];
          return (
            <div
              key={day.toISOString()}
              className="group flex min-h-[24rem] flex-col border-b border-r border-border/50"
            >
              <div
                className={cn(
                  "flex items-center justify-between border-b border-border/50 px-2 py-2",
                  today ? "bg-primary/5" : "bg-secondary/30",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      today ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
                <AddButton
                  day={day}
                  onAddPost={onAddPost}
                  className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                {posts.length === 0 ? (
                  <span className="px-1 py-2 text-[11px] font-light text-muted-foreground/50">
                    No posts
                  </span>
                ) : (
                  posts.map((post) => (
                    <PostRow key={post.id} post={post} onClick={() => onPostClick(post)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  cursor,
  postsByDay,
  onPostClick,
  onAddPost,
}: {
  cursor: Date;
  postsByDay: Map<string, Post[]>;
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const posts = postsByDay.get(format(cursor, "yyyy-MM-dd")) ?? [];
  const today = isToday(cursor);

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
      <div
        className={cn(
          "flex items-center justify-between border-b border-border/50 px-4 py-3",
          today ? "bg-primary/5" : "bg-secondary/30",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
              today ? "bg-primary text-primary-foreground" : "text-foreground",
            )}
          >
            {format(cursor, "d")}
          </span>
          <span className="text-sm font-medium text-foreground">{format(cursor, "EEEE")}</span>
          {today && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Today
            </span>
          )}
        </div>
        <AddButton day={cursor} onAddPost={onAddPost} />
      </div>
      <div className="flex flex-col gap-2 p-4">
        {posts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-light text-muted-foreground">
              Nothing scheduled for this day.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2 rounded-full"
              onClick={() => onAddPost(cursor)}
            >
              <Plus className="h-4 w-4" />
              Add a post
            </Button>
          </div>
        ) : (
          posts.map((post) => (
            <PostRow key={post.id} post={post} onClick={() => onPostClick(post)} />
          ))
        )}
      </div>
    </div>
  );
}

function CalendarBoard({
  posts,
  onPostClick,
  onAddPost,
}: {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  // Filters default to "show everything" so the calendar is unfiltered on load.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    () => new Set(PLATFORM_KEYS),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    () => new Set(STATUS_OPTIONS.map((s) => s.key)),
  );

  const togglePlatform = (key: string) =>
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleStatus = (key: string) =>
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const resetFilters = () => {
    setSelectedPlatforms(new Set(PLATFORM_KEYS));
    setSelectedStatuses(new Set(STATUS_OPTIONS.map((s) => s.key)));
  };

  // Apply the active platform/status filters before laying posts on the grid.
  const filteredPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          selectedPlatforms.has(normalizePlatform(p.platform)) &&
          selectedStatuses.has(p.status),
      ),
    [posts, selectedPlatforms, selectedStatuses],
  );

  // Group the filtered scheduled posts by calendar day for quick lookup per cell.
  const postsByDay = useMemo(() => groupPostsByDay(filteredPosts), [filteredPosts]);

  // Scheduled posts in the data vs. those visible after filtering, so we can
  // tell "nothing scheduled" apart from "everything is filtered out".
  const totalScheduledCount = useMemo(
    () => posts.filter((p) => p.scheduledAt).length,
    [posts],
  );
  const visibleScheduledCount = useMemo(
    () => filteredPosts.filter((p) => p.scheduledAt).length,
    [filteredPosts],
  );

  // The label + navigation step both depend on the active view.
  const title = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy");
    if (view === "day") return format(cursor, "EEEE, MMMM d, yyyy");
    const start = startOfWeek(cursor);
    const end = endOfWeek(cursor);
    if (isSameMonth(start, end)) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [view, cursor]);

  const step = (dir: 1 | -1) => {
    setCursor((c) => {
      if (view === "month") return addMonths(c, dir);
      if (view === "week") return addWeeks(c, dir);
      return addDays(c, dir);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="font-serif text-2xl tracking-tight text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as CalendarView)}
            className="rounded-full border border-border/50 bg-card p-1"
          >
            <ToggleGroupItem
              value="month"
              aria-label="Month view"
              className="h-7 rounded-full px-4 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Month
            </ToggleGroupItem>
            <ToggleGroupItem
              value="week"
              aria-label="Week view"
              className="h-7 rounded-full px-4 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Week
            </ToggleGroupItem>
            <ToggleGroupItem
              value="day"
              aria-label="Day view"
              className="h-7 rounded-full px-4 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Day
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label={`Previous ${view}`}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-full px-4"
              onClick={() => setCursor(startOfDay(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label={`Next ${view}`}
              onClick={() => step(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <FilterBar
        selectedPlatforms={selectedPlatforms}
        selectedStatuses={selectedStatuses}
        onTogglePlatform={togglePlatform}
        onToggleStatus={toggleStatus}
        onReset={resetFilters}
      />

      {view === "month" && (
        <MonthView
          cursor={cursor}
          postsByDay={postsByDay}
          onPostClick={onPostClick}
          onAddPost={onAddPost}
        />
      )}
      {view === "week" && (
        <WeekView
          cursor={cursor}
          postsByDay={postsByDay}
          onPostClick={onPostClick}
          onAddPost={onAddPost}
        />
      )}
      {view === "day" && (
        <DayView
          cursor={cursor}
          postsByDay={postsByDay}
          onPostClick={onPostClick}
          onAddPost={onAddPost}
        />
      )}

      {visibleScheduledCount === 0 &&
        (totalScheduledCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/5 text-primary">
              <CalendarDays className="h-7 w-7" />
            </div>
            <h3 className="font-serif text-xl text-foreground">Nothing scheduled yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-light text-muted-foreground">
              Posts with a scheduled date appear here. Open a post in your Content library and set it
              to scheduled, or use the plus on any day to add one.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/5 text-primary">
              <CalendarDays className="h-7 w-7" />
            </div>
            <h3 className="font-serif text-xl text-foreground">No posts match your filters</h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-light text-muted-foreground">
              Try selecting more platforms or statuses to see your scheduled posts.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-5 rounded-full px-4"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          </div>
        ))}
    </div>
  );
}

export default function Calendar() {
  const queryClient = useQueryClient();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [newPostDate, setNewPostDate] = useState<string | undefined>(undefined);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const { data: platformStrategy, isLoading: isPlatformsLoading } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });

  const gateCtx = { client, hasPlatformStrategy: Boolean(platformStrategy) };
  const unlocked = isPanelUnlocked("content", gateCtx);

  const { data: posts = [], isLoading: isPostsLoading } = useListPosts(undefined, {
    query: { queryKey: getListPostsQueryKey(), enabled: unlocked },
  });

  const handlePostClick = (post: Post) => {
    setEditingPost(post);
    setNewPostDate(undefined);
    setIsEditorOpen(true);
  };

  const handleAddPost = (day: Date) => {
    setEditingPost(null);
    // Default new posts to 9am on the chosen day.
    const at = new Date(day);
    at.setHours(9, 0, 0, 0);
    setNewPostDate(at.toISOString());
    setIsEditorOpen(true);
  };

  const schedulablePosts = posts.filter((p) => p.status !== "published");

  if (isClientLoading || isPlatformsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <LockedPanel
        title="Content Calendar"
        description="Your content calendar opens alongside the Content panel. Finish the sections below and it unlocks on its own."
        prerequisites={panelGatePrerequisites("content", gateCtx)}
      />
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Content Calendar</p>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Plan your content</h1>
          <p className="text-lg font-light leading-relaxed text-muted-foreground">
            See how your scheduled posts spread across platforms and time. Switch between month, week,
            and day views, and click any post to edit it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsGenerateOpen(true)}
            className="rounded-full gap-2 h-11 px-5"
          >
            <Wand2 className="w-4 h-4" /> Generate calendar
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsPlanOpen(true)}
            disabled={schedulablePosts.length === 0}
            className="rounded-full gap-2 h-11 px-5"
          >
            <CalendarClock className="w-4 h-4" /> Plan schedule
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={posts.length === 0}
                className="rounded-full gap-2 h-11 px-5"
              >
                <Download className="w-4 h-4" /> Export plan
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportPostsCsv(posts)}>
                Download CSV (spreadsheet)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPostsIcs(posts)}>
                Download ICS (calendar)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isPostsLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <CalendarBoard posts={posts} onPostClick={handlePostClick} onAddPost={handleAddPost} />
      )}

      <BatchScheduleDialog
        open={isPlanOpen}
        onOpenChange={setIsPlanOpen}
        posts={schedulablePosts}
      />

      <PlannerDialog
        open={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
          setIsGenerateOpen(false);
        }}
      />

      <PostEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        post={editingPost}
        initialScheduledAt={newPostDate}
      />
    </div>
  );
}
