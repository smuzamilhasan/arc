import { useState } from "react";
import { useListPosts, useCreatePost, useUpdatePost, useDeletePost, getListPostsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Calendar as CalendarIcon, Search, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { Post } from "@workspace/api-client-react";

const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  platform: z.enum(["linkedin", "twitter", "instagram", "blog", "other"]),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduledAt: z.string().optional(),
});

type PostFormValues = z.infer<typeof postSchema>;

export default function Content() {
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
    <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-serif text-foreground tracking-tight">Content Library</h1>
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
