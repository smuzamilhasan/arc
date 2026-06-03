import { useEffect, useRef, useState } from "react";
import {
  useGetNarrative,
  getGetNarrativeQueryKey,
  useGenerateNarrative,
  useGetClient,
  getGetClientQueryKey,
  IndustryAnswer,
  ClientProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowRight, Sparkles, Target, Quote, MessageSquare, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const QUESTIONS = [
  "What is the biggest lie your industry believes to be true?",
  "Who are you truly serving, and what change are you driving for them?",
  "What is the one thing you want to be known for?",
  "What is your most contrarian belief about your field?"
];

const joinParts = (...parts: Array<string | undefined>) =>
  parts.map((p) => p?.trim()).filter(Boolean).join("\n\n");

// Map the answers already captured during onboarding onto the four synthesis
// questions so the narrative reflects what the user actually wrote.
function seedAnswersFromClient(client: ClientProfile): IndustryAnswer[] {
  return [
    { question: QUESTIONS[0], answer: joinParts(client.frustrations, client.beliefs) },
    { question: QUESTIONS[1], answer: joinParts(client.audienceImpact, client.desiredChange) },
    { question: QUESTIONS[2], answer: joinParts(client.passions, client.headline) },
    { question: QUESTIONS[3], answer: joinParts(client.beliefs) },
  ].filter((a) => a.answer.length > 0);
}

function hasCoachMaterial(client: ClientProfile | undefined): client is ClientProfile {
  if (!client) return false;
  return [
    client.passions,
    client.beliefs,
    client.frustrations,
    client.desiredChange,
    client.audienceImpact,
  ].some((v) => v?.trim());
}

export default function Narrative() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<string[]>(Array(QUESTIONS.length).fill(""));
  const [step, setStep] = useState(0);
  const [retake, setRetake] = useState(false);
  const [autoGenFailed, setAutoGenFailed] = useState(false);
  const autoGenAttempted = useRef(false);

  const { data: narrative, isLoading: isNarrativeLoading } = useGetNarrative({
    query: {
      queryKey: getGetNarrativeQueryKey(),
      retry: false,
    }
  });

  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  const generateNarrative = useGenerateNarrative();

  const canAutoGenerate =
    !narrative && !retake && !autoGenFailed && hasCoachMaterial(client);

  // Auto-synthesize from onboarding answers instead of re-interviewing the user.
  useEffect(() => {
    if (autoGenAttempted.current) return;
    if (isNarrativeLoading || isClientLoading) return;
    if (!canAutoGenerate || !client) return;

    autoGenAttempted.current = true;
    generateNarrative.mutate(
      { data: { answers: seedAnswersFromClient(client) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNarrativeQueryKey() });
        },
        onError: () => {
          setAutoGenFailed(true);
          toast({
            title: "Could not synthesize automatically",
            description: "Answer the questions below to generate your narrative.",
            variant: "destructive",
          });
        },
      }
    );
  }, [
    canAutoGenerate,
    client,
    isClientLoading,
    isNarrativeLoading,
    generateNarrative,
    queryClient,
    toast,
  ]);

  if (isNarrativeLoading || isClientLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  const handleNext = () => {
    if (!answers[step]?.trim()) {
      toast({ title: "Please provide an answer", variant: "destructive" });
      return;
    }
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      submitInterview();
    }
  };

  const submitInterview = () => {
    const formattedAnswers: IndustryAnswer[] = QUESTIONS.map((q, i) => ({
      question: q,
      answer: answers[i]
    }));

    generateNarrative.mutate(
      { data: { answers: formattedAnswers } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNarrativeQueryKey() });
          setRetake(false);
          setAutoGenFailed(false);
          toast({ title: "Narrative generated successfully" });
        },
        onError: () => {
          toast({ title: "Failed to generate narrative", variant: "destructive" });
        }
      }
    );
  };

  const startRetake = () => {
    setAnswers(Array(QUESTIONS.length).fill(""));
    setStep(0);
    setRetake(true);
  };

  // 1. Loading state for AI generation (auto or manual)
  if (generateNarrative.isPending || canAutoGenerate) {
    return (
      <div className="max-w-2xl mx-auto mt-20 space-y-8 text-center animate-in fade-in duration-1000">
        <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/5 text-primary mb-6 border border-primary/10">
          <Sparkles className="w-10 h-10 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" style={{ animationDuration: '4s' }}></div>
        </div>
        <h2 className="text-3xl font-serif tracking-tight">Synthesizing your narrative</h2>
        <p className="text-muted-foreground text-lg font-light max-w-md mx-auto leading-relaxed">
          arc is analyzing your answers, extracting your core point of view, and formulating a positioning strategy. This takes about 15-30 seconds.
        </p>
      </div>
    );
  }

  // 2. Interview State (no narrative yet, or the user chose to retake)
  if (!narrative || retake) {
    return (
      <div className="max-w-3xl mx-auto mt-10">
        <div className="mb-12 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">
            The Synthesis Interview
          </h1>
          <p className="text-lg text-muted-foreground font-light max-w-xl mx-auto">
            To define your brand, arc needs to understand how you think. Answer these four questions candidly.
          </p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <CardHeader className="border-b border-border/50 bg-card/50 pb-6 pt-8 px-10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Question {step + 1} of {QUESTIONS.length}</span>
              <div className="flex gap-1">
                {QUESTIONS.map((_, i) => (
                  <div key={i} className={`w-12 h-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-border'}`} />
                ))}
              </div>
            </div>
            <CardTitle className="font-serif text-3xl font-normal leading-tight mt-6">
              {QUESTIONS[step]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-10">
            <div className="space-y-8">
              <Textarea 
                placeholder="Be direct, opinionated, and honest..." 
                className="min-h-[160px] text-lg leading-relaxed resize-none bg-background border-border/50 p-6 focus-visible:ring-primary/20"
                value={answers[step]}
                onChange={(e) => {
                  const newAnswers = [...answers];
                  newAnswers[step] = e.target.value;
                  setAnswers(newAnswers);
                }}
                autoFocus
              />
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                {step > 0 ? (
                  <Button variant="ghost" onClick={() => setStep(step - 1)} className="font-medium text-muted-foreground hover:text-foreground">
                    Previous
                  </Button>
                ) : (
                  <div></div>
                )}
                <Button onClick={handleNext} className="gap-2 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11 text-md">
                  {step === QUESTIONS.length - 1 ? "Synthesize Strategy" : "Next Question"} <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Results State (Narrative exists)
  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="space-y-2 max-w-3xl">
        <h1 className="text-4xl font-serif text-foreground tracking-tight">Your Narrative Strategy</h1>
        <p className="text-muted-foreground text-lg font-light leading-relaxed">
          The synthesized foundation for your personal brand. Everything you publish should flow from these pillars.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Core Narrative - spans 2 columns */}
        <Card className="lg:col-span-2 border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Target className="w-5 h-5" />
            </div>
            <CardTitle className="font-serif text-2xl font-normal">Core Positioning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">The Narrative</h3>
              <p className="text-lg leading-relaxed text-foreground font-light">{narrative.coreNarrative}</p>
            </div>
            <div className="border-l-2 border-primary/30 pl-6 py-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">Point of View</h3>
              <p className="text-xl font-serif italic text-foreground/90">{narrative.pointOfView}</p>
            </div>
          </CardContent>
        </Card>

        {/* Content Hooks */}
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Quote className="w-5 h-5" />
            </div>
            <CardTitle className="font-serif text-xl font-normal">Content Hooks</CardTitle>
            <CardDescription className="font-light">Ready-to-use angles for posts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {narrative.contentHooks.map((hook, i) => (
                <li key={i} className="flex items-start gap-3 text-sm font-light leading-relaxed">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span>{hook}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Themes */}
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground">
                <Briefcase className="w-5 h-5" />
              </div>
              <CardTitle className="font-serif text-2xl font-normal">Content Themes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {narrative.themes.map((theme, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="font-medium text-foreground text-lg">{theme.title}</h4>
                  <p className="text-muted-foreground font-light leading-relaxed">{theme.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Platforms */}
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground">
                <MessageSquare className="w-5 h-5" />
              </div>
              <CardTitle className="font-serif text-2xl font-normal">Platform Strategy</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {narrative.recommendedPlatforms.map((platform, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/50 bg-background/50 items-start">
                  <div className="shrink-0 pt-1">
                    <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-sm
                      ${platform.priority === 'high' ? 'bg-primary/10 text-primary' : 
                        platform.priority === 'medium' ? 'bg-secondary text-secondary-foreground' : 
                        'bg-muted text-muted-foreground'}`}>
                      {platform.priority} Priority
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground capitalize mb-1">{platform.platform}</h4>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">{platform.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Utility to retake interview (hidden away but useful) */}
      <div className="flex justify-center pt-8">
        <Button variant="ghost" onClick={startRetake} className="text-muted-foreground text-xs hover:text-foreground">
          Retake Synthesis Interview
        </Button>
      </div>
    </div>
  );
}