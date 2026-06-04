export function ArcMark({ className = "" }: { className?: string }) {
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

type LockupProps = {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
};

export function Lockup({
  className = "",
  markClassName = "",
  wordClassName = "",
}: LockupProps) {
  return (
    <span
      className={`inline-flex items-center gap-[0.26em] font-display leading-none tracking-tight text-text ${className}`}
    >
      <ArcMark className={`h-[0.78em] w-auto text-primary ${markClassName}`} />
      <span className={`leading-none ${wordClassName}`}>arc</span>
    </span>
  );
}
