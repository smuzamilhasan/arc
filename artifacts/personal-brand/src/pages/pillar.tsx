import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetClient,
  getGetClientQueryKey,
  useUpsertClient,
  useExtractPublicInfo,
  useGenerateBio,
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
} from "lucide-react";
import {
  getPillar,
  fieldValue,
  clientToInput,
  coreFields,
  supportingFields,
  type Pillar,
  type PillarField,
} from "@/lib/blueprint";

type Source = { title: string; url: string };

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PillarField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field.name} className="text-foreground/80 font-medium">
        {field.label}
      </Label>
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
    </div>
  );
}

function PillarEditor({ pillar }: { pillar: Pillar }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const upsertClient = useUpsertClient();
  const extract = useExtractPublicInfo();
  const generateBio = useGenerateBio();

  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Source[]>([]);

  const core = useMemo(() => coreFields(pillar), [pillar]);
  const supporting = useMemo(() => supportingFields(pillar), [pillar]);

  useEffect(() => {
    if (!client) return;
    const next: Record<string, string> = {};
    for (const f of pillar.fields) next[f.name] = fieldValue(client, f.name);
    setValues(next);
    setInitial(next);
  }, [client, pillar]);

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
          />
        ))}
      </div>

      {supporting.length > 0 && (
        <div className="space-y-6 pt-2">
          <div className="border-t border-border/60 pt-6 space-y-1">
            <h3 className="text-sm font-medium text-foreground/80">
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
