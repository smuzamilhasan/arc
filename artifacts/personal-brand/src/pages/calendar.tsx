import { useMemo, useState } from "react";
import {
  useListPosts,
  getListPostsQueryKey,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
} from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { addMonths, format, isSameMonth, isToday, startOfMonth } from "date-fns";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { buildMonthGrid, groupPostsByDay } from "@/lib/calendar";
import { dayKey } from "@/lib/schedule";
import { LockedPanel } from "@/components/locked-panel";
import { PostEditorDialog } from "@/components/post-editor";

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
    <button
      type="button"
      onClick={onClick}
      title={post.title}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] font-medium leading-tight transition-colors",
        style.card,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      <span className="truncate">{post.title}</span>
    </button>
  );
}

function DayCell({
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
        <button
          type="button"
          aria-label={`Add post on ${format(day, "MMMM d")}`}
          onClick={() => onAddPost(day)}
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-hidden">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onClick={() => onPostClick(post)} />
        ))}
      </div>
    </div>
  );
}

function CalendarGrid({
  posts,
  onPostClick,
  onAddPost,
}: {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onAddPost: (day: Date) => void;
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

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

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl tracking-tight text-foreground">
            {format(monthCursor, "MMMM yyyy")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="Previous month"
            onClick={() => setMonthCursor((c) => startOfMonth(addMonths(c, -1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-full px-4"
            onClick={() => setMonthCursor(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="Next month"
            onClick={() => setMonthCursor((c) => startOfMonth(addMonths(c, 1)))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FilterBar
        selectedPlatforms={selectedPlatforms}
        selectedStatuses={selectedStatuses}
        onTogglePlatform={togglePlatform}
        onToggleStatus={toggleStatus}
        onReset={resetFilters}
      />

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
            <DayCell
              key={day.toISOString()}
              day={day}
              monthCursor={monthCursor}
              posts={postsByDay.get(dayKey(day)) ?? []}
              onPostClick={onPostClick}
              onAddPost={onAddPost}
            />
          ))}
        </div>
      </div>

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
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [newPostDate, setNewPostDate] = useState<string | undefined>(undefined);

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
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Content Calendar</p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">Your month at a glance</h1>
        <p className="text-lg font-light leading-relaxed text-muted-foreground">
          See how your scheduled posts spread across platforms and time. Click any post to edit it.
        </p>
      </header>

      {isPostsLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <CalendarGrid posts={posts} onPostClick={handlePostClick} onAddPost={handleAddPost} />
      )}

      <PostEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        post={editingPost}
        initialScheduledAt={newPostDate}
      />
    </div>
  );
}
