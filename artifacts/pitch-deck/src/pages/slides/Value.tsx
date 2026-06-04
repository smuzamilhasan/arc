import { ArcMark } from "@/components/ArcMark";

export default function Value() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <header className="shrink-0">
        <span className="text-[1.3vw] uppercase tracking-[0.34em] text-primary font-medium">
          The value
        </span>
        <h2 className="font-display text-[4.6vw] leading-[1] tracking-tight mt-[1.5vh]">
          Why arc
        </h2>
      </header>

      <div className="grid grid-cols-3 gap-[3vw] mt-[6vh] flex-1 min-h-0">
        <div className="flex flex-col">
          <ArcMark className="h-[2.8vw] w-auto text-primary" />
          <h3 className="font-display text-[2.4vw] leading-[1.05] tracking-tight mt-[3vh]">
            One person, in depth
          </h3>
          <p className="text-[1.5vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            Built around a single individual's story — not a generic dashboard
            stretched across everyone.
          </p>
        </div>

        <div className="flex flex-col">
          <ArcMark className="h-[2.8vw] w-auto text-primary" />
          <h3 className="font-display text-[2.4vw] leading-[1.05] tracking-tight mt-[3vh]">
            Search and AI together
          </h3>
          <p className="text-[1.5vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            SEO and GEO measured side by side — the complete view of how you are
            actually found.
          </p>
        </div>

        <div className="flex flex-col">
          <ArcMark className="h-[2.8vw] w-auto text-primary" />
          <h3 className="font-display text-[2.4vw] leading-[1.05] tracking-tight mt-[3vh]">
            Strategy, not just scores
          </h3>
          <p className="text-[1.5vw] leading-relaxed text-muted mt-[2vh] text-pretty">
            From audit to narrative to a working content engine — one continuous
            arc.
          </p>
        </div>
      </div>

      <footer className="shrink-0 flex items-end justify-end mt-[4vh]">
        <span className="text-[1.2vw] tracking-[0.25em] text-muted">06 / 07</span>
      </footer>
    </div>
  );
}
