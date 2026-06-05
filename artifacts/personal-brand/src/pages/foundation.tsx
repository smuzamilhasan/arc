import { useState } from "react";
import { Compass, Search, BookOpen, Radio, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BlueprintView from "@/pages/blueprint-view";
import Audit from "@/pages/audit";
import Narrative from "@/pages/narrative";
import Platforms from "@/pages/platforms";
import IndustryOverview from "@/pages/industry-overview";

const TABS = [
  { value: "blueprint", label: "Blueprint", icon: Compass, Component: BlueprintView },
  { value: "audit", label: "Audit", icon: Search, Component: Audit },
  { value: "narrative", label: "Narrative", icon: BookOpen, Component: Narrative },
  { value: "platforms", label: "Platforms", icon: Radio, Component: Platforms },
  { value: "industry", label: "Industry Overview", icon: Building2, Component: IndustryOverview },
] as const;

export default function Foundation() {
  const [tab, setTab] = useState<string>("blueprint");

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
          Foundation
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
          Your foundation
        </h1>
        <p className="text-muted-foreground text-lg mt-3 max-w-2xl">
          Blueprint, Audit, Narrative, and Platforms now live in one place. Review
          or edit any of them whenever you want — your day-to-day work flows from here.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-8">
        <TabsList className="h-auto flex-wrap gap-1 bg-secondary/40 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2 px-4 py-2">
              <t.icon className="h-4 w-4 stroke-[1.75]" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value} className="mt-0 focus-visible:outline-none">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
