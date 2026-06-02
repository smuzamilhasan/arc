import { Link, useLocation } from "wouter";
import { BookOpen, LayoutDashboard, Lightbulb, UserCircle, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/brand", icon: UserCircle, label: "Brand Profile" },
  { href: "/content", icon: BookOpen, label: "Content" },
  { href: "/ideas", icon: Lightbulb, label: "Ideas" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 cursor-pointer font-medium text-sm",
              location === item.href
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-lg">
              N
            </div>
            <span className="font-serif font-semibold text-lg tracking-tight">Narrative.</span>
          </div>
          <NavLinks />
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-background z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-lg">
            N
          </div>
          <span className="font-serif font-semibold text-lg tracking-tight">Narrative.</span>
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-6 bg-sidebar">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-lg">
                N
              </div>
              <span className="font-serif font-semibold text-lg tracking-tight">Narrative.</span>
            </div>
            <NavLinks />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pt-16 md:pt-0 overflow-y-auto">
        <div className="flex-1 p-6 md:p-10 max-w-6xl w-full mx-auto animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
