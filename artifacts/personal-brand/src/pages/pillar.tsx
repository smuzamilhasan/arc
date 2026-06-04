import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { LockedPanel } from "@/components/locked-panel";
import {
  useGetClient,
  getGetClientQueryKey,
  useUpsertClient,
  useExtractPublicInfo,
  useGenerateBio,
  useDraftPillar,
  useGeneratePillarExamples,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  Search,
  Sparkles,
  ExternalLink,
  ArrowUpRight,
  Lightbulb,
  X,
} from "lucide-react";
import {
  getPillar,
  fieldValue,
  clientToInput,
  coreFields,
  supportingFields,
  nextPillarAfter,
  isPillarUnlocked,
  pillarUnlockPrerequisites,
  resolveFieldExample,
  type Pillar,
  type PillarField,
} from "@/lib/blueprint";

type Source = { title: string; url: string };

// Industry-tailored "See an example" samples, cached client-side for the session
// so switching between pillars (or toggling examples) never refetches. Keyed by
// `${pillarId}::${industry}`. Generated on demand; the static examples in
// blueprint.ts remain the fallback when this is empty or still loading.
const examplesCache = new Map<string, Record<string, string>>();

function FieldInput({
  field,
  value,
  onChange,
  exampleOverride,
}: {
  field: PillarField;
  value: string;
  onChange: (value: string) => void;
  // An industry-tailored sample answer, when available. Preferred over the
  // field's static `example`; falls back to the static one when empty.
  exampleOverride?: string;
}) {
  const [showExample, setShowExample] = useState(false);
  const example = resolveFieldExample(field, exampleOverride);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={field.name} className="text-foreground/80 font-medium">
          {field.label}
        </Label>
        {example && (
          <button
            type="button"
            onClick={() => setShowExample((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
            aria-expanded={showExample}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            {showExample ? "Hide example" : "See an example"}
          </button>
        )}
      </div>
      {field.multiline ? (
        <Textarea
          id={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="min-h-[100px] resize-none bg-background border-border/50 p-4"
        />
      ) : (
        <Input
          id={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-12 bg-background border-border/50"
        />
      )}
      {example && showExample && (
        <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
            Example
          </p>
          <p className="text-sm text-foreground/70 italic leading-relaxed">{example}</p>
        </div>
      )}
    </div>
  );
}

function PillarEditor({ pillar }: { pillar: Pillar }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  // Guard the editor route: a locked pillar opened directly by URL shows an
  // explanation of why it's locked and what's left to unlock it, rather than
  // silently redirecting. Unlocked and already-filled pillars open normally.
  // Wait for the profile to load before deciding.
  const locked = !isLoading && !isPillarUnlocked(pillar.id, client);
  const upsertClient = useUpsertClient();
  const extract = useExtractPublicInfo();
  const generateBio = useGenerateBio();
  const draft = useDraftPillar();
  const examplesMut = useGeneratePillarExamples();

  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [nudge, setNudge] = useState<Pillar | null>(null);
  // Industry-tailored sample answers for this pillar's fields, keyed by field
  // name. Empty until generated; the static blueprint examples are used until
  // (and if) these arrive.
  const [industryExamples, setIndustryExamples] = useState<Record<string, string>>({});

  const core = useMemo(() => coreFields(pillar), [pillar]);
  const supporting = useMemo(() => supportingFields(pillar), [pillar]);

  const industry = (client?.industry ?? "").trim();
  // The fields on this pillar that ship with a static example are the ones we
  // upgrade to an industry-tailored sample.
  const exampleFields = useMemo(
    () => pillar.fields.filter((f) => Boolean(f.example)),
    [pillar],
  );

  // Fetch (once per pillar+industry, cached for the session) industry-adapted
  // examples. This runs silently in the background: the static examples remain
  // available the whole time, and we only swap in the industry versions when
  // they arrive. Any failure is ignored — the static fallback stays.
  const mutate = examplesMut.mutate;
  useEffect(() => {
    setIndustryExamples({});
    if (!industry || exampleFields.length === 0) return;
    const cacheKey = `${pillar.id}::${industry.toLowerCase()}`;
    const cached = examplesCache.get(cacheKey);
    if (cached) {
      setIndustryExamples(cached);
      return;
    }
    let active = true;
    mutate(
      {
        data: {
          pillarId: pillar.id,
          industry,
          currentRole: client?.currentRole || undefined,
          company: client?.company || undefined,
          fields: exampleFields.map((f) => ({
            name: f.name,
            label: f.label,
            multiline: f.multiline,
          })),
        },
      },
      {
        onSuccess: (result) => {
          examplesCache.set(cacheKey, result.fields);
          if (active) setIndustryExamples(result.fields);
        },
      },
    );
    return () => {
      active = false;
    };
  }, [pillar.id, industry, exampleFields, client?.currentRole, client?.company, mutate]);

  useEffect(() => {
    if (!client) return;
    const next: Record<string, string> = {};
    for (const f of pillar.fields) next[f.name] = fieldValue(client, f.name);
    setValues(next);
    setInitial(next);
  }, [client, pillar]);

  // Dismiss any lingering nudge when switching pillars.
  useEffect(() => {
    setNudge(null);
  }, [pillar]);

  const dirty = useMemo(
    () => pillar.fields.some((f) => (values[f.name] ?? "") !== (initial[f.name] ?? "")),
    [values, initial, pillar],
  );

  const setField = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const handleSave = () => {
    if (!client) return;
    const input = { ...clientToInput(client), ...values, onboardingComplete: true };
    upsertClient.mutate(
      { data: input },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey() });
          setInitial({ ...values });
          // Compute the next pillar to nudge toward from the just-saved state,
          // so the suggestion reflects what the user actually filled in.
          const merged = { ...client, ...values } as typeof client;
          setNudge(nextPillarAfter(merged, pillar.id));
          toast({ title: "Saved", description: `${pillar.title} updated.` });
        },
        onError: () => {
          toast({
            title: "Could not save",
            description: "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleGather = () => {
    if (!client) return;
    extract.mutate(
      {
        data: {
          fullName: client.fullName,
          company: values.company || undefined,
          website: values.website || undefined,
          linkedinUrl: values.linkedinUrl || undefined,
          twitterUrl: values.twitterUrl || undefined,
        },
      },
      {
        onSuccess: (result) => {
          setSources(result.sources);
          const blob = [result.summary, "", ...result.highlights.map((h) => `- ${h}`)]
            .join("\n")
            .trim();
          const existing = (values.extractedInfo ?? "").trim();
          setField("extractedInfo", existing ? `${existing}\n\n${blob}` : blob);
          toast({
            title: "Gathered what's public",
            description: "Review and correct anything below, then save.",
          });
        },
        onError: () => {
          toast({
            title: "Could not gather info",
            description: "Paste your LinkedIn About section below instead.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDraftBio = () => {
    if (!client) return;
    generateBio.mutate(
      {
        data: {
          fullName: client.fullName,
          currentRole: values.currentRole || undefined,
          company: values.company || undefined,
          industry: values.industry || undefined,
          professionalJourney: client.professionalJourney || undefined,
          signatureAchievements: client.signatureAchievements || undefined,
          awards: client.awards || undefined,
          quantifiableResults: client.quantifiableResults || undefined,
          audienceImpact: client.audienceImpact || undefined,
          extractedInfo: values.extractedInfo || undefined,
        },
      },
      {
        onSuccess: (result) => {
          setField("headline", result.headline);
          setField("bio", result.bio);
          toast({
            title: "Drafted your headline and bio",
            description: "Edit anything that doesn't sound like you, then save.",
          });
        },
        onError: () => {
          toast({
            title: "Could not draft a bio",
            description: "Try again, or write your own below.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDraftPillar = () => {
    if (!client) return;
    draft.mutate(
      {
        data: {
          pillarId: pillar.id,
          fullName: client.fullName,
          currentRole: client.currentRole || undefined,
          company: client.company || undefined,
          industry: client.industry || undefined,
          professionalJourney: client.professionalJourney || undefined,
          signatureAchievements: client.signatureAchievements || undefined,
          awards: client.awards || undefined,
          quantifiableResults: client.quantifiableResults || undefined,
          audienceImpact: client.audienceImpact || undefined,
          passions: client.passions || undefined,
          beliefs: client.beliefs || undefined,
          frustrations: client.frustrations || undefined,
          desiredChange: client.desiredChange || undefined,
          thesis: client.thesis || undefined,
          coreBeliefs: client.coreBeliefs || undefined,
          signatureFrameworks: client.signatureFrameworks || undefined,
          extractedInfo: client.extractedInfo || undefined,
          fields: pillar.fields.map((f) => ({
            name: f.name,
            label: f.label,
            multiline: f.multiline,
          })),
        },
      },
      {
        onSuccess: (result) => {
          let count = 0;
          // Merge against the latest state inside the updater so a field the user
          // typed into while the request was in flight is never overwritten.
          setValues((prev) => {
            const next = { ...prev };
            for (const f of pillar.fields) {
              const suggestion = result.fields[f.name];
              if (suggestion && suggestion.trim() && !(prev[f.name] ?? "").trim()) {
                next[f.name] = suggestion;
                count++;
              }
            }
            return count > 0 ? next : prev;
          });
          toast({
            title: count > 0 ? "Drafted from what you've shared" : "Nothing left to draft",
            description:
              count > 0
                ? "Review and edit anything that doesn't sound like you, then save."
                : "These fields are already filled. Clear one and draft again for a fresh take.",
          });
        },
        onError: () => {
          toast({
            title: "Could not draft suggestions",
            description: "Please try again, or fill these in yourself.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-2xl">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="pb-10">
        <Link href="/blueprint">
          <div className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Blueprint
          </div>
        </Link>
        <LockedPanel
          title={pillar.title}
          description={`${pillar.title} unlocks once you've finished the section that comes before it. Complete what's below and it opens on its own.`}
          prerequisites={pillarUnlockPrerequisites(pillar.id, client)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-10 pb-10">
      <div>
        <Link href="/blueprint">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Blueprint
          </div>
        </Link>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-secondary/50 p-2.5 mt-1">
            <pillar.icon className="w-5 h-5 text-primary stroke-[1.5]" />
          </div>
          <div>
            <h1 className="font-serif text-3xl md:text-4xl text-foreground">{pillar.title}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">{pillar.intro}</p>
          </div>
        </div>
      </div>

      {pillar.hasDraft && (
        <div className="rounded-lg border border-border/60 bg-card p-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-foreground/90">Draft this from what you've shared</p>
            <p className="text-sm text-muted-foreground font-light mt-1">
              arc turns your onboarding answers into a first draft of these questions. It only
              fills blanks, so anything you've written stays. Review and edit, then save.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleDraftPillar}
            disabled={draft.isPending}
            className="gap-2 shrink-0 rounded-full"
          >
            {draft.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Draft
          </Button>
        </div>
      )}

      {pillar.hasGather && (
        <div className="rounded-lg border border-border/60 bg-card p-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-foreground/90">Gather what's public about you</p>
            <p className="text-sm text-muted-foreground font-light mt-1">
              arc searches the web from your name and links, so you can review and correct it.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGather}
            disabled={extract.isPending}
            className="gap-2 shrink-0 rounded-full"
          >
            {extract.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Gather
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {core.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={values[f.name] ?? ""}
            onChange={(v) => setField(f.name, v)}
            exampleOverride={industryExamples[f.name]}
          />
        ))}
      </div>

      {supporting.length > 0 && (
        <div className="space-y-6 pt-2">
          <div className="border-t border-border/60 pt-6 space-y-1.5">
            <h3 className="font-serif text-2xl text-foreground">
              {pillar.supportingLabel ?? "Supporting detail"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {pillar.supportingHint ??
                "Optional questions that enrich the work. These aren't part of the count above."}
            </p>
          </div>
          {supporting.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={values[f.name] ?? ""}
              onChange={(v) => setField(f.name, v)}
              exampleOverride={industryExamples[f.name]}
            />
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
            Sources
          </p>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
                >
                  {s.title}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pillar.hasBioDraft && (
        <div className="rounded-lg border border-border/60 bg-card p-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-foreground/90">Let arc draft your headline and bio</p>
            <p className="text-sm text-muted-foreground font-light mt-1">
              We'll distill your profile into a sharp headline and short bio above. You can edit both.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleDraftBio}
            disabled={generateBio.isPending}
            className="gap-2 shrink-0 rounded-full"
          >
            {generateBio.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Draft
          </Button>
        </div>
      )}

      {nudge && !dirty && (
        <div className="rounded-lg border border-primary/30 bg-accent p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 shrink-0">
                <nudge.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-primary font-medium">
                  Saved. Keep the momentum going
                </p>
                <p className="font-serif text-lg text-foreground mt-0.5">{nudge.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{nudge.blurb}</p>
                <Link href={`/blueprint/${nudge.id}`}>
                  <span className="group mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary cursor-pointer hover:text-primary/80">
                    Continue to {nudge.title}
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNudge(null)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-6 sticky bottom-0 bg-card/30 backdrop-blur-sm">
        <span className="text-sm text-muted-foreground">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </span>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || upsertClient.isPending}
          className="gap-2 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
        >
          {upsertClient.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function PillarPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const pillar = params.pillar ? getPillar(params.pillar) : undefined;

  if (!pillar) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-serif text-3xl text-foreground">Pillar not found</h1>
        <p className="text-muted-foreground">That pillar doesn't exist.</p>
        <Button variant="outline" onClick={() => setLocation("/blueprint")} className="rounded-full">
          Back to Blueprint
        </Button>
      </div>
    );
  }

  return <PillarEditor pillar={pillar} />;
}
