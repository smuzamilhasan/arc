// /app/onboard-v2 — the conversational Onboarder.
//
// A chat surface over the v2 Onboarder agent. It opens already informed (the
// voice extractor has pre-filled candidates), asks adaptive questions, and
// fills the structured profile as you answer — no blank forms. A progress bar
// tracks how complete the operating profile is.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";

type Turn = {
  kind: "question" | "patch" | "wrap";
  question_type?: string;
  target_slot?: string;
  prompt_text?: string;
  reason?: string;
  summary?: string;
};

type ChatMsg = { from: "agent" | "you"; text: string; slot?: string };

type StartResp = { sessionId: number; firstTurn: Turn; resumedExisting: boolean };
type AnswerResp =
  | { kind: "next"; sessionId: number; turn: Turn; aggregateConfidence: number }
  | { kind: "wrapped"; sessionId: number; reason: string; aggregateConfidence: number }
  | { kind: "refused"; sessionId: number; reason: string }
  | { kind: "violation"; sessionId: number; details: string }
  | { error: string };

const SLOT_LABELS: Record<string, string> = {
  "positioning.claim": "Positioning",
  "positioning.adjacent_claims_rejected": "What you reject",
  "icp.archetypes": "Ideal audience",
  "worldview.beliefs": "Worldview",
  "voice.confirmation": "Voice",
  anti_examples: "Anti-examples",
  "negative_space.refused_topics": "Negative space",
  "story_bank.confirmation": "Stories",
  "reference_library.confirmation": "References",
};

function slotLabel(slot?: string): string | undefined {
  if (!slot) return undefined;
  return SLOT_LABELS[slot] ?? slot;
}

export default function OnboardV2Page() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function api<T>(url: string, body: unknown): Promise<T> {
    const clientId = getActiveClientId();
    const res = await fetch(`${import.meta.env.BASE_URL}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  // Start (or resume) the session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const start = await api<StartResp & { error?: string }>("api/v2/onboarder/start", {});
        if (cancelled) return;
        if (start.error) {
          setError(start.error);
          return;
        }
        setSessionId(start.sessionId);
        if (start.firstTurn?.prompt_text) {
          setMessages([
            { from: "agent", text: start.firstTurn.prompt_text, slot: start.firstTurn.target_slot },
          ]);
        } else if (start.firstTurn?.kind === "wrap") {
          setDone(start.firstTurn.summary ?? "Your profile is already complete.");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to start");
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const answer = input.trim();
    if (!answer || !sessionId || sending) return;
    setInput("");
    setMessages((m) => [...m, { from: "you", text: answer }]);
    setSending(true);
    setError(null);
    try {
      const resp = await api<AnswerResp>("api/v2/onboarder/answer", { sessionId, answer });
      if ("error" in resp) {
        setError(resp.error);
        return;
      }
      if (resp.kind === "next") {
        setConfidence(resp.aggregateConfidence ?? 0);
        if (resp.turn?.prompt_text) {
          setMessages((m) => [
            ...m,
            { from: "agent", text: resp.turn.prompt_text!, slot: resp.turn.target_slot },
          ]);
        }
      } else if (resp.kind === "wrapped") {
        setConfidence(resp.aggregateConfidence ?? confidence);
        setDone(
          resp.reason === "coverage_complete"
            ? "Your operating profile is complete. The ghostwriter is ready."
            : "Session paused — pick up anytime."
        );
      } else if (resp.kind === "refused") {
        setMessages((m) => [...m, { from: "agent", text: resp.reason }]);
      } else if (resp.kind === "violation") {
        setError(`Something went wrong: ${resp.details}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send");
    } finally {
      setSending(false);
    }
  }

  const pct = Math.round(confidence * 100);

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Build your profile
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          A conversation, not a form. It already read your public posts — now it's filling in the
          parts only you know. Answer naturally; the profile fills as you go.
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Profile completeness</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="min-h-[420px] flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[55vh]">
            {starting && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Reading your profile…
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.from === "you" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed " +
                    (m.from === "you"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground")
                  }
                >
                  {m.from === "agent" && m.slot && (
                    <Badge variant="outline" className="mb-1.5 text-[10px] uppercase tracking-wide">
                      {slotLabel(m.slot)}
                    </Badge>
                  )}
                  <div>{m.text}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2.5 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {done ? (
            <div className="border-t p-5">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Done</AlertTitle>
                <AlertDescription>
                  {done}{" "}
                  <a href={`${import.meta.env.BASE_URL}app/ghostwriter-test`} className="underline">
                    Try the ghostwriter →
                  </a>
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="border-t p-4 flex items-center gap-2">
              <Input
                placeholder={starting ? "…" : "Type your answer"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={starting || sending || !sessionId}
              />
              <Button onClick={send} disabled={starting || sending || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Your answers update your operating profile directly. You can pause anytime by typing
        "later" — it resumes where you left off.
      </p>
    </div>
  );
}
