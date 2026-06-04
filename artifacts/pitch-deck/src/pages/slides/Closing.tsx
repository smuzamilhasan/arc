import { Lockup } from "@/components/ArcMark";

export default function Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg font-body">
      <svg
        className="absolute left-1/2 -translate-x-1/2 bottom-[-30vh] w-[70vw] h-[70vw] text-primary/[0.12]"
        viewBox="0 0 100 64"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 58 A46 46 0 0 1 96 58"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M2 62 H98"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col justify-between px-[8vw] py-[8vh]">
        <div className="flex items-center justify-between">
          <span className="text-[1.3vw] uppercase tracking-[0.36em] text-primary font-medium">
            Personal Brand Strategy
          </span>
          <span className="text-[1.2vw] tracking-[0.25em] text-bg/60">07 / 07</span>
        </div>

        <div className="relative z-10 max-w-[74vw]">
          <Lockup className="text-[9vw] mb-[4vh]" wordClassName="text-bg" />
          <h2 className="font-display text-[5vw] leading-[1] tracking-tight text-balance text-bg">
            Tell your story on purpose.
          </h2>
          <p className="mt-[3vh] text-[1.9vw] leading-relaxed text-bg/75 max-w-[52vw] text-pretty">
            Audit how you show up across search and AI, then build the narrative
            and content to own it.
          </p>
        </div>

        <div className="relative z-10 text-[1.4vw] text-bg/70 tracking-[0.2em]">
          arc — personal brand strategy
        </div>
      </div>
    </div>
  );
}
