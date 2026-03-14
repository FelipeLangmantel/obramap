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
import { PleContractInfoTab } from "./PleContractInfoTab";
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
  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
    return formatCurrency(v);
  };

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-3 p-2 sm:p-4">
      {/* Header - compact on mobile */}
      <div className="flex flex-col gap-1.5 sm:gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" onClick={() => setCurrentProjectId(null as any)}>
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <div className="hidden sm:block p-2 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-lg font-bold text-foreground truncate">Medições do Contrato</h1>
              <p className="text-[9px] sm:text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{currentProject.name}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowNewMeasurement(true)} className="shrink-0 text-[10px] sm:text-sm h-7 sm:h-9 px-2 sm:px-3">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline ml-1">Nova Medição</span>
          </Button>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2">
          <Select value={selectedMeasurementId} onValueChange={setSelectedMeasurementId}>
            <SelectTrigger className="w-full sm:w-[200px] h-7 sm:h-8 text-[10px] sm:text-xs">
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

          <div className="hidden sm:flex items-center gap-2">
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
        </div>

        {/* Summary badges - grid on mobile for better layout */}
        <div className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:gap-4 text-[9px] sm:text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 items-center text-center">
            <span className="text-muted-foreground text-[8px] sm:text-xs">Contrato</span>
            <Badge variant="outline" className="font-mono text-amber-500 border-amber-500/30 text-[8px] sm:text-xs px-1 sm:px-2.5">
              <span className="sm:hidden">{formatCompact(totals.contractValue)}</span>
              <span className="hidden sm:inline">{formatCurrency(totals.contractValue)}</span>
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 items-center text-center">
            <span className="text-muted-foreground text-[8px] sm:text-xs">Medido</span>
            <Badge variant="outline" className="font-mono text-green-500 border-green-500/30 text-[8px] sm:text-xs px-1 sm:px-2.5">
              <span className="sm:hidden">{formatCompact(totals.totalMeasured)}</span>
              <span className="hidden sm:inline">{formatCurrency(totals.totalMeasured)}</span>
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 items-center text-center">
            <span className="text-muted-foreground text-[8px] sm:text-xs">Saldo</span>
            <Badge variant="outline" className="font-mono text-blue-500 border-blue-500/30 text-[8px] sm:text-xs px-1 sm:px-2.5">
              <span className="sm:hidden">{formatCompact(totals.balance)}</span>
              <span className="hidden sm:inline">{formatCurrency(totals.balance)}</span>
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1 items-center text-center">
            <span className="text-muted-foreground text-[8px] sm:text-xs">Avanço</span>
            <Badge variant="outline" className="font-mono text-primary border-primary/30 text-[8px] sm:text-xs px-1 sm:px-2.5">
              {totals.progress.toFixed(2)}%
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0 pb-0.5">
          <TabsList className="w-max sm:w-fit h-8 sm:h-10">
            <TabsTrigger value="spreadsheet" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Planilha
            </TabsTrigger>
            <TabsTrigger value="grid" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <Grid3X3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Lançar
            </TabsTrigger>
            <TabsTrigger value="housemap" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Mapa
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <BarChart3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Gráficos
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <History className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="contract" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <ClipboardList className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Orçamento
            </TabsTrigger>
            <TabsTrigger value="contrato" className="gap-1 text-[9px] sm:text-xs px-1.5 sm:px-3 h-6 sm:h-8">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Contrato
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="spreadsheet" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleSpreadsheetTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="grid" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleGridTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="housemap" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleHouseMapTab {...props} />
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleChartsTab {...props} />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleHistoryTab {...props} />
        </TabsContent>
        <TabsContent value="contract" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleContractTab {...props} />
        </TabsContent>
        <TabsContent value="contrato" className="flex-1 min-h-0 mt-1.5 sm:mt-3">
          <PleContractInfoTab {...props} />
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
