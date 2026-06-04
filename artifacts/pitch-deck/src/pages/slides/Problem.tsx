import { ArcMark } from "@/components/ArcMark";

export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <header className="shrink-0">
        <span className="text-[1.3vw] uppercase tracking-[0.34em] text-primary font-medium">
          The problem
        </span>
        <h2 className="font-display text-[4.6vw] leading-[1] tracking-tight mt-[1.5vh]">
          Two surfaces, no strategy
        </h2>
      </header>

      <div className="grid grid-cols-2 gap-[3vw] mt-[5vh] flex-1 min-h-0">
        <div className="bg-panel rounded-[1.2vw] p-[3vw] flex flex-col">
          <ArcMark className="h-[2.6vw] w-auto text-primary" />
          <span className="text-[1.2vw] uppercase tracking-[0.3em] text-muted font-medium mt-[3vh]">
            Google Search · SEO
          </span>
          <h3 className="font-display text-[2.7vw] leading-[1.05] tracking-tight mt-[1.5vh]">
            What surfaces when someone searches your name
          </h3>
          <p className="text-[1.7vw] leading-relaxed text-muted mt-[2.5vh] text-pretty">
            Fragmented, outdated, or empty results — a first impression you
            never chose.
          </p>
        </div>

        <div className="bg-panel rounded-[1.2vw] p-[3vw] flex flex-col">
          <ArcMark className="h-[2.6vw] w-auto text-primary" />
          <span className="text-[1.2vw] uppercase tracking-[0.3em] text-muted font-medium mt-[3vh]">
            AI Models · GEO
          </span>
          <h3 className="font-display text-[2.7vw] leading-[1.05] tracking-tight mt-[1.5vh]">
            What ChatGPT, Claude, and Gemini say about you
          </h3>
          <p className="text-[1.7vw] leading-relaxed text-muted mt-[2.5vh] text-pretty">
            Invented, mistaken, or silent — answers given on your behalf,
            without you in the room.
          </p>
        </div>
      </div>

      <footer className="shrink-0 flex items-end justify-between mt-[4vh]">
        <p className="text-[1.8vw] leading-snug text-text max-w-[60vw] text-pretty">
          Most people have never seen either. Neither has been managed.
        </p>
        <span className="text-[1.2vw] tracking-[0.25em] text-muted">02 / 07</span>
      </footer>
    </div>
  );
}
