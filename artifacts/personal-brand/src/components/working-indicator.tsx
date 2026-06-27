// WorkingIndicator — a "we're cooking" state that keeps moving while the user
// waits: animated jade dots + a caption that rotates through contextual status
// lines ("Reading your posts…", "Drafting in your voice…"), so no one stares at
// a blank panel or a frozen spinner. Animations live in index.css (.work-*).

import { useEffect, useState } from "react";

export function WorkingIndicator({
  messages,
  variant = "block",
  className = "",
}: {
  messages: readonly string[];
  variant?: "inline" | "block";
  className?: string;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
    if (messages.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [messages]);

  const caption = messages[i] ?? messages[0] ?? "Working…";

  const dots = (
    <span className="inline-flex items-end gap-1 pb-0.5" aria-hidden="true">
      <span className="work-dot" />
      <span className="work-dot" />
      <span className="work-dot" />
    </span>
  );

  if (variant === "inline") {
    return (
      <span
        className={"inline-flex items-center gap-2 text-sm text-muted-foreground " + className}
        role="status"
        aria-live="polite"
      >
        {dots}
        <span key={caption} className="work-caption">
          {caption}
        </span>
      </span>
    );
  }

  return (
    <div
      className={"work-shimmer rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-5 " + className}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        {dots}
        <span key={caption} className="work-caption text-sm font-medium text-foreground">
          {caption}
        </span>
      </div>
      <p className="mt-1.5 pl-[1.55rem] text-xs text-muted-foreground">
        Working — this can take a few seconds.
      </p>
    </div>
  );
}

// Curated caption sets per surface. Each line is a small, honest beat of what
// the engine is actually doing.
export const WORK_MESSAGES = {
  draft: [
    "Reading your operating profile…",
    "Pulling your real posts and stories…",
    "Drafting in your voice…",
    "Checking it against your banned words…",
    "Polishing the final lines…",
  ],
  onboarder: [
    "Thinking…",
    "Reading your answer…",
    "Updating your profile…",
    "Finding the next question…",
  ],
  starting: [
    "Reading your profile…",
    "Catching up on your posts…",
    "Preparing your first question…",
  ],
  calibration: [
    "Fetching your posts…",
    "Reading every line…",
    "Finding your signature words…",
    "Mapping your worldview…",
    "Assembling your voice…",
  ],
  capture: ["Saving your answer…", "Updating your profile…", "Finding the next question…"],
  profile: ["Loading your operating profile…", "Gathering everything the engine knows…"],
} as const;
