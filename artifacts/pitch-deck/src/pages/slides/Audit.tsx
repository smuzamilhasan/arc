export default function Audit() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg font-body flex flex-col px-[8vw] py-[8vh]">
      <svg
        className="absolute left-[-8vw] bottom-[-26vh] w-[46vw] h-[46vw] text-primary/[0.14]"
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

      <header className="shrink-0 relative z-10">
        <span className="text-[1.3vw] uppercase tracking-[0.34em] text-primary font-medium">
          The presence audit
        </span>
        <h2 className="font-display text-[4.6vw] leading-[1] tracking-tight mt-[1.5vh] text-bg">
          Two scores, one full picture
        </h2>
      </header>

      <div className="grid grid-cols-2 gap-[5vw] mt-[6vh] flex-1 min-h-0 relative z-10">
        <div className="flex flex-col">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[8vw] leading-none text-primary">0–100</span>
          </div>
          <span className="text-[1.3vw] uppercase tracking-[0.3em] text-bg/70 font-medium mt-[2vh]">
            SEO · Google Search
          </span>
          <p className="text-[1.7vw] leading-relaxed text-bg/80 mt-[2.5vh] text-pretty">
            Measured against real, live Google results — what ranks, what is
            missing, and what is out of date.
          </p>
        </div>

        <div className="flex flex-col">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[8vw] leading-none text-primary">0–100</span>
          </div>
          <span className="text-[1.3vw] uppercase tracking-[0.3em] text-bg/70 font-medium mt-[2vh]">
            GEO · AI Models
          </span>
          <p className="text-[1.7vw] leading-relaxed text-bg/80 mt-[2.5vh] text-pretty">
            What gpt, Claude, and Gemini say about you, checked strictly against
            current public web facts.
          </p>
        </div>
      </div>

      <footer className="shrink-0 flex items-end justify-between mt-[4vh] relative z-10">
        <p className="text-[1.7vw] leading-snug text-bg/80 max-w-[62vw] text-pretty">
          Every score ships with specific findings and the recommendations to
          move it.
        </p>
        <span className="text-[1.2vw] tracking-[0.25em] text-bg/60">04 / 07</span>
      </footer>
    </div>
  );
}
