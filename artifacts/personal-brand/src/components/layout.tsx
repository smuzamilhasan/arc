import { Link, useLocation } from "wouter";
import { 
  Menu, 
  LayoutDashboard, 
  Search, 
  BookOpen, 
  FileText,
  Lightbulb,
  CornerDownRight
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/audit", icon: Search, label: "Audit" },
  { href: "/narrative", icon: BookOpen, label: "Narrative" },
  { href: "/content", icon: FileText, label: "Content" },
  { href: "/ideas", icon: Lightbulb, label: "Ideas" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const NavLinks = () => (
    <div className="flex flex-col gap-1">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-none transition-all duration-300 cursor-pointer text-sm font-medium",
              location === item.href
                ? "text-primary border-l-2 border-primary bg-primary/5"
                : "text-muted-foreground border-l-2 border-transparent hover:text-foreground hover:bg-secondary/30 hover:border-secondary-foreground/20"
            )}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <item.icon className="w-4 h-4 stroke-[1.5]" />
            {item.label}
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/20 selection:text-primary">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border/50 bg-background shrink-0">
        <div className="p-8 pb-4">
          <div className="flex flex-col gap-1 mb-10">
            <span className="font-serif text-3xl tracking-tight text-foreground flex items-end gap-1">
              arc <CornerDownRight className="w-5 h-5 text-primary mb-1 stroke-[2.5]" />
            </span>
            <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">Strategist</span>
          </div>
        </div>
        <div className="px-4">
          <NavLinks />
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border/50 bg-background/80 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-1">
          <span className="font-serif text-2xl tracking-tight text-foreground">arc</span>
          <CornerDownRight className="w-4 h-4 text-primary mt-1 stroke-[2.5]" />
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-background border-r-border/50">
            <div className="p-8 pb-4">
              <div className="flex flex-col gap-1 mb-10">
                <span className="font-serif text-3xl tracking-tight text-foreground flex items-end gap-1">
                  arc <CornerDownRight className="w-5 h-5 text-primary mb-1 stroke-[2.5]" />
                </span>
                <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">Strategist</span>
              </div>
            </div>
            <div className="px-4">
              <NavLinks />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pt-16 md:pt-0 overflow-y-auto bg-card/30">
        <div className="flex-1 p-6 md:p-12 lg:p-16 max-w-5xl w-full mx-auto animate-in fade-in duration-700 slide-in-from-bottom-4">
          {children}
        </div>
      </main>
    </div>
  );
}
