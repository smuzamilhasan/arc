// "Sharpen your profile" — the micro-prompt touchpoint. Shows profile
// completeness and asks ONE high-leverage question at a time. The user answers
// in their own words; the answer is captured into the right profile layer. This
// is how the comprehensive profile fills across many sittings instead of one
// giant form.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Check, Loader2, ArrowRight } from "lucide-react";
import { getActiveClientId } from "@/lib/active-client";

type NextQuestion = { key: string; label: string; section: string; question: string; why?: string };
type Completeness = { overall_pct: number; core_pct: number };

export function ProfileSharpenCard() {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function headers() {
    const clientId = getActiveClientId();
    return {
      "Content-Type": "application/json",
      ...(clientId != null ? { "x-arc-client-id": String(clientId) } : {}),
    };
  }

  async function load() {
    setLoading(true);
    try {
      const [cRes, qRes] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}api/v2/profile/completeness`, { headers: headers() }),
        fetch(`${import.meta.env.BASE_URL}api/v2/profile/next-questions?touchpoint=micro&n=1`, { headers: headers() }),
      ]);
      if (cRes.ok) setCompleteness(await cRes.json());
      if (qRes.ok) {
        const data = (await qRes.json()) as { questions: NextQuestion[] };
        setQuestion(data.questions[0] ?? null);
      }
    } catch {
      /* silent — card just won't show */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    if (!question || !answer.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/v2/profile/answer`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ fieldKey: question.key, answer: answer.trim() }),
      });
      const data = (await res.json()) as { status: string; completeness?: Completeness };
      if (data.status === "ok") {
        if (data.completeness) setCompleteness(data.completeness);
        setJustSaved(true);
        setAnswer("");
        setTimeout(() => setJustSaved(false), 1200);
        await load(); // fetch the next question
      } else {
        // skipped (no signal) — keep the question, let them rephrase
        setAnswer("");
      }
    } catch {
      /* keep state */
    } finally {
      setSaving(false);
    }
  }

  // Hide entirely once nothing's left to ask.
  if (!loading && !question) {
    if (!completeness) return null;
    return (
      <Card className="border-primary/30">
        <CardContent className="flex items-center gap-3 py-5">
          <Check className="w-5 h-5 text-primary" />
          <div className="text-sm">
            <span className="font-medium">Profile {completeness.overall_pct}% complete.</span>{" "}
            <span className="text-muted-foreground">Nothing more to ask right now — it’ll keep learning as you use it.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Sharpen your profile
          </CardTitle>
          {completeness && (
            <span className="text-xs text-muted-foreground">{completeness.overall_pct}% complete</span>
          )}
        </div>
        {completeness && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(4, completeness.overall_pct)}%` }}
            />
          </div>
        )}
        <CardDescription className="pt-1">
          One quick question at a time. The more it knows, the more it sounds — and aims — like you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> finding the next question…
          </div>
        ) : justSaved ? (
          <div className="flex items-center gap-2 text-primary text-sm">
            <Check className="w-4 h-4" /> saved
          </div>
        ) : question ? (
          <div className="space-y-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{question.section}</span>
              <p className="text-[15px] mt-0.5">{question.question}</p>
              {question.why && <p className="text-xs text-muted-foreground mt-1">{question.why}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Answer in your own words…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                disabled={saving}
              />
              <Button onClick={() => void submit()} disabled={saving || !answer.trim()} size="sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
