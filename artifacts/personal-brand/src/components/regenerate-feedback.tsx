import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RunFn = (feedback?: string) => void;

/**
 * Hook that adds an optional "steer this regeneration" step before re-running an
 * AI generation. First-time generation (no prior content) runs immediately with
 * no dialog. When prior content already exists, it opens a dialog asking for
 * optional feedback; an empty/skipped submission preserves the current behavior
 * (the generation runs with no feedback).
 */
export function useRegenerateFeedback(options: {
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const runRef = useRef<RunFn | null>(null);

  const requestFeedback = useCallback((hasExisting: boolean, run: RunFn) => {
    if (!hasExisting) {
      run(undefined);
      return;
    }
    runRef.current = run;
    setFeedback("");
    setOpen(true);
  }, []);

  const submit = useCallback(
    (withFeedback: boolean) => {
      const run = runRef.current;
      setOpen(false);
      const trimmed = feedback.trim();
      run?.(withFeedback && trimmed ? trimmed : undefined);
      runRef.current = null;
    },
    [feedback],
  );

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          runRef.current = null;
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{options.title ?? "Steer this regeneration"}</DialogTitle>
          <DialogDescription>
            {options.description ??
              "Optionally tell the AI what to change before it regenerates. Leave this blank to regenerate as before."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Make it more concise, lead with the audience impact, drop the academic tone..."
          className="min-h-[120px]"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => submit(false)}>
            Skip
          </Button>
          <Button type="button" onClick={() => submit(true)}>
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestFeedback, dialog };
}
