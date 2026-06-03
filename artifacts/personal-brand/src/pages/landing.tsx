import { Link } from "wouter";
import { CornerDownRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <header className="flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-end gap-1">
          <span className="font-serif text-3xl tracking-tight text-foreground">arc</span>
          <CornerDownRight className="w-5 h-5 text-primary mb-1 stroke-[2.5]" />
        </div>
        <Link href="/sign-in">
          <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-300">
            Sign in
          </button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl animate-in fade-in duration-700 slide-in-from-bottom-4">
          <span className="text-xs font-medium text-primary tracking-widest uppercase">
            Personal brand strategy
          </span>
          <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-foreground mt-6 leading-[1.05]">
            Shape the story
            <br />
            people find.
          </h1>
          <p className="text-lg text-muted-foreground mt-8 max-w-xl mx-auto leading-relaxed">
            arc audits how you show up across search and AI models, synthesizes
            your positioning, and turns it into a content strategy built around
            who you actually are.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link href="/sign-up">
              <button className="w-full sm:w-auto px-8 py-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-300 shadow-sm">
                Get started
              </button>
            </Link>
            <Link href="/sign-in">
              <button className="w-full sm:w-auto px-8 py-3 rounded-md border border-border text-foreground text-sm font-medium hover:bg-secondary/40 transition-colors duration-300">
                Sign in
              </button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-12 py-8 text-center">
        <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">
          arc — story arc
        </span>
      </footer>
    </div>
  );
}
