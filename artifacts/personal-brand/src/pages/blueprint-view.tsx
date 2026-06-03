import { Link } from "wouter";
import {
  useGetClient,
  getGetClientQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";
import { PILLARS, fieldValue } from "@/lib/blueprint";
import { BlueprintModeToggle } from "@/components/blueprint-mode-toggle";

export default function BlueprintView() {
  const { data: client, isLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const sections = PILLARS.map((pillar) => ({
    pillar,
    fields: pillar.fields
      .map((f) => ({ field: f, value: fieldValue(client, f.name).trim() }))
      .filter((x) => x.value.length > 0),
  })).filter((s) => s.fields.length > 0);

  const name = client?.fullName?.trim();
  const headline = fieldValue(client, "headline").trim();

  return (
    <div className="space-y-12 pb-10">
      <header className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Brand Blueprint
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
              {name || "Your profile"}
            </h1>
            {headline && (
              <p className="text-muted-foreground text-lg mt-3 max-w-2xl">{headline}</p>
            )}
          </div>
          <BlueprintModeToggle active="view" />
        </div>
      </header>

      {sections.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <h2 className="font-serif text-2xl text-foreground">Nothing captured yet</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Once you fill in your Blueprint, your finished profile will read here as a clean,
            consolidated dossier.
          </p>
          <Link href="/blueprint">
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer">
              <Pencil className="w-4 h-4" />
              Start building
            </span>
          </Link>
        </section>
      ) : (
        <div className="space-y-12">
          {sections.map(({ pillar, fields }) => (
            <section key={pillar.id} className="space-y-6">
              <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-secondary/50 p-2.5">
                    <pillar.icon className="w-5 h-5 text-primary stroke-[1.5]" />
                  </div>
                  <h2 className="font-serif text-2xl md:text-3xl text-foreground">
                    {pillar.title}
                  </h2>
                </div>
                <Link href={`/blueprint/${pillar.id}`}>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary cursor-pointer shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </span>
                </Link>
              </div>
              <dl className="space-y-6">
                {fields.map(({ field, value }) => (
                  <div key={field.name} className="space-y-1.5">
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      {field.label}
                    </dt>
                    <dd className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
