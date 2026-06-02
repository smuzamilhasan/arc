import { useState } from "react";
import { useListIdeas, useCreateIdea, useUpdateIdea, useDeleteIdea, getListIdeasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Lightbulb, Trash2, Edit2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Idea } from "@workspace/api-client-react/src/generated/api.schemas";
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
            toast({ title: "Idea captured" });
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
            toast({ title: "Idea removed" });
            setIsDeleteDialogOpen(false);
            setIdeaToDelete(null);
          },
          onError: () => toast({ title: "Error removing idea", variant: "destructive" })
        }
      );
    }
  };

  const promoteToPost = (idea: Idea) => {
    // In a real implementation we might pass state through routing or a store
    // For now we'll just navigate to content. The user can create a post there.
    toast({
      title: "Navigation",
      description: "Feature to pre-fill post from idea coming soon. Navigating to Content.",
    });
    setLocation("/content");
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <header>
          <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-2 text-primary">Idea Bank</h1>
          <p className="text-muted-foreground text-lg">Capture fleeting thoughts before they disappear.</p>
        </header>
        <Button onClick={() => handleOpenEditor()} className="shrink-0" size="lg">
          <Lightbulb className="w-4 h-4 mr-2" /> Capture Idea
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-24 bg-card rounded-xl border border-border border-dashed shadow-sm">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-serif font-medium mb-2">No ideas yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            The best content starts as a simple observation. Jot down thoughts here and develop them later.
          </p>
          <Button onClick={() => handleOpenEditor()} variant="outline">
            Capture your first idea
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ideas.map(idea => (
            <Card key={idea.id} className="flex flex-col border-border shadow-sm hover:shadow-md transition-shadow group bg-card">
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start mb-1">
                  {idea.platform ? (
                    <span className="text-xs font-medium px-2 py-0.5 bg-secondary text-secondary-foreground rounded uppercase tracking-wider">
                      {idea.platform}
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 bg-muted text-muted-foreground rounded uppercase tracking-wider">
                      General
                    </span>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenEditor(idea)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => {
                      setIdeaToDelete(idea.id);
                      setIsDeleteDialogOpen(true);
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="font-serif text-lg leading-tight line-clamp-2">{idea.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 flex-1">
                {idea.notes ? (
                  <p className="text-sm text-muted-foreground line-clamp-4">{idea.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic opacity-50">No additional notes.</p>
                )}
              </CardContent>
              <CardFooter className="p-4 pt-0 flex items-center justify-between border-t border-border/50 mt-4">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(idea.createdAt), "MMM d, yyyy")}
                </span>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-primary hover:text-primary/80" onClick={() => promoteToPost(idea)}>
                  Draft Post <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {editingIdea ? "Edit Idea" : "Capture Idea"}
            </DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>The Core Idea</FormLabel>
                    <FormControl>
                      <Input placeholder="A quick one-liner..." {...field} />
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
                    <FormLabel>Rough Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Flesh it out a bit..." 
                        className="min-h-[120px] resize-y" 
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
                    <FormLabel>Intended Platform (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Where might this go?" />
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
              
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createIdea.isPending || updateIdea.isPending}>
                  {(createIdea.isPending || updateIdea.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingIdea ? "Save" : "Capture"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Idea</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard this idea?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteIdea.isPending}>
              {deleteIdea.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
