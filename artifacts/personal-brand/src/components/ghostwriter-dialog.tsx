import { useEffect, useState } from "react";
import {
  useDraftPosts,
  useCreatePost,
  useGetNarrative,
  getGetNarrativeQueryKey,
  getListPostsQueryKey,
} from "@workspace/api-client-react";
import type { DraftedPost, DraftPostsInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, RotateCcw, Check, X, PenLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";

type Format = "post" | "hook" | "article";
type Platform = "linkedin" | "twitter" | "instagram" | "blog" | "other";

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: "post", label: "Post", hint: "A complete, ready-to-publish post" },
  { value: "hook", label: "Hooks", hint: "Short scroll-stopping opening lines" },
  { value: "article", label: "Article", hint: "Longer-form essay or article" },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "instagram", label: "Instagram" },
  { value: "blog", label: "Blog" },
  { value: "other", label: "Other" },
];

export type GhostwriterPrefill = {
  ideaId?: number;
  ideaTitle?: string;
  theme?: string;
  platform?: Platform;
  brief?: string;
};

type EditableDraft = DraftedPost & { saved?: boolean };

export function GhostwriterDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: GhostwriterPrefill;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const draftPosts = useDraftPosts();
  const createPost = useCreatePost();
  const { data: narrative } = useGetNarrative({
    query: { queryKey: getGetNarrativeQueryKey(), retry: false },
  });

  const [format, setFormat] = useState<Format>("post");
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [brief, setBrief] = useState("");
  const [theme, setTheme] = useState<string>("");
  const [ideaId, setIdeaId] = useState<number | undefined>(undefined);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);

  const { requestFeedback, dialog: feedbackDialog } = useRegenerateFeedback({
    title: "Steer the Ghostwriter",
    description:
      "Optionally tell the Ghostwriter what to change before it drafts again. Leave blank to redraft as before.",
  });

  // Reset the form to the prefill whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFormat("post");
    setPlatform(prefill?.platform ?? "linkedin");
    setBrief(prefill?.brief ?? "");
    setTheme(prefill?.theme ?? "");
    setIdeaId(prefill?.ideaId);
    setDrafts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.ideaId, prefill?.theme, prefill?.platform, prefill?.brief]);

  const themes = narrative?.themes ?? [];

  const run = (feedback?: string) => {
    const body: DraftPostsInput = {
      format,
      platform,
      brief: brief.trim() || undefined,
      theme: theme.trim() || undefined,
      ideaId,
      feedback,
    };
    draftPosts.mutate(
      { data: body },
      {
        onSuccess: (result) => {
          setDrafts(result.drafts.map((d) => ({ ...d })));
        },
        onError: (err) => {
          const status = (err as { status?: number })?.status;
          toast({
            title: status === 429 ? "Slow down" : "Could not draft",
            description:
              status === 429
                ? "You've reached the drafting limit for now. Please try again later."
                : "The Ghostwriter could not produce a draft. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleGenerate = () => {
    requestFeedback(drafts.length > 0, run);
  };

  const updateDraft = (index: number, patch: Partial<EditableDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const discardDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const saveDraft = (index: number) => {
    const d = drafts[index];
    if (!d || !d.title.trim() || !d.content.trim()) {
      toast({ title: "Add a title and content first", variant: "destructive" });
      return;
    }
    createPost.mutate(
      {
        data: {
          title: d.title.trim(),
          content: d.content.trim(),
          platform,
          status: "draft",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          updateDraft(index, { saved: true });
          toast({ title: "Saved to library", description: "Added as a draft post." });
        },
        onError: () => toast({ title: "Could not save draft", variant: "destructive" }),
      },
    );
  };

  const generating = draftPosts.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[88vh] flex flex-col p-0 overflow-hidden border-border/50 rounded-xl shadow-2xl">
        <DialogHeader className="p-8 pb-4 border-b border-border/50 shrink-0 bg-card">
          <DialogTitle className="font-serif text-3xl font-normal flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> The Ghostwriter
          </DialogTitle>
          <DialogDescription className="text-base font-light">
            Drafts written in your voice from your narrative and profile. Review and edit before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                <SelectTrigger className="h-11 bg-card border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label} — {f.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">Platform</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="h-11 bg-card border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {themes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">
                Anchor to a theme (optional)
              </Label>
              <Select value={theme || "none"} onValueChange={(v) => setTheme(v === "none" ? "" : v)}>
                <SelectTrigger className="h-11 bg-card border-border/50">
                  <SelectValue placeholder="No specific theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific theme</SelectItem>
                  {themes.map((t) => (
                    <SelectItem key={t.title} value={t.title}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {prefill?.ideaTitle && ideaId !== undefined && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Drafting from idea: </span>
              <span className="font-medium text-foreground">{prefill.ideaTitle}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-muted-foreground font-medium text-xs uppercase tracking-widest">
              Brief / topic (optional)
            </Label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What should this be about? An angle, a story, a point to make... Leave blank to let the Ghostwriter choose from your themes."
              className="min-h-[100px] resize-y bg-card border-border/50 p-4 font-light leading-relaxed"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-primary hover:bg-primary/90 gap-2 h-11 px-6"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : drafts.length > 0 ? (
              <RotateCcw className="w-4 h-4" />
            ) : (
              <PenLine className="w-4 h-4" />
            )}
            {generating ? "Writing..." : drafts.length > 0 ? "Redraft" : "Write drafts"}
          </Button>

          {drafts.length > 0 && (
            <div className="space-y-6 pt-2">
              <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Drafts for review
              </h3>
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-5 space-y-3 transition-colors ${
                    d.saved ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card"
                  }`}
                >
                  <Input
                    value={d.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value, saved: false })}
                    placeholder="Title / hook"
                    className="text-lg font-serif h-12 bg-background border-border/50 px-3"
                  />
                  <Textarea
                    value={d.content}
                    onChange={(e) => updateDraft(i, { content: e.target.value, saved: false })}
                    className="min-h-[160px] resize-y bg-background border-border/50 p-3 font-light text-base leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {d.saved ? "Saved to library" : `${d.format} · ${platform}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => discardDraft(i)}
                        className="text-muted-foreground hover:text-destructive gap-1.5 rounded-full"
                      >
                        <X className="w-3.5 h-3.5" /> Discard
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveDraft(i)}
                        disabled={createPost.isPending || d.saved}
                        className="rounded-full gap-1.5 bg-primary hover:bg-primary/90 px-4"
                      >
                        <Check className="w-3.5 h-3.5" /> {d.saved ? "Saved" : "Add to library"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border/50 bg-card shrink-0 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            Done
          </Button>
        </div>
      </DialogContent>
      {feedbackDialog}
    </Dialog>
  );
}
