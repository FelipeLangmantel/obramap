import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Calendar } from "lucide-react";
import { PlannedProductionTab } from "./PlannedProductionTab";
import { PlannedVsActualView } from "./PlannedVsActualView";

const TAB_STORAGE_KEY = "obramap_planning_tab";

export function PlanningView() {
  const [activeTab, setActiveTab] = useState<"future" | "comparison">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "future" || saved === "comparison") {
        return saved;
      }
    }
    return "future";
  });

  const handleTabChange = (value: string) => {
    const tab = value as "future" | "comparison";
    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-10">
          <TabsTrigger value="future" className="gap-2 text-sm">
            <Calendar className="w-4 h-4" />
            Produção Futura
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-2 text-sm">
            <Target className="w-4 h-4" />
            Planejado x Realizado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="future" className="flex-1 overflow-auto mt-4">
          <PlannedProductionTab />
        </TabsContent>

        <TabsContent value="comparison" className="flex-1 overflow-auto mt-4">
          <PlannedVsActualView />
        </TabsContent>
      </Tabs>
    </div>
  );
}