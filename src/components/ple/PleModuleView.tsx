import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, BarChart3, History, Grid3X3, ClipboardList, ArrowLeft, MapPin } from "lucide-react";
import { PleSpreadsheetTab } from "./PleSpreadsheetTab";
import { PleGridTab } from "./PleGridTab";
import { PleChartsTab } from "./PleChartsTab";
import { PleHistoryTab } from "./PleHistoryTab";
import { PleContractTab } from "./PleContractTab";
import { PleHouseMapTab } from "./PleHouseMapTab";
import { PleProjectSetup } from "./PleProjectSetup";
import { PleNewMeasurementDialog } from "./PleNewMeasurementDialog";
import { PleDashboard } from "./PleDashboard";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleModuleView(props: PleDataReturn) {
  const {
    projects, currentProject, currentProjectId, setCurrentProjectId,
    measurements, totals, isLoading,
  } = props;

  const [activeTab, setActiveTab] = useState("spreadsheet");
  const [showNewMeasurement, setShowNewMeasurement] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | "all">("all");

  const selectedMeasurement = selectedMeasurementId !== "all"
    ? measurements.find(m => m.id === selectedMeasurementId) : null;

  if (!currentProjectId || !currentProject) {
    if (showCreateProject) {
      return (
        <div className="h-full flex flex-col">
          <div className="p-3 sm:p-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowCreateProject(false)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
            </Button>
          </div>
          <PleProjectSetup {...props} onCreated={(id) => { setCurrentProjectId(id); setShowCreateProject(false); }} />
        </div>
      );
    }

    return (
      <PleDashboard
        projects={projects}
        onSelectProject={(id) => setCurrentProjectId(id)}
        onCreateProject={() => setShowCreateProject(true)}
      />
    );
  }

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="h-full flex flex-col gap-3 sm:gap-4 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCurrentProjectId(null as any)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="hidden sm:block p-2 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-foreground truncate">Medições do Contrato</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{currentProject.name}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowNewMeasurement(true)} className="shrink-0 text-xs sm:text-sm">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Nova Medição</span>
          </Button>
        </div>

        {/* Filters + Summary */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Medição:</span>
            <Select value={selectedMeasurementId} onValueChange={setSelectedMeasurementId}>
              <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Medições</SelectItem>
                {measurements.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    Medição {m.measurement_number} – {m.period_label || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Projeto:</span>
            <Select value={currentProjectId} onValueChange={setCurrentProjectId}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary badges - scrollable on mobile */}
          <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs overflow-x-auto sm:ml-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-muted-foreground">Contrato:</span>
              <Badge variant="outline" className="font-mono text-amber-500 border-amber-500/30 text-[10px] sm:text-xs">
                {formatCurrency(totals.contractValue)}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-muted-foreground">Medido:</span>
              <Badge variant="outline" className="font-mono text-green-500 border-green-500/30 text-[10px] sm:text-xs">
                {formatCurrency(totals.totalMeasured)}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-muted-foreground">Saldo:</span>
              <Badge variant="outline" className="font-mono text-blue-500 border-blue-500/30 text-[10px] sm:text-xs">
                {formatCurrency(totals.balance)}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-muted-foreground">Avanço:</span>
              <Badge variant="outline" className="font-mono text-primary border-primary/30 text-[10px] sm:text-xs">
                {totals.progress.toFixed(2)}%
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs - scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
          <TabsList className="w-max sm:w-fit">
            <TabsTrigger value="spreadsheet" className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-3">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Planilha de Medição</span>
              <span className="sm:hidden">Planilha</span>
            </TabsTrigger>
            <TabsTrigger value="grid" className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-3">
              <Grid3X3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Lançar Serviços</span>
              <span className="sm:hidden">Lançar</span>
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-3">
              <BarChart3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Gráficos & Avanço</span>
              <span className="sm:hidden">Gráficos</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-3">
              <History className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Histórico / Auditoria</span>
              <span className="sm:hidden">Histórico</span>
            </TabsTrigger>
            <TabsTrigger value="contract" className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-3">
              <ClipboardList className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Lançamento do Contrato</span>
              <span className="sm:hidden">Contrato</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="spreadsheet" className="flex-1 min-h-0 mt-2 sm:mt-3">
          <PleSpreadsheetTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="grid" className="flex-1 min-h-0 mt-2 sm:mt-3">
          <PleGridTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0 mt-2 sm:mt-3">
          <PleChartsTab {...props} />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0 mt-2 sm:mt-3">
          <PleHistoryTab {...props} />
        </TabsContent>
        <TabsContent value="contract" className="flex-1 min-h-0 mt-2 sm:mt-3">
          <PleContractTab {...props} />
        </TabsContent>
      </Tabs>

      {showNewMeasurement && (
        <PleNewMeasurementDialog
          open={showNewMeasurement}
          onClose={() => setShowNewMeasurement(false)}
          nextNumber={props.nextMeasurementNumber}
          onSave={props.createMeasurement}
        />
      )}
    </div>
  );
}
