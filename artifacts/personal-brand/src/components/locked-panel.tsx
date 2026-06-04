import { Link } from "wouter";
import { Lock, Check, ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { Prerequisite } from "@/lib/blueprint";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The itemized "what's still needed" checklist. Each prerequisite links to where
// it gets completed and shows done/not-done status. This is the single source of
// the locked-state explanation, reused by both the full-page LockedPanel and the
// inline GenerateGate so the experience stays identical everywhere a surface is
// gated.
export function PrerequisiteChecklist({
  prerequisites,
}: {
  prerequisites: Prerequisite[];
}) {
  const remaining = prerequisites.filter((p) => !p.complete).length;

  if (prerequisites.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/80">
          What's still needed
        </h2>
        <span className="text-xs font-medium text-muted-foreground">
          {remaining === 0 ? "All done" : `${remaining} of ${prerequisites.length} left`}
        </span>
      </div>

      <ul className="space-y-2">
        {prerequisites.map((p) => (
          <li key={p.id}>
            <Link href={p.href}>
              <div
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                  p.complete
                    ? "border-border/60 bg-secondary/20"
                    : "border-border hover:border-primary/50 hover:bg-accent",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      p.complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 text-transparent",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        p.complete
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {p.label}
                    </p>
                    {p.detail && !p.complete && (
                      <p className="text-xs text-muted-foreground">{p.detail}</p>
                    )}
                  </div>
                </div>
                {!p.complete && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="border-t border-border/50 pt-3 text-sm text-muted-foreground">
        This panel unlocks automatically once everything above is complete.
      </p>
    </div>
  );
}

// The standard locked state for any gated surface. It explains, in plain terms,
// that the panel is locked, exactly which prerequisites are still outstanding
// (each linking to where it gets completed), and that the panel unlocks on its
// own once everything is done. Reuse this everywhere a panel is gated so the
// experience stays uniform.
export function LockedPanel({
  title,
  description,
  prerequisites,
}: {
  title: string;
  description: string;
  prerequisites: Prerequisite[];
}) {
  return (
    <div className="mx-auto mt-12 max-w-2xl space-y-8 animate-in fade-in duration-700">
      <div className="space-y-6 text-center">
        <div className="relative mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">{title}</h1>
          <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <PrerequisiteChecklist prerequisites={prerequisites} />
    </div>
  );
}

// The action surface for a gated AI generation step. When the prerequisites are
// unmet, the generate button is disabled and the SAME prerequisite checklist
// used by LockedPanel is surfaced inline, right where the user's intent to
// generate is highest. Once everything is complete, the checklist drops away and
// the button activates. This avoids dead-ends at the moment of action.
export function GenerateGate({
  title,
  description,
  lockedDescription,
  prerequisites,
  onGenerate,
  generating,
  buttonLabel = "Generate strategy",
}: {
  title: string;
  description: string;
  // Copy shown while prerequisites are still outstanding. Defaults to description.
  lockedDescription?: string;
  prerequisites: Prerequisite[];
  onGenerate: () => void;
  generating: boolean;
  buttonLabel?: string;
}) {
  const locked = prerequisites.some((p) => !p.complete);

  return (
    <div className="mx-auto mt-12 max-w-2xl space-y-8 animate-in fade-in duration-700">
      <div className="space-y-6 text-center">
        <div
          className={cn(
            "relative mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border",
            locked
              ? "border-border bg-secondary/40 text-muted-foreground"
              : "border-primary/10 bg-primary/5 text-primary",
          )}
        >
          {locked ? <Lock className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">{title}</h1>
          <p className="mx-auto max-w-md text-lg font-light leading-relaxed text-muted-foreground">
            {locked ? (lockedDescription ?? description) : description}
          </p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={locked || generating}
          className="gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {buttonLabel}
        </Button>
      </div>

      {locked && <PrerequisiteChecklist prerequisites={prerequisites} />}
    </div>
  );
}
