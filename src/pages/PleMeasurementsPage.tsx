import { useNavigate } from "react-router-dom";
import { usePleData } from "@/hooks/usePleData";
import { PleModuleView } from "@/components/ple/PleModuleView";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleAccessGuard } from "@/components/guards/ModuleAccessGuard";
import { Menu } from "lucide-react";

export default function PleMeasurementsPage() {
  const pleData = usePleData();
  const navigate = useNavigate();

  return (
    <ModuleAccessGuard moduleKey="ple-measurements">
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden bg-background">
          <AppSidebar activeView="costs" onViewChange={() => navigate("/dashboard")} />
          <SidebarInset className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            {/* Header bar with sidebar trigger (matches other modules) */}
            <header className="min-h-10 sm:min-h-12 flex flex-wrap items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-2 sm:px-3 py-1.5 shrink-0">
              <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Medições do Contrato</span>
            </header>
            <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
              <PleModuleView {...pleData} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ModuleAccessGuard>
  );
}
