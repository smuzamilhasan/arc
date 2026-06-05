import { useState, useEffect, useRef } from "react";
import { useGetLatestAudit, getGetLatestAuditQueryKey, getGetDashboardQueryKey, useGetClient, getGetClientQueryKey, AuditResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, AlertCircle, ChevronRight, Globe, BrainCircuit, ExternalLink, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PrerequisiteChecklist } from "@/components/locked-panel";
import { auditReadinessPrerequisites } from "@/lib/blueprint";
import { useRegenerateFeedback } from "@/components/regenerate-feedback";

type AuditProgress = {
  step: "start" | "seo" | "geo" | "synthesis";
  status?: "running" | "done";
  message: string;
};

export default function Audit() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<AuditResult | null>(null);

  const { data: audit, isLoading: isAuditLoading, isError } = useGetLatestAudit({
    query: {
      queryKey: getGetLatestAuditQueryKey(),
      retry: false,
    }
  });

  const { data: client } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  const activeAudit = liveResult || audit;

  const { requestFeedback, dialog } = useRegenerateFeedback({
    title: "Refine your audit",
    description:
      "Optionally tell the AI what to focus on before it re-runs your audit. Leave blank to run as before.",
  });

  const handleRerun = () => {
    requestFeedback(Boolean(activeAudit), (fb) => {
      void runAudit(fb);
    });
  };

  const runAudit = async (feedback?: string) => {
    setIsRunning(true);
    setError(null);
    setProgress({ step: "start", status: "running", message: "Initializing audit sequence..." });
    setLiveResult(null);

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/audit/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedback ? { feedback } : {}),
      });

      if (!response.ok || !response.body) {
        let message = `Audit failed to start (status ${response.status}).`;
        try {
          const errBody = await response.json();
          if (errBody?.message) message = errBody.message;
          else if (errBody?.error) message = errBody.error;
        } catch {
          // response had no JSON body; keep the default message
        }
        setError(message);
        setIsRunning(false);
        setProgress(null);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedTerminal = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');

        // Keep the last partial chunk in the buffer
        buffer = events.pop() || "";

        for (const event of events) {
          const dataLine = event
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));

            if (data.type === "progress") {
              setProgress({ step: data.step, status: data.status, message: data.message });
            } else if (data.type === "result") {
              setLiveResult(data.result);
              // Refresh caches
              queryClient.invalidateQueries({ queryKey: getGetLatestAuditQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
            } else if (data.type === "complete") {
              receivedTerminal = true;
              setIsRunning(false);
              setProgress(null);
            } else if (data.type === "error") {
              receivedTerminal = true;
              setError(data.message);
              setIsRunning(false);
              setProgress(null);
            }
          } catch (e) {
            console.error("Failed to parse SSE JSON", e);
          }
        }
      }

      // Stream ended without a terminal complete/error event.
      if (!receivedTerminal) {
        setIsRunning(false);
        setProgress(null);
        setLiveResult((current) => {
          if (!current) {
            setError("The audit stream was interrupted before finishing. Please try again.");
          }
          return current;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit");
      setIsRunning(false);
      setProgress(null);
    }
  };

  if (isAuditLoading && !isRunning && !liveResult) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  // Running State
  if (isRunning) {
    const steps = ["start", "seo", "geo", "synthesis"];
    const currentStepIndex = progress ? steps.indexOf(progress.step) : 0;
    const progressPercent = ((currentStepIndex + (progress?.status === "done" ? 1 : 0.5)) / steps.length) * 100;

    return (
      <div className="max-w-2xl mx-auto mt-20 space-y-8 animate-in fade-in duration-700">
        <div className="text-center space-y-4">
          <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/5 text-primary mb-6 border border-primary/10">
            <Search className="w-10 h-10 animate-pulse" />
            <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" style={{ animationDuration: '3s' }}></div>
          </div>
          <h2 className="text-3xl font-serif tracking-tight">Analyzing your digital footprint</h2>
          <p className="text-muted-foreground text-lg font-light h-8 transition-all">
            {progress?.message || "Running audit..."}
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-widest px-1">
            <span className={currentStepIndex >= 0 ? "text-primary" : ""}>Init</span>
            <span className={currentStepIndex >= 1 ? "text-primary" : ""}>Search</span>
            <span className={currentStepIndex >= 2 ? "text-primary" : ""}>AI Models</span>
            <span className={currentStepIndex >= 3 ? "text-primary" : ""}>Synthesize</span>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-20 space-y-6">
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Audit Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button onClick={() => runAudit()} className="gap-2 rounded-full">
            Try Again <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Empty State (No audit ever run)
  if (!activeAudit && !isRunning) {
    const readiness = auditReadinessPrerequisites(client);
    const missing = readiness.filter((p) => !p.complete).length;

    return (
      <div className="max-w-3xl mx-auto mt-10 space-y-6">
        <Card className="border-border/50 bg-card/50 shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <CardContent className="p-12 text-center space-y-8 relative">
            <div className="mx-auto w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Search className="w-10 h-10" />
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-serif tracking-tight">The Reality Check</h2>
              <p className="text-lg text-muted-foreground font-light max-w-lg mx-auto leading-relaxed">
                Before we shape your narrative, we need to know what the internet already thinks about you. 
                arc will scan search engines and query leading AI models to see if you exist, and how you are perceived.
              </p>
            </div>
            <Button onClick={() => runAudit()} size="lg" className="rounded-full px-8 text-md h-14 bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-lg hover:shadow-xl transition-all">
              Run Initial Audit <ChevronRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {missing > 0 && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground font-light max-w-lg mx-auto leading-relaxed">
              Filling these in first sharpens your results — but you can run the audit
              now and add them later.
            </p>
            <PrerequisiteChecklist
              prerequisites={readiness}
              footer="Optional, but each one gives the audit more to work with."
            />
          </div>
        )}
      </div>
    );
  }

  // Results State
  const averageScore = activeAudit ? Math.round(((activeAudit.seoScore || 0) + (activeAudit.geoScore || 0)) / 2) : 0;

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-serif text-foreground tracking-tight">Digital Presence Audit</h1>
          <p className="text-muted-foreground text-lg font-light">How the world and AI models see you today.</p>
        </div>
        <Button onClick={handleRerun} variant="outline" className="shrink-0 rounded-full bg-card hover:bg-secondary border-border/50">
          Run Fresh Audit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1 border-border/50 bg-card overflow-hidden relative shadow-md flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <CardHeader className="text-center pb-2 z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Visibility Score</CardTitle>
          </CardHeader>
          <CardContent className="text-center pb-8 z-10">
            <div className="text-8xl font-serif text-primary tracking-tighter mb-2 drop-shadow-sm">{averageScore}</div>
            <p className="text-muted-foreground text-sm max-w-[200px] mx-auto">
              Combined score across Google search and how AI engines represent you using current public web information.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/50 bg-card shadow-md">
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-normal">Strategic Recommendations</CardTitle>
            <CardDescription className="text-base font-light">What arc suggests you do next based on these findings.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {activeAudit?.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 bg-primary/10 text-primary rounded-full p-1 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-foreground leading-relaxed font-light">{rec}</span>
                </li>
              ))}
              {(!activeAudit?.recommendations || activeAudit.recommendations.length === 0) && (
                <li className="text-muted-foreground italic font-light">No specific recommendations at this time.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SEO Results */}
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground">
                  <Globe className="w-5 h-5" />
                </div>
                <CardTitle className="font-serif text-2xl font-normal">Search Engine Identity</CardTitle>
              </div>
              <div className="text-3xl font-serif text-primary">{activeAudit?.seoScore}</div>
            </div>
            <p className="text-muted-foreground text-sm font-light leading-relaxed">
              {activeAudit?.seoFindings?.summary || "No summary available."}
            </p>
          </CardHeader>
          <CardContent>
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-widest mb-4">Notable Results</h4>
            <div className="space-y-6">
              {activeAudit?.seoFindings?.results.slice(0, 5).map((result, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-2 py-0 font-medium">
                      {result.type}
                    </Badge>
                    <a href={result.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1 line-clamp-1">
                      {result.title} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground font-light line-clamp-2 leading-relaxed">
                    {result.snippet}
                  </p>
                </div>
              ))}
              {(!activeAudit?.seoFindings?.results || activeAudit.seoFindings.results.length === 0) && (
                <div className="text-center py-8 text-muted-foreground italic font-light">
                  No significant search results found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* GEO Results */}
        <Card className="border-border/50 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50 pb-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <CardTitle className="font-serif text-2xl font-normal">AI Model Perception</CardTitle>
              </div>
              <div className="text-3xl font-serif text-primary">{activeAudit?.geoScore}</div>
            </div>
            <p className="text-xs text-muted-foreground font-light leading-relaxed mb-3">
              How AI engines represent you when answering with current public web information. Each model was given the same live web context and asked to describe you.
            </p>
            <p className="text-muted-foreground text-sm font-light leading-relaxed">
              {activeAudit?.geoFindings?.summary || "No summary available."}
            </p>
          </CardHeader>
          <CardContent>
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-widest mb-4">Model Responses</h4>
            <Accordion type="single" collapsible className="w-full space-y-2">
              {activeAudit?.geoFindings?.models.map((model, i) => (
                <AccordionItem key={i} value={`model-${i}`} className="border border-border/50 rounded-lg px-4 bg-background/50">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-medium">{model.label}</span>
                      <Badge variant={model.accuracy === 'accurate' ? 'default' : model.accuracy === 'incorrect' ? 'destructive' : 'secondary'} 
                             className="text-[10px] uppercase tracking-wider font-medium">
                        {model.accuracy}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground font-light leading-relaxed pb-4">
                    <div className="space-y-4">
                      <p className="italic border-l-2 border-primary/20 pl-4 py-1">"{model.response}"</p>
                      <p className="text-sm">{model.notes}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
              {(!activeAudit?.geoFindings?.models || activeAudit.geoFindings.models.length === 0) && (
                <div className="text-center py-8 text-muted-foreground italic font-light border border-border/50 rounded-lg">
                  No model queries found.
                </div>
              )}
            </Accordion>
            {activeAudit?.geoFindings?.sources && activeAudit.geoFindings.sources.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border/50">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-widest mb-4">Web Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {activeAudit.geoFindings.sources.map((source, i) => (
                    <a
                      key={i}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border border-border/50 rounded-full px-3 py-1"
                    >
                      {source.title} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
