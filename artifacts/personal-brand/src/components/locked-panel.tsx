import { Link } from "wouter";
import { Lock, Check, ArrowRight } from "lucide-react";
import type { Prerequisite } from "@/lib/blueprint";
import { cn } from "@/lib/utils";

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
  const remaining = prerequisites.filter((p) => !p.complete).length;

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

      {prerequisites.length > 0 && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/80">
              What's still needed
            </h2>
            <span className="text-xs font-medium text-muted-foreground">
              {remaining === 0
                ? "All done"
                : `${remaining} of ${prerequisites.length} left`}
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
      )}
    </div>
  );
}
