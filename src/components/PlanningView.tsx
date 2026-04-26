import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlannedProductionTab } from "./PlannedProductionTab";
import { WeeklyPlanningFromPeriod } from "./weekly-planning/WeeklyPlanningFromPeriod";
import { TeamRequirementsView } from "./planning/TeamRequirementsView";
import { Calendar, ClipboardList, HardHat } from "lucide-react";
import { useState } from "react";

export function PlanningView() {
  const [tab, setTab] = useState("weekly-from-period");

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="weekly-from-period" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            Planejamento Semanal
          </TabsTrigger>
          <TabsTrigger value="team-requirements" className="gap-1.5">
            <HardHat className="h-4 w-4" />
            Equipe Necessária
          </TabsTrigger>
          <TabsTrigger value="legacy-planning" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Histórico / Análise
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weekly-from-period" className="flex-1 mt-4">
          <WeeklyPlanningFromPeriod />
        </TabsContent>

        <TabsContent value="team-requirements" className="flex-1 mt-4 overflow-auto">
          <TeamRequirementsView />
        </TabsContent>

        <TabsContent value="legacy-planning" className="flex-1 mt-4">
          <PlannedProductionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
