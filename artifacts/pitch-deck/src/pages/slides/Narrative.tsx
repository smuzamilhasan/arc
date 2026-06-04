export default function Narrative() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <header className="shrink-0">
        <span className="text-[1.3vw] uppercase tracking-[0.34em] text-primary font-medium">
          From insight to output
        </span>
        <h2 className="font-display text-[4.6vw] leading-[1] tracking-tight mt-[1.5vh]">
          From narrative to content
        </h2>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-[3vw] mt-[6vh] flex-1 min-h-0">
        <div className="bg-panel rounded-[1.2vw] p-[3vw] flex flex-col">
          <span className="text-[1.2vw] uppercase tracking-[0.3em] text-muted font-medium">
            The narrative
          </span>
          <h3 className="font-display text-[2.7vw] leading-[1.05] tracking-tight mt-[1.5vh]">
            A point of view worth holding
          </h3>
          <p className="text-[1.6vw] leading-relaxed text-muted mt-[2.5vh] text-pretty">
            Positioning, themes, and platforms — synthesized from your intake
            and a short point-of-view interview.
          </p>
        </div>

        <div className="flex items-center justify-center">
          <span className="font-display text-[5vw] text-primary leading-none">→</span>
        </div>

        <div className="bg-panel rounded-[1.2vw] p-[3vw] flex flex-col">
          <span className="text-[1.2vw] uppercase tracking-[0.3em] text-muted font-medium">
            The content
          </span>
          <h3 className="font-display text-[2.7vw] leading-[1.05] tracking-tight mt-[1.5vh]">
            A story that keeps moving
          </h3>
          <p className="text-[1.6vw] leading-relaxed text-muted mt-[2.5vh] text-pretty">
            Posts and ideas that follow directly from the narrative, so every
            piece reinforces the same arc.
          </p>
        </div>
      </div>

      <footer className="shrink-0 flex items-end justify-end mt-[4vh]">
        <span className="text-[1.2vw] tracking-[0.25em] text-muted">05 / 07</span>
      </footer>
    </div>
  );
}
