import { AssistantChat } from "@/components/assistant-chat";

export default function Assistant() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-12rem)]">
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight text-foreground">Strategist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Talk through your brand. Your strategist sees your full profile, narrative, and
          content, and proposes changes you confirm before anything is saved.
        </p>
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-background">
        <AssistantChat />
      </div>
    </div>
  );
}
