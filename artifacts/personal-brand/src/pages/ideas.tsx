import { useState } from "react";
import { useListIdeas, useCreateIdea, useUpdateIdea, useDeleteIdea, getListIdeasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Lightbulb, Trash2, Edit2, ArrowRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { Idea } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useLocation } from "wouter";

const ideaSchema = z.object({
  title: z.string().min(1, "Title is required"),
  notes: z.string().optional(),
  platform: z.string().optional().or(z.literal("")),
});

type IdeaFormValues = z.infer<typeof ideaSchema>;

export default function Ideas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ideaToDelete, setIdeaToDelete] = useState<number | null>(null);

  const { data: ideas = [], isLoading } = useListIdeas({
    query: { queryKey: getListIdeasQueryKey() }
  });

  const createIdea = useCreateIdea();
  const updateIdea = useUpdateIdea();
  const deleteIdea = useDeleteIdea();

  const form = useForm<IdeaFormValues>({
    resolver: zodResolver(ideaSchema),
    defaultValues: {
      title: "",
      notes: "",
      platform: "",
    },
  });

  const handleOpenEditor = (idea?: Idea) => {
    if (idea) {
      setEditingIdea(idea);
      form.reset({
        title: idea.title,
        notes: idea.notes || "",
        platform: idea.platform || "",
      });
    } else {
      setEditingIdea(null);
      form.reset({
        title: "",
        notes: "",
        platform: "",
      });
    }
    setIsEditorOpen(true);
  };

  const onSubmit = (data: IdeaFormValues) => {
    if (editingIdea) {
      updateIdea.mutate(
        { id: editingIdea.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
            toast({ title: "Idea updated" });
            setIsEditorOpen(false);
          },
          onError: () => toast({ title: "Error updating idea", variant: "destructive" })
        }
      );
    } else {
      createIdea.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
            toast({ title: "Idea captured", description: "Saved to your bank." });
            setIsEditorOpen(false);
          },
          onError: () => toast({ title: "Error capturing idea", variant: "destructive" })
        }
      );
    }
  };

  const handleDelete = () => {
    if (ideaToDelete) {
      deleteIdea.mutate(
        { id: ideaToDelete },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListIdeasQueryKey() });
            toast({ title: "Idea discarded" });
            setIsDeleteDialogOpen(false);
            setIdeaToDelete(null);
          },
          onError: () => toast({ title: "Error removing idea", variant: "destructive" })
        }
      );
    }
  };

  const promoteToPost = (idea: Idea) => {
    // In a real app we'd pass state to the content page
    toast({
      title: "Taking action",
      description: "Feature to turn idea directly into draft coming soon. Moving to Content.",
    });
    setLocation("/content");
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-serif text-foreground tracking-tight">Idea Bank</h1>
          <p className="text-muted-foreground text-lg font-light">Capture sparks of insight before they fade.</p>
        </header>
        <Button onClick={() => handleOpenEditor()} className="shrink-0 rounded-full bg-primary hover:bg-primary/90 gap-2 h-11 px-6 shadow-sm">
          <Plus className="w-4 h-4" /> Capture Idea
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-24 bg-card/30 rounded-xl border border-border/50 border-dashed">
          <div className="bg-primary/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
            <Lightbulb className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-serif mb-2 text-foreground">Waiting for a spark</h3>
          <p className="text-muted-foreground font-light max-w-md mx-auto mb-8">
            The best content strategy starts with a messy collection of observations.
          </p>
          <Button onClick={() => handleOpenEditor()} className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 px-6">
            Log First Idea <Plus className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {ideas.map(idea => (
            <Card key={idea.id} className="flex flex-col border-border/50 shadow-sm hover:shadow-md transition-all group bg-card hover:border-primary/20 cursor-pointer" onClick={() => handleOpenEditor(idea)}>
              <CardHeader className="p-6 pb-2">
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[10px] uppercase font-medium tracking-widest px-2 py-0.5 rounded-sm ${idea.platform ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {idea.platform || "General"}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => {
                      e.stopPropagation();
                      setIdeaToDelete(idea.id);
                      setIsDeleteDialogOpen(true);
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="font-serif text-xl leading-tight line-clamp-3 group-hover:text-primary transition-colors">{idea.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-3 flex-1">
                {idea.notes ? (
                  <p className="text-sm text-muted-foreground line-clamp-4 font-light leading-relaxed">{idea.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic opacity-40 font-light">No additional notes.</p>
                )}
              </CardContent>
              <CardFooter className="p-6 pt-4 flex items-center justify-between border-t border-border/50 bg-background/30 mt-auto">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest">
                  {format(new Date(idea.createdAt), "MMM d, yyyy")}
                </span>
                <Button variant="ghost" size="sm" className="h-8 px-3 text-primary hover:text-primary hover:bg-primary/5 rounded-full text-xs font-medium gap-1" onClick={(e) => {
                  e.stopPropagation();
                  promoteToPost(idea);
                }}>
                  Use Idea <ArrowRight className="w-3 h-3" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[600px] border-border/50 rounded-xl p-0 overflow-hidden">
          <DialogHeader className="p-8 pb-6 border-b border-border/50 bg-card">
            <DialogTitle className="font-serif text-3xl font-normal">
              {editingIdea ? "Refine Idea" : "New Insight"}
            </DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col">
              <div className="p-8 space-y-8 bg-background">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">The Core Thought</FormLabel>
                      <FormControl>
                        <Input placeholder="A quick one-liner..." className="text-lg font-serif h-14 bg-card border-border/50 px-4 placeholder:font-sans placeholder:font-light" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Rough Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Flesh it out a bit..." 
                          className="min-h-[160px] resize-y bg-card border-border/50 p-4 font-light text-base leading-relaxed focus-visible:ring-primary/20" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Intended Platform (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-card border-border/50">
                            <SelectValue placeholder="Where might this go?" />
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
              </div>
              
              <div className="p-6 border-t border-border/50 bg-card flex justify-between items-center">
                <Button type="button" variant="ghost" onClick={() => setIsEditorOpen(false)} className="text-muted-foreground hover:text-foreground">
                  Cancel
                </Button>
                <Button type="submit" disabled={createIdea.isPending || updateIdea.isPending} className="gap-2 rounded-full px-8 bg-primary hover:bg-primary/90 h-11">
                  {(createIdea.isPending || updateIdea.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingIdea ? "Save Updates" : "Save to Bank"}
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
            <DialogTitle className="font-serif text-2xl">Discard Idea</DialogTitle>
            <DialogDescription className="text-base font-light">
              Are you sure you want to throw this away?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-full">Keep it</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteIdea.isPending} className="rounded-full gap-2 px-6">
              {deleteIdea.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
