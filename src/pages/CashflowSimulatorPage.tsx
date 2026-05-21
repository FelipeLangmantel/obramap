import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CurrentProjectHeaderBadge } from "@/components/CurrentProjectHeaderBadge";
import CashflowSimulatorView from "@/components/cashflow-simulator/CashflowSimulatorView";
import { Menu } from "lucide-react";
import { useState } from "react";

function SidebarTriggerButton() {
  return (
    <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors">
      <Menu className="h-6 w-6" />
    </SidebarTrigger>
  );
}

export default function CashflowSimulatorPage() {
  const [activeView, setActiveView] = useState<any>("cashflow-simulator");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="min-h-12 flex flex-wrap items-center gap-3 border-b border-border px-4 py-1.5 bg-background">
            <SidebarTriggerButton />
            <div className="flex min-w-0 flex-1 justify-center">
              <CurrentProjectHeaderBadge />
            </div>
          </header>
          <div className="flex-1 p-4 md:p-6 overflow-auto">
            <CashflowSimulatorView />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
