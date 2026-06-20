import { cn } from "@/lib/utils";

/**
 * The arc glyph — a Bone arc rising left→right to a glowing Aurora-jade node.
 * For favicon / app-icon / avatar contexts only — never beside the wordmark in
 * a product lockup (brand rule). The product logo is the wordmark below.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="12 34 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="arc."
    >
      <circle cx="92" cy="52" r="13" fill="#2BE0A0" opacity="0.22" />
      <path
        d="M24 84 A50 50 0 0 1 92 52"
        fill="none"
        stroke="currentColor"
        strokeWidth={8.5}
        strokeLinecap="round"
      />
      <circle cx="92" cy="52" r="7.5" fill="#2BE0A0" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
};

/**
 * The product logo — the geometric `arc.` wordmark, standing alone (the `c` is
 * an open arc, so the wordmark already *is* the arc; the green period is the
 * Aurora spark). No glyph in the lockup. Strokes inherit `currentColor` (Bone
 * on the dark canvas); scales with font-size so existing `text-*` sizing holds.
 */
export function Logo({ className, markClassName }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center leading-none text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 28 272 84"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("h-[0.62em] w-auto", markClassName)}
        role="img"
        aria-label="arc."
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="40" cy="70" r="32" />
          <line x1="72" y1="40" x2="72" y2="102" />
          <line x1="104" y1="38" x2="104" y2="102" />
          <path d="M104 56 Q104 40 126 40" />
          <path d="M210 50 A32 32 0 1 0 210 90" />
        </g>
        <circle cx="250" cy="94" r="12" fill="#2BE0A0" />
      </svg>
    </span>
  );
}
