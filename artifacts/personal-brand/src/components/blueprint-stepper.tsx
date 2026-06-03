import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlueprintStageView } from "@/lib/blueprint";

// A horizontal "you are here" map of the gated Blueprint journey. Each node is
// a stage; its visual state mirrors the same unlock logic that gates the grid
// below, so the stepper, the next-best-step nudge, and the locked cards always
// agree.
export function BlueprintStepper({ stages }: { stages: BlueprintStageView[] }) {
  return (
    <ol className="flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
      {stages.map((stage, i) => {
        const last = i === stages.length - 1;
        return (
          <li
            key={stage.index}
            className="relative flex items-start gap-3 md:flex-1 md:flex-col md:items-center md:gap-3 md:text-center"
          >
            <div className="flex flex-col items-center md:w-full md:flex-row md:items-center">
              {/* spacer keeps the desktop node centered over its column */}
              <span className="hidden md:block md:flex-1" aria-hidden="true" />
              <StepNode index={i} status={stage.status} />
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "hidden md:block md:h-px md:flex-1",
                    stage.status === "complete" ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>

            {/* vertical connector on mobile */}
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[15px] top-9 h-[calc(100%-12px)] w-px md:hidden",
                  stage.status === "complete" ? "bg-primary" : "bg-border",
                )}
              />
            )}

            <div className="pb-1 md:px-2 md:pb-0">
              <p
                className={cn(
                  "text-[0.65rem] uppercase tracking-[0.18em] font-medium",
                  stage.status === "current"
                    ? "text-primary"
                    : "text-muted-foreground/70",
                )}
              >
                {stage.status === "complete"
                  ? "Complete"
                  : stage.status === "current"
                    ? "You are here"
                    : "Locked"}
              </p>
              <p
                className={cn(
                  "mt-1 font-serif text-sm leading-snug",
                  stage.status === "locked"
                    ? "text-muted-foreground/70"
                    : "text-foreground",
                )}
              >
                {stage.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepNode({
  index,
  status,
}: {
  index: number;
  status: BlueprintStageView["status"];
}) {
  return (
    <span
      className={cn(
        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors",
        status === "complete" &&
          "border-primary bg-primary text-primary-foreground",
        status === "current" &&
          "border-primary bg-accent text-primary ring-4 ring-primary/15",
        status === "locked" &&
          "border-dashed border-border bg-secondary/30 text-muted-foreground/60",
      )}
    >
      {status === "complete" ? (
        <Check className="h-4 w-4 stroke-[2.5]" />
      ) : status === "locked" ? (
        <Lock className="h-3.5 w-3.5" />
      ) : (
        index + 1
      )}
    </span>
  );
}
