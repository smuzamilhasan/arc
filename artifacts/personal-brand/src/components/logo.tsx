import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={8} strokeLinecap="round">
        <path d="M10 31 A22 22 0 0 1 54 31" />
        <path d="M8 39 H56" />
      </g>
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  showWord?: boolean;
};

export function Logo({
  className,
  markClassName,
  wordClassName,
  showWord = true,
}: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] font-serif leading-none tracking-tight text-foreground",
        className,
      )}
    >
      <LogoMark className={cn("h-[0.78em] w-auto text-primary", markClassName)} />
      {showWord ? (
        <span className={cn("leading-none", wordClassName)}>arc</span>
      ) : null}
    </span>
  );
}
