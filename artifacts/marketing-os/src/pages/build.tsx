import { useEffect, useMemo, useState } from "react";
import {
  useGetMarketingBlueprint,
  useUpdateMarketingBlueprint,
  useListMarketingConnectors,
  usePlanMarketingProvision,
  useApplyMarketingProvisionRun,
  useListMarketingProvisionRuns,
  getGetMarketingBlueprintQueryKey,
  getListMarketingProvisionRunsQueryKey,
  getListMarketingActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Wand2,
  FormInput,
  Database,
  ArrowRight,
} from "lucide-react";

type FieldType = "short_text" | "long_text" | "email" | "number";
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
];

interface IntakeField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
}
interface CrmField {
  name: string;
  type: FieldType;
}
interface CrmTable {
  name: string;
  description?: string;
  fields: CrmField[];
}
interface Definition {
  intakeForm: { title: string; fields: IntakeField[] };
  crm: { baseName: string; tables: CrmTable[] };
}

function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || `field_${Date.now()}`
  );
}

export default function Build() {
  const { data: blueprint, isLoading } = useGetMarketingBlueprint();
  const [def, setDef] = useState<Definition | null>(null);

  useEffect(() => {
    if (blueprint?.definition && !def) {
      setDef(JSON.parse(JSON.stringify(blueprint.definition)) as Definition);
    }
  }, [blueprint, def]);

  if (isLoading || !def) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Build</h1>
        <p className="text-muted-foreground mt-1">
          Define your funnel once, then push the configuration into the tools you
          already use. Nothing is written to a tool until you review and confirm.
        </p>
      </div>

      <BlueprintEditor def={def} setDef={setDef} savedAt={blueprint?.updatedAt} />
      <ProvisioningSection />
      <RunHistory />
    </div>
  );
}

