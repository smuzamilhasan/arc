import React from "react";
import { Link, useLocation } from "wouter";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter
} from "@/components/ui/sidebar";
import { UserButton } from "@clerk/react";
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  Activity, 
  Plug,
  Target
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background font-sans">
        <Sidebar>
          <SidebarHeader className="px-6 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
                <Target size={18} />
              </div>
              <span className="font-serif text-xl font-bold tracking-tight text-sidebar-foreground">Marketing OS</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-6 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Command Center
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/dashboard" || location === "/"}>
                      <Link href="/dashboard" className="flex items-center gap-3 px-6 py-2">
                        <LayoutDashboard size={18} />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/leads")}>
                      <Link href="/leads" className="flex items-center gap-3 px-6 py-2">
                        <Users size={18} />
                        <span>Leads</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/actions")}>
                      <Link href="/actions" className="flex items-center gap-3 px-6 py-2">
                        <CheckSquare size={18} />
                        <span>Approvals</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-6">
              <SidebarGroupLabel className="px-6 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                System
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/activity")}>
                      <Link href="/activity" className="flex items-center gap-3 px-6 py-2">
                        <Activity size={18} />
                        <span>Activity Feed</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/connections")}>
                      <Link href="/connections" className="flex items-center gap-3 px-6 py-2">
                        <Plug size={18} />
                        <span>Connections</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3 px-2">
              <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8"
                  }
                }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-sidebar-foreground">Operator</span>
                <span className="text-xs text-sidebar-foreground/60">Admin Access</span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-y-auto bg-muted/20">
          <div className="mx-auto max-w-6xl p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}