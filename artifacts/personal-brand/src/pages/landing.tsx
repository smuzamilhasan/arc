import { Link } from "wouter";
import { Logo } from "@/components/logo";
import { setSignupIntent } from "@/lib/active-client";
import {
  Search,
  BookOpen,
  Compass,
  FileText,
  Lightbulb,
  ArrowRight,
  Sparkles,
  Globe,
  Bot,
  Target,
  Layers,
  PenLine,
  Quote,
} from "lucide-react";
import heroSignal from "@/assets/images/hero-signal.png";
import noiseImg from "@/assets/images/noise.png";
import narrativeImg from "@/assets/images/narrative.png";
import influenceImg from "@/assets/images/influence.png";

function HeaderCtas() {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link href="/sign-in">
        <button
          onClick={() => setSignupIntent("individual")}
          className="px-3 sm:px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-300"
        >
          Sign in
        </button>
      </Link>
      <Link href="/sign-up">
        <button
          onClick={() => setSignupIntent("agency")}
          className="hidden sm:inline-flex px-3 sm:px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-300"
        >
          For agencies
        </button>
      </Link>
      <Link href="/sign-up">
        <button
          onClick={() => setSignupIntent("individual")}
          className="px-4 sm:px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-300 shadow-sm"
        >
          Get started
        </button>
      </Link>
    </div>
  );
}

const beliefs = [
  {
    eyebrow: "The shift",
    title: "When anyone can publish, sameness wins by default.",
    body: "AI made creating effortless, and the feeds show it: endless, interchangeable content with no point of view. Volume is no longer the edge. The scarce, valuable thing is a person worth listening to.",
    points: [
      "Building is cheap; attention is not.",
      "Generic content blends into the noise.",
      "A real point of view is the new moat.",
    ],
    image: noiseImg,
    imageAlt:
      "A grid of identical speech bubbles with a single distinct one outlined in persimmon, standing out from the sameness.",
    flip: false,
  },
  {
    eyebrow: "What we believe",
    title: "Positioning is a thinking problem, not a posting problem.",
    body: "In the age of AI it matters more than ever to think mindfully and critically about how you show up. arc helps you take control of your human story and shape positioning that is elegant, sustainable, and unmistakably yours, instead of chasing the algorithm.",
    points: [
      "Own your narrative before you scale it.",
      "Build a brand that lasts, not a viral moment.",
      "Clarity that holds up over years, not days.",
    ],
    image: narrativeImg,
    imageAlt:
      "Scattered marks gathered by a single flowing line into the calm silhouette of a human profile.",
    flip: true,
  },
  {
    eyebrow: "Why it compounds",
    title: "Influence is the distribution you'll wish you had built.",
    body: "Whatever you create now or in the future is far easier to sell when you already hold influence in your niche. arc gives you a holistic plan, online and in the real world, to steadily build the authority, distribution, and scale your career needs to grow.",
    points: [
      "A plan that spans online and offline.",
      "Authority you build deliberately, week by week.",
      "Distribution that's ready before you need it.",
    ],
    image: influenceImg,
    imageAlt:
      "Concentric ripples radiating from a single persimmon node out to a network of online and real-world connections.",
    flip: false,
  },
];

const flow = [
  {
    step: "01",
    icon: Search,
    title: "Audit your presence",
    body: "arc searches Google and interviews leading AI models to score exactly how visible and accurate you are today.",
  },
  {
    step: "02",
    icon: BookOpen,
    title: "Synthesize your narrative",
    body: "A guided point-of-view interview distills who you are into clear positioning, themes, and a voice that's unmistakably yours.",
  },
  {
    step: "03",
    icon: Compass,
    title: "Build the Blueprint",
    body: "Turn your story into a strategy: the pillars, platforms, and priorities that decide where and how you show up, online and off.",
  },
  {
    step: "04",
    icon: FileText,
    title: "Create the content",
    body: "Generate posts and a running stream of ideas, each one drawn from your narrative instead of generic templates.",
  },
];

const features = [
  {
    icon: Globe,
    label: "SEO audit",
    title: "How Google sees you",
    body: "A real, web-grounded scan of your search footprint, scored 0-100 with concrete findings and the gaps worth closing first.",
  },
  {
    icon: Bot,
    label: "GEO audit",
    title: "How AI models know you",
    body: "We ask the major models who you are and grade each answer against live web context: right person, wrong person, or nothing at all.",
  },
  {
    icon: Target,
    label: "Narrative",
    title: "Positioning with a point of view",
    body: "Your achievements, beliefs, and history synthesized into a sharp narrative and the themes that carry it everywhere.",
  },
  {
    icon: Layers,
    label: "Blueprint",
    title: "A strategy, not a checklist",
    body: "A structured plan across pillars and platforms so every decision about your brand traces back to a deliberate choice.",
  },
  {
    icon: PenLine,
    label: "Content",
    title: "Posts built from your story",
    body: "Draft, refine, and organize content by platform, all anchored to the voice and positioning arc helped you define.",
  },
  {
    icon: Lightbulb,
    label: "Ideas",
    title: "A running stream of angles",
    body: "Never face a blank page. arc keeps a steady supply of on-brand ideas ready to turn into your next post.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-10 py-4">
          <Logo className="text-2xl sm:text-3xl" />
          <HeaderCtas />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-60"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.10), transparent 70%)",
            }}
            aria-hidden="true"
          />
          <div className="max-w-6xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-16 md:pb-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="animate-in fade-in duration-700 slide-in-from-bottom-4 text-center lg:text-left">
                <span className="inline-block text-xs font-medium text-primary tracking-[0.2em] uppercase">
                  Personal brand strategy for the age of AI
                </span>
                <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl tracking-tight text-foreground mt-6 leading-[1.04]">
                  Anyone can build now.
                  <br />
                  The rare thing is
                  <br />
                  being heard.
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mt-7 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  AI made creating effortless, and the feeds are drowning in
                  sameness. arc helps you think clearly about your positioning,
                  take ownership of your human story, and build real influence in
                  your niche, online and off.
                </p>
                <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 mt-9">
                  <Link href="/sign-up">
                    <button
                      onClick={() => setSignupIntent("individual")}
                      className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-300 shadow-sm"
                    >
                      Get started
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </Link>
                  <Link href="/sign-up">
                    <button
                      onClick={() => setSignupIntent("agency")}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-secondary/40 transition-colors duration-300"
                    >
                      For agencies
                    </button>
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground mt-6 tracking-wide">
                  Individuals and agencies. One strategy each, end to end.
                </p>
              </div>

              <div className="relative animate-in fade-in duration-1000 slide-in-from-bottom-8">
                <div
                  className="pointer-events-none absolute -inset-6 -z-10 opacity-70"
                  style={{
                    background:
                      "radial-gradient(60% 60% at 70% 40%, hsl(var(--primary) / 0.10), transparent 70%)",
                  }}
                  aria-hidden="true"
                />
                <img
                  src={heroSignal}
                  alt="A tangle of chaotic lines on the left resolving into a single confident persimmon arc that rises and clears the noise."
                  className="w-full h-auto rounded-2xl border border-border/60 bg-card shadow-lg"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Narrative belief sections */}
        <section className="border-t border-border/50 bg-card/30">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 md:py-28 space-y-20 md:space-y-28">
            {beliefs.map((b) => (
              <div
                key={b.title}
                className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center"
              >
                <div className={b.flip ? "lg:order-2" : ""}>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
                    {b.eyebrow}
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl xl:text-5xl text-foreground leading-tight">
                    {b.title}
                  </h2>
                  <p className="text-muted-foreground text-lg mt-5 leading-relaxed">
                    {b.body}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {b.points.map((p) => (
                      <li
                        key={p}
                        className="flex items-start gap-3 text-foreground"
                      >
                        <span
                          className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-base leading-relaxed">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={b.flip ? "lg:order-1" : ""}>
                  <img
                    src={b.image}
                    alt={b.imageAlt}
                    className="w-full h-auto rounded-2xl border border-border/60 bg-card shadow-md"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border/50">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
                How it works
              </p>
              <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
                From invisible to unmistakable, in four moves.
              </h2>
              <p className="text-muted-foreground text-lg mt-4">
                arc walks you through the whole arc of a personal brand, each
                step feeding the next.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
              {flow.map((s) => (
                <div
                  key={s.step}
                  className="h-full rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="rounded-full bg-primary/10 p-2.5">
                      <s.icon className="w-5 h-5 text-primary stroke-[1.5]" />
                    </div>
                    <span className="font-serif text-2xl text-muted-foreground/40">
                      {s.step}
                    </span>
                  </div>
                  <h3 className="font-serif text-xl text-foreground">
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="border-t border-border/50 bg-card/30">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
                What's inside
              </p>
              <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
                Everything your story needs, in one place.
              </h2>
              <p className="text-muted-foreground text-lg mt-4">
                A complete toolkit for measuring, shaping, and growing how the
                world perceives you.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="h-full rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:-translate-y-0.5"
                >
                  <div className="rounded-full bg-primary/10 p-2.5 w-fit mb-5">
                    <f.icon className="w-5 h-5 text-primary stroke-[1.5]" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-primary font-medium mb-2">
                    {f.label}
                  </p>
                  <h3 className="font-serif text-2xl text-foreground leading-tight">
                    {f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Philosophy / pull quote */}
        <section className="border-t border-border/50">
          <div className="max-w-4xl mx-auto px-6 md:px-10 py-20 md:py-28 text-center">
            <Quote className="w-8 h-8 text-primary/40 mx-auto mb-6" />
            <p className="font-serif text-3xl md:text-4xl text-foreground leading-snug">
              A personal brand isn't what you say about yourself. It's the story
              the world finds when it looks you up.
            </p>
            <p className="text-sm text-muted-foreground mt-8 tracking-wide">
              arc makes that story deliberate.
            </p>
          </div>
        </section>

        {/* Closing CTA band */}
        <section className="border-t border-border/50">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-20 md:py-28">
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-accent px-8 md:px-16 py-16 md:py-20 text-center">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  background:
                    "radial-gradient(50% 80% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%)",
                }}
                aria-hidden="true"
              />
              <div className="relative">
                <Sparkles className="w-7 h-7 text-primary mx-auto mb-6" />
                <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight max-w-2xl mx-auto">
                  Build influence that outlasts the noise.
                </h2>
                <p className="text-muted-foreground text-lg mt-5 max-w-xl mx-auto">
                  Audit your presence, take control of your narrative, and put a
                  real plan behind your name, online and off.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                  <Link href="/sign-up">
                    <button className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-300 shadow-sm">
                      Get started
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </Link>
                  <Link href="/sign-in">
                    <button className="w-full sm:w-auto px-8 py-3.5 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-secondary/40 transition-colors duration-300">
                      Sign in
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <Logo className="text-xl" />
            <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">
              story arc
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/sign-in">
              <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-300">
                Sign in
              </button>
            </Link>
            <Link href="/sign-up">
              <button className="text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-300">
                Get started
              </button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
