import { ArcMark, Lockup } from "@/components/ArcMark";

export default function Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-body">
      <svg
        className="absolute right-[-10vw] top-[-20vh] w-[58vw] h-[58vw] text-primary/[0.09]"
        viewBox="0 0 100 64"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 58 A46 46 0 0 1 96 58"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M2 62 H98"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col justify-between px-[8vw] py-[8vh]">
        <div className="flex items-center justify-between">
          <span className="text-[1.3vw] uppercase tracking-[0.36em] text-primary font-medium">
            Personal Brand Strategy
          </span>
          <span className="text-[1.3vw] uppercase tracking-[0.3em] text-muted">
            Investor &amp; Client Overview
          </span>
        </div>

        <div className="max-w-[74vw]">
          <Lockup className="text-[8vw] mb-[3vh]" />
          <h1 className="font-display text-[6vw] leading-[0.98] tracking-tight text-balance">
            Own your story across search and AI.
          </h1>
          <p className="mt-[3.5vh] text-[2vw] leading-relaxed text-muted max-w-[54vw] text-pretty">
            arc audits how you show up on Google and inside AI models, then
            builds the narrative and content to take control of it.
          </p>
        </div>

        <div className="flex items-center justify-between text-[1.3vw] text-muted">
          <span className="tracking-[0.2em]">2026</span>
          <span className="inline-flex items-center gap-[0.6vw]">
            <ArcMark className="h-[1.5vw] w-auto text-primary" />
            <span className="font-display text-[1.7vw] text-text">arc</span>
          </span>
        </div>
      </div>
    </div>
  );
}
