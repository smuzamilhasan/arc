import { useEffect } from "react";
import {
  useCreatePost,
  useUpdatePost,
  getListPostsQueryKey,
} from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

export const POST_PLATFORMS = ["linkedin", "twitter", "instagram", "blog", "other"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

export const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  platform: z.enum(POST_PLATFORMS),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduledAt: z.string().optional(),
});

export type PostFormValues = z.infer<typeof postSchema>;

// A `datetime-local` input expects `yyyy-MM-ddTHH:mm`. Stored scheduledAt values
// are ISO strings (often with seconds / timezone), so normalize before binding.
function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

// The single source of truth for composing / editing a post. Both the Content
// library and the Content Calendar mount this so the form, validation, and
// persistence stay identical no matter where editing starts.
export function PostEditorDialog({
  open,
  onOpenChange,
  post,
  initialScheduledAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The post being edited, or null/undefined when composing a new one.
  post?: Post | null;
  // Prefill the schedule date when creating a new post (e.g. from a calendar day).
  initialScheduledAt?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: "",
      content: "",
      platform: "linkedin",
      status: "draft",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (post) {
      form.reset({
        title: post.title,
        content: post.content,
        platform: post.platform as PostPlatform,
        status: post.status as PostFormValues["status"],
        scheduledAt: toDateTimeLocal(post.scheduledAt),
      });
    } else {
      form.reset({
        title: "",
        content: "",
        platform: "linkedin",
        status: initialScheduledAt ? "scheduled" : "draft",
        scheduledAt: initialScheduledAt ? toDateTimeLocal(initialScheduledAt) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post, initialScheduledAt]);

  const onSubmit = (data: PostFormValues) => {
    if (post) {
      updatePost.mutate(
        { id: post.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post updated", description: "Changes have been saved." });
            onOpenChange(false);
          },
          onError: () => toast({ title: "Error updating post", variant: "destructive" }),
        },
      );
    } else {
      createPost.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post created", description: "New content added to your library." });
            onOpenChange(false);
          },
          onError: () => toast({ title: "Error creating post", variant: "destructive" }),
        },
      );
    }
  };

  const saving = createPost.isPending || updatePost.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden border-border/50 rounded-xl shadow-2xl">
        <DialogHeader className="p-8 pb-4 border-b border-border/50 shrink-0 bg-card">
          <DialogTitle className="font-serif text-3xl font-normal">
            {post ? "Edit Post" : "Compose Post"}
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2 rounded-full px-8 bg-primary hover:bg-primary/90 h-11">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {post ? "Save Changes" : "Save to Library"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
