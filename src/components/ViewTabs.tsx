import { Map, BarChart3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ViewTabsProps {
  activeView: "map" | "charts";
  onViewChange: (view: "map" | "charts") => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  return (
    <Tabs value={activeView} onValueChange={(v) => onViewChange(v as "map" | "charts")}>
      <TabsList className="bg-card border border-border">
        <TabsTrigger value="map" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Map className="w-4 h-4" />
          Mapa
        </TabsTrigger>
        <TabsTrigger value="charts" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <BarChart3 className="w-4 h-4" />
          Gráficos
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
