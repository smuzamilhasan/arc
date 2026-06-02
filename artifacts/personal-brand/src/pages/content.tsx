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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Calendar as CalendarIcon, Filter, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Post, PostPlatform, PostStatus } from "@workspace/api-client-react/src/generated/api.schemas";

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
            toast({ title: "Post updated" });
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
            toast({ title: "Post created" });
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
      case 'published': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      default: return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <header>
          <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-2 text-primary">Content Library</h1>
          <p className="text-muted-foreground text-lg">Manage your drafts, scheduled posts, and published pieces.</p>
        </header>
        <Button onClick={() => handleOpenEditor()} className="shrink-0" size="lg">
          <Plus className="w-4 h-4 mr-2" /> New Post
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search content..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="blog">Blog</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
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
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border border-dashed">
          <div className="bg-secondary/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Edit2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-serif font-medium mb-2">No posts found</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            {searchQuery || platformFilter !== "all" || statusFilter !== "all" 
              ? "Try adjusting your filters to find what you're looking for."
              : "You haven't created any content yet. Start writing to build your library."}
          </p>
          {(searchQuery || platformFilter !== "all" || statusFilter !== "all") && (
            <Button variant="outline" onClick={() => {
              setSearchQuery("");
              setPlatformFilter("all");
              setStatusFilter("all");
            }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map(post => (
            <Card key={post.id} className="flex flex-col border-border shadow-sm hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={`capitalize border ${getStatusColor(post.status)}`}>
                    {post.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground capitalize font-medium px-2 py-1 bg-secondary rounded-md">
                    {post.platform}
                  </span>
                </div>
                <CardTitle className="font-serif text-xl line-clamp-2 leading-tight">{post.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <p className="text-muted-foreground text-sm line-clamp-3 mb-6">
                  {post.content}
                </p>
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {post.scheduledAt ? (
                      <>
                        <CalendarIcon className="w-3 h-3" />
                        {format(new Date(post.scheduledAt), "MMM d, yyyy")}
                      </>
                    ) : (
                      <span>Updated {format(new Date(post.updatedAt), "MMM d")}</span>
                    )}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditor(post)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
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
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0 bg-background">
            <DialogTitle className="font-serif text-2xl">
              {editingPost ? "Edit Post" : "Create New Post"}
            </DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background/50">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title / Hook</FormLabel>
                      <FormControl>
                        <Input placeholder="A compelling hook for your post..." className="text-lg font-medium" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select platform" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="linkedin">LinkedIn</SelectItem>
                            <SelectItem value="twitter">Twitter</SelectItem>
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
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
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
                        <FormItem>
                          <FormLabel>Schedule Date</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} value={field.value || ""} />
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
                      <FormLabel>Content</FormLabel>
                      <FormControl className="flex-1">
                        <Textarea 
                          placeholder="Write your post here..." 
                          className="flex-1 resize-none font-mono text-sm" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="p-4 border-t border-border bg-card shrink-0 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPost.isPending || updatePost.isPending}>
                  {(createPost.isPending || updatePost.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingPost ? "Save Changes" : "Create Post"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePost.isPending}>
              {deletePost.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
