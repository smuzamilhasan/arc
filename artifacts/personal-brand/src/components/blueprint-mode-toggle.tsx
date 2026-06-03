import { Link } from "wouter";
import { Pencil, BookOpenText } from "lucide-react";
import { cn } from "@/lib/utils";

export type BlueprintMode = "edit" | "view";

const options: { mode: BlueprintMode; label: string; href: string; icon: typeof Pencil }[] = [
  { mode: "edit", label: "Edit", href: "/blueprint", icon: Pencil },
  { mode: "view", label: "View", href: "/blueprint/view", icon: BookOpenText },
];

export function BlueprintModeToggle({ active }: { active: BlueprintMode }) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 p-1"
      role="tablist"
      aria-label="Blueprint mode"
    >
      {options.map((o) => {
        const isActive = o.mode === active;
        const Icon = o.icon;
        const content = (
          <span
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
            {o.label}
          </span>
        );
        return isActive ? (
          <div key={o.mode}>{content}</div>
        ) : (
          <Link key={o.mode} href={o.href} className="cursor-pointer">
            {content}
          </Link>
        );
      })}
    </div>
  );
}
