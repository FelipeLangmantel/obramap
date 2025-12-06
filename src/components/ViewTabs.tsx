import { useState } from "react";
import { Map, BarChart3, Settings2, Building, ClipboardList } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ManageMacrosDialog } from "./ManageMacrosDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";

interface ViewTabsProps {
  activeView: "map" | "charts" | "production";
  onViewChange: (view: "map" | "charts" | "production") => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const [showManageMacros, setShowManageMacros] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tabs value={activeView} onValueChange={(v) => onViewChange(v as "map" | "charts" | "production")}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="map" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Map className="w-4 h-4" />
            Mapa
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="w-4 h-4" />
            Gráficos
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ClipboardList className="w-4 h-4" />
            Produção
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setShowManageMacros(true)}
        className="gap-2"
      >
        <Settings2 className="w-4 h-4" />
        <span className="hidden sm:inline">Gerenciar Etapas</span>
      </Button>

      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setShowProjectSettings(true)}
        className="gap-2"
      >
        <Building className="w-4 h-4" />
        <span className="hidden sm:inline">Cadastro da Obra</span>
      </Button>

      <ManageMacrosDialog open={showManageMacros} onOpenChange={setShowManageMacros} />
      <ProjectSettingsDialog open={showProjectSettings} onOpenChange={setShowProjectSettings} />
    </div>
  );
}
