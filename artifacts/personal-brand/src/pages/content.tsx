import { useEffect, useRef, useState } from "react";
import {
  useListPosts,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  getListPostsQueryKey,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetContentStrategy,
  getGetContentStrategyQueryKey,
  useGenerateContentStrategy,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  CalendarClock,
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { Post, ContentStrategy, ContentMixItem } from "@workspace/api-client-react";
import { PANEL_GATES, panelGatePrerequisites, isPanelUnlocked } from "@/lib/blueprint";
import { GenerateGate } from "@/components/locked-panel";

const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  platform: z.enum(["linkedin", "twitter", "instagram", "blog", "other"]),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduledAt: z.string().optional(),
});

type PostFormValues = z.infer<typeof postSchema>;

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

  const { data: posts = [], isLoading } = useListPosts({
    platform: platformFilter !== "all" ? platformFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  }, {
    query: { queryKey: getListPostsQueryKey({ platform: platformFilter !== "all" ? platformFilter : undefined, status: statusFilter !== "all" ? statusFilter : undefined }) }
  });

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: "",
      content: "",
      platform: "linkedin",
      status: "draft",
    },
  });

  const filteredPosts = posts.filter(post =>
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenEditor = (post?: Post) => {
    if (post) {
      setEditingPost(post);
      form.reset({
        title: post.title,
        content: post.content,
        platform: post.platform,
        status: post.status,
        scheduledAt: post.scheduledAt || undefined,
      });
    } else {
      setEditingPost(null);
      form.reset({
        title: "",
        content: "",
        platform: "linkedin",
        status: "draft",
      });
    }
    setIsEditorOpen(true);
  };

  const onSubmit = (data: PostFormValues) => {
    if (editingPost) {
      updatePost.mutate(
        { id: editingPost.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post updated", description: "Changes have been saved." });
            setIsEditorOpen(false);
          },
          onError: () => toast({ title: "Error updating post", variant: "destructive" })
        }
      );
    } else {
      createPost.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post created", description: "New content added to your library." });
            setIsEditorOpen(false);
          },
          onError: () => toast({ title: "Error creating post", variant: "destructive" })
        }
      );
    }
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
        <Button onClick={() => handleOpenEditor()} className="shrink-0 rounded-full bg-primary hover:bg-primary/90 gap-2 h-11 px-6 shadow-sm">
          <Plus className="w-4 h-4" /> New Post
        </Button>
      </div>

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

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden border-border/50 rounded-xl shadow-2xl">
          <DialogHeader className="p-8 pb-4 border-b border-border/50 shrink-0 bg-card">
            <DialogTitle className="font-serif text-3xl font-normal">
              {editingPost ? "Edit Post" : "Compose Post"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">The Hook / Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Grab their attention..." className="text-xl font-serif h-14 bg-card border-border/50 px-4 placeholder:font-sans placeholder:font-light" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Platform</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-card border-border/50">
                              <SelectValue placeholder="Select platform" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="linkedin">LinkedIn</SelectItem>
                            <SelectItem value="twitter">X (Twitter)</SelectItem>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="blog">Blog</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-card border-border/50">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("status") === "scheduled" && (
                    <FormField
                      control={form.control}
                      name="scheduledAt"
                      render={({ field }) => (
                        <FormItem className="animate-in fade-in zoom-in-95 duration-200">
                          <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Schedule Date</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" className="h-11 bg-card border-border/50" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem className="flex-1 flex flex-col min-h-[300px]">
                      <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">The Content</FormLabel>
                      <FormControl className="flex-1">
                        <Textarea
                          placeholder="Tell the story..."
                          className="flex-1 resize-none bg-card border-border/50 p-4 text-base leading-relaxed font-light focus-visible:ring-primary/20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="p-6 border-t border-border/50 bg-card shrink-0 flex justify-between items-center">
                <Button type="button" variant="ghost" onClick={() => setIsEditorOpen(false)} className="text-muted-foreground hover:text-foreground">
                  Cancel
                </Button>
                <Button type="submit" disabled={createPost.isPending || updatePost.isPending} className="gap-2 rounded-full px-8 bg-primary hover:bg-primary/90 h-11">
                  {(createPost.isPending || updatePost.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPost ? "Save Changes" : "Save to Library"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

export default function Content() {
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

  const gateCtx = { client, hasPlatformStrategy: Boolean(platformStrategy) };
  const platformsReady = isPanelUnlocked("content", gateCtx);

  const runGenerate = (isAuto: boolean) => {
    generateStrategy.mutate(undefined, {
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
    });
  };

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
    <div className="space-y-14 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <StrategyDashboard
        strategy={strategy}
        onRegenerate={() => runGenerate(false)}
        regenerating={generateStrategy.isPending}
      />
      <div className="border-t border-border/50 pt-12">
        <ContentLibrary />
      </div>
    </div>
  );
}
