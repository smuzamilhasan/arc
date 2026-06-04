export default function Flow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <header className="shrink-0">
        <span className="text-[1.3vw] uppercase tracking-[0.34em] text-primary font-medium">
          The flow
        </span>
        <h2 className="font-display text-[4.6vw] leading-[1] tracking-tight mt-[1.5vh]">
          How arc works
        </h2>
      </header>

      <div className="grid grid-cols-4 gap-[2.5vw] mt-[6vh] flex-1 min-h-0">
        <div className="flex flex-col border-t-[0.35vh] border-primary pt-[2.5vh]">
          <span className="font-display text-[4vw] leading-none text-primary">01</span>
          <h3 className="font-display text-[2.3vw] leading-[1.05] tracking-tight mt-[2.5vh]">
            Onboarding
          </h3>
          <p className="text-[1.4vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            A deep, coach-style intake of your history, work, achievements, and
            goals.
          </p>
        </div>

        <div className="flex flex-col border-t-[0.35vh] border-primary pt-[2.5vh]">
          <span className="font-display text-[4vw] leading-none text-primary">02</span>
          <h3 className="font-display text-[2.3vw] leading-[1.05] tracking-tight mt-[2.5vh]">
            Audit
          </h3>
          <p className="text-[1.4vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            SEO and GEO scored 0–100, each with findings and prioritized
            recommendations.
          </p>
        </div>

        <div className="flex flex-col border-t-[0.35vh] border-primary pt-[2.5vh]">
          <span className="font-display text-[4vw] leading-none text-primary">03</span>
          <h3 className="font-display text-[2.3vw] leading-[1.05] tracking-tight mt-[2.5vh]">
            Narrative
          </h3>
          <p className="text-[1.4vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            A positioning point of view, synthesized into themes and the
            platforms that fit.
          </p>
        </div>

        <div className="flex flex-col border-t-[0.35vh] border-primary pt-[2.5vh]">
          <span className="font-display text-[4vw] leading-none text-primary">04</span>
          <h3 className="font-display text-[2.3vw] leading-[1.05] tracking-tight mt-[2.5vh]">
            Content
          </h3>
          <p className="text-[1.4vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            Posts and ideas that carry the story forward, on a steady cadence.
          </p>
        </div>
      </div>

      <footer className="shrink-0 flex items-end justify-end mt-[4vh]">
        <span className="text-[1.2vw] tracking-[0.25em] text-muted">03 / 07</span>
      </footer>
    </div>
  );
}
