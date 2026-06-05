import { Link } from "wouter";
import { PenLine, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContentMode = "create" | "strategy";

const options: { mode: ContentMode; label: string; href: string; icon: typeof PenLine }[] = [
  { mode: "create", label: "Create", href: "/content", icon: PenLine },
  { mode: "strategy", label: "Strategy", href: "/content/strategy", icon: LayoutDashboard },
];

export function ContentModeToggle({
  active,
  strategyUnseen = false,
}: {
  active: ContentMode;
  strategyUnseen?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 p-1"
      role="tablist"
      aria-label="Content mode"
    >
      {options.map((o) => {
        const isActive = o.mode === active;
        const Icon = o.icon;
        const showDot = o.mode === "strategy" && strategyUnseen && !isActive;
        const content = (
          <span
            role="tab"
            aria-selected={isActive}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
            {o.label}
            {showDot && (
              <span
                aria-label="New strategy update"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
              />
            )}
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