function BlueprintEditor({
  def,
  setDef,
  savedAt,
}: {
  def: Definition;
  setDef: (d: Definition) => void;
  savedAt?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useUpdateMarketingBlueprint();

  const handleSave = () => {
    save.mutate(
      { data: { definition: def } },
      {
        onSuccess: () => {
          toast({ title: "Blueprint saved" });
          qc.invalidateQueries({ queryKey: getGetMarketingBlueprintQueryKey() });
          qc.invalidateQueries({ queryKey: getListMarketingActivityQueryKey() });
        },
        onError: (err: any) =>
          toast({
            title: "Save failed",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
  };

  const setIntake = (patch: Partial<Definition["intakeForm"]>) =>
    setDef({ ...def, intakeForm: { ...def.intakeForm, ...patch } });
  const setCrm = (patch: Partial<Definition["crm"]>) =>
    setDef({ ...def, crm: { ...def.crm, ...patch } });

  const addIntakeField = () =>
    setIntake({
      fields: [
        ...def.intakeForm.fields,
        { key: slugifyKey("new field"), label: "New field", type: "short_text", required: false },
      ],
    });
  const updateIntakeField = (i: number, patch: Partial<IntakeField>) => {
    const fields = def.intakeForm.fields.map((f, idx) =>
      idx === i ? { ...f, ...patch } : f,
    );
    setIntake({ fields });
  };
  const removeIntakeField = (i: number) =>
    setIntake({ fields: def.intakeForm.fields.filter((_, idx) => idx !== i) });

  const addTable = () =>
    setCrm({
      tables: [
        ...def.crm.tables,
        { name: "New Table", fields: [{ name: "Name", type: "short_text" }] },
      ],
    });
  const updateTable = (ti: number, patch: Partial<CrmTable>) =>
    setCrm({
      tables: def.crm.tables.map((t, idx) => (idx === ti ? { ...t, ...patch } : t)),
    });
  const removeTable = (ti: number) =>
    setCrm({ tables: def.crm.tables.filter((_, idx) => idx !== ti) });
  const addTableField = (ti: number) =>
    updateTable(ti, {
      fields: [...def.crm.tables[ti].fields, { name: "New field", type: "short_text" }],
    });
  const updateTableField = (ti: number, fi: number, patch: Partial<CrmField>) =>
    updateTable(ti, {
      fields: def.crm.tables[ti].fields.map((f, idx) =>
        idx === fi ? { ...f, ...patch } : f,
      ),
    });
  const removeTableField = (ti: number, fi: number) =>
    updateTable(ti, {
      fields: def.crm.tables[ti].fields.filter((_, idx) => idx !== fi),
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Funnel Blueprint</CardTitle>
            <CardDescription>
              The desired state of your funnel. Provisioning reconciles each tool
              toward this.
            </CardDescription>
          </div>
          {savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved {new Date(savedAt).toLocaleString()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Intake form */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FormInput size={16} className="text-primary" />
            <h3 className="font-semibold">Capture: intake form</h3>
          </div>
          <div className="space-y-2">
            <Label>Form title</Label>
            <Input
              value={def.intakeForm.title}
              onChange={(e) => setIntake({ title: e.target.value })}
            />
          </div>
          <div className="space-y-3">
            {def.intakeForm.fields.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={f.label}
                    onChange={(e) =>
                      updateIntakeField(i, {
                        label: e.target.value,
                        key: slugifyKey(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={f.type}
                    onValueChange={(v) => updateIntakeField(i, { type: v as FieldType })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant={f.required ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateIntakeField(i, { required: !f.required })}
                >
                  {f.required ? "Required" : "Optional"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeIntakeField(i)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addIntakeField}>
            <Plus size={14} /> Add field
          </Button>
        </section>

        {/* CRM */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primary" />
            <h3 className="font-semibold">Re-engage: CRM</h3>
          </div>
          <div className="space-y-2">
            <Label>Base name</Label>
            <Input
              value={def.crm.baseName}
              onChange={(e) => setCrm({ baseName: e.target.value })}
            />
          </div>
          <div className="space-y-4">
            {def.crm.tables.map((t, ti) => (
              <div key={ti} className="rounded-lg border border-border/50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Input
                    className="font-medium"
                    value={t.name}
                    onChange={(e) => updateTable(ti, { name: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => removeTable(ti)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                <div className="space-y-2">
                  {t.fields.map((f, fi) => (
                    <div key={fi} className="flex items-center gap-2">
                      <Input
                        value={f.name}
                        onChange={(e) => updateTableField(ti, fi, { name: e.target.value })}
                      />
                      <Select
                        value={f.type}
                        onValueChange={(v) =>
                          updateTableField(ti, fi, { type: v as FieldType })
                        }
                      >
                        <SelectTrigger className="w-36 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((ft) => (
                            <SelectItem key={ft.value} value={ft.value}>
                              {ft.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removeTableField(ti, fi)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addTableField(ti)}
                >
                  <Plus size={14} /> Add field
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addTable}>
            <Plus size={14} /> Add table
          </Button>
        </section>
      </CardContent>
      <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save blueprint"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProvisioningSection() {
  const { data: connectors } = useListMarketingConnectors();
  const provisionable = useMemo(
    () => (connectors ?? []).filter((c: any) => c.provisionable),
    [connectors],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Provision tools</CardTitle>
        <CardDescription>
          Push your blueprint into each connected tool. You will preview every
          change before anything is written.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {provisionable.map((c: any) => (
          <ProvisionCard key={c.id} connector={c} />
        ))}
        {provisionable.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No provisionable tools yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProvisionCard({ connector }: { connector: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [plan, setPlan] = useState<any | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const planMut = usePlanMarketingProvision();
  const applyMut = useApplyMarketingProvisionRun();

  const handlePlan = () => {
    planMut.mutate(
      { provider: connector.id },
      {
        onSuccess: (run: any) => {
          setRunId(run.id);
          setPlan(run.plan);
        },
        onError: (err: any) =>
          toast({
            title: "Could not plan",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
  };

  const noChanges = plan != null && (plan.changes?.length ?? 0) === 0;

  const handleApply = () => {
    if (runId == null) return;
    applyMut.mutate(
      { id: runId },
      {
        onSuccess: (run: any) => {
          toast({
            title: `${connector.label} provisioned`,
            description: run.result?.outputs?.url
              ? "Open it from the run history below."
              : undefined,
          });
          setPlan(null);
          setRunId(null);
          qc.invalidateQueries({ queryKey: getListMarketingProvisionRunsQueryKey() });
          qc.invalidateQueries({ queryKey: getListMarketingActivityQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Provisioning failed",
            description: err.message,
            variant: "destructive",
          });
          qc.invalidateQueries({ queryKey: getListMarketingProvisionRunsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="rounded-lg border border-border/50 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{connector.label}</div>
          <div className="text-xs text-muted-foreground capitalize">{connector.category}</div>
        </div>
        {connector.connected ? (
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
            <CheckCircle2 size={12} /> Connected
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
            <AlertCircle size={12} /> Not connected
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground flex-1">{connector.description}</p>
      <Button
        size="sm"
        className="gap-1.5 self-start"
        onClick={handlePlan}
        disabled={!connector.connected || planMut.isPending}
      >
        <Wand2 size={14} />
        {planMut.isPending ? "Planning..." : "Plan changes"}
      </Button>

      <Dialog open={plan != null} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review changes for {connector.label}</DialogTitle>
            <DialogDescription>{plan?.summary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {noChanges ? (
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  Already in sync — nothing to do. {connector.label} already
                  matches your blueprint.
                </div>
              </div>
            ) : (
              (plan?.changes ?? []).map((ch: any, i: number) => (
                <div key={i} className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="text-sm font-medium">{ch.summary}</div>
                  {ch.detail?.fields && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {(ch.detail.fields as any[])
                        .map((f) => (typeof f === "string" ? f : `${f.label} (${f.type})`))
                        .join(", ")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            {noChanges ? (
              <Button onClick={() => setPlan(null)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setPlan(null)}>
                  Cancel
                </Button>
                <Button className="gap-1.5" onClick={handleApply} disabled={applyMut.isPending}>
                  {applyMut.isPending ? "Applying..." : "Confirm and apply"}
                  <ArrowRight size={14} />
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunHistory() {
  const { data: runs, isLoading } = useListMarketingProvisionRuns();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Provisioning history</CardTitle>
        <CardDescription>Every planned and applied change.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : runs && runs.length > 0 ? (
          runs.map((r: any) => <RunRow key={r.id} run={r} />)
        ) : (
          <div className="text-sm text-muted-foreground">No runs yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: any }) {
  const url = run.result?.outputs?.url as string | undefined;
  const statusBadge =
    run.status === "applied" ? (
      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
        Applied
      </Badge>
    ) : run.status === "failed" ? (
      <Badge variant="outline" className="bg-destructive/5 text-destructive border-destructive/20">
        Failed
      </Badge>
    ) : (
      <Badge variant="secondary">Planned</Badge>
    );

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium capitalize">{run.provider}</div>
          <div className="text-sm text-muted-foreground">{run.plan?.summary}</div>
          {run.error && (
            <div className="text-xs text-destructive mt-1">{run.error}</div>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block break-all"
            >
              {url}
            </a>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(run.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="shrink-0">{statusBadge}</div>
      </div>
    </div>
  );
}
