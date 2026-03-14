import { useNavigate } from "react-router-dom";
import { usePleData } from "@/hooks/usePleData";
import { PleModuleView } from "@/components/ple/PleModuleView";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleAccessGuard } from "@/components/guards/ModuleAccessGuard";

export default function PleMeasurementsPage() {
  const pleData = usePleData();
  const navigate = useNavigate();

  return (
    <ModuleAccessGuard moduleKey="ple-measurements">
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <AppSidebar activeView="costs" onViewChange={() => navigate("/")} />
          <main className="flex-1 min-w-0 h-full overflow-hidden">
            <PleModuleView {...pleData} />
          </main>
        </div>
      </SidebarProvider>
    </ModuleAccessGuard>
  );
}
