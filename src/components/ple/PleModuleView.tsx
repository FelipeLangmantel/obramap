import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, BarChart3, History, Grid3X3, Settings } from "lucide-react";
import { PleSpreadsheetTab } from "./PleSpreadsheetTab";
import { PleGridTab } from "./PleGridTab";
import { PleChartsTab } from "./PleChartsTab";
import { PleHistoryTab } from "./PleHistoryTab";
import { PleProjectSetup } from "./PleProjectSetup";
import { PleNewMeasurementDialog } from "./PleNewMeasurementDialog";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleModuleView(props: PleDataReturn) {
  const {
    projects, currentProject, currentProjectId, setCurrentProjectId,
    measurements, totals, isLoading,
  } = props;

  const [activeTab, setActiveTab] = useState("spreadsheet");
  const [showNewMeasurement, setShowNewMeasurement] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | "all">("all");

  const selectedMeasurement = selectedMeasurementId !== "all"
    ? measurements.find(m => m.id === selectedMeasurementId) : null;

  if (!currentProjectId || !currentProject) {
    return (
      <div className="h-full flex flex-col">
        <PleProjectSetup {...props} onCreated={(id) => setCurrentProjectId(id)} />
      </div>
    );
  }

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Módulo de Medições do Contrato</h1>
              <p className="text-xs text-muted-foreground">{currentProject.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}>
              <Settings className="h-4 w-4 mr-1" /> Configurar
            </Button>
            <Button size="sm" onClick={() => setShowNewMeasurement(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Medição
            </Button>
          </div>
        </div>

        {/* Filters + Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Medição:</span>
            <Select value={selectedMeasurementId} onValueChange={setSelectedMeasurementId}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
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

          <div className="flex items-center gap-2">
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

          <div className="ml-auto flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Contrato:</span>
              <Badge variant="outline" className="font-mono text-amber-500 border-amber-500/30">
                {formatCurrency(totals.contractValue)}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Medido:</span>
              <Badge variant="outline" className="font-mono text-green-500 border-green-500/30">
                {formatCurrency(totals.totalMeasured)}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Saldo:</span>
              <Badge variant="outline" className="font-mono text-blue-500 border-blue-500/30">
                {formatCurrency(totals.balance)}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Avanço:</span>
              <Badge variant="outline" className="font-mono text-primary border-primary/30">
                {totals.progress.toFixed(2)}%
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="spreadsheet" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Planilha de Medição
            {props.events.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{props.events.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="grid" className="gap-1.5 text-xs">
            <Grid3X3 className="h-3.5 w-3.5" /> Lançar Serviços
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Gráficos & Avanço
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" /> Histórico / Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spreadsheet" className="flex-1 min-h-0 mt-3">
          <PleSpreadsheetTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="grid" className="flex-1 min-h-0 mt-3">
          <PleGridTab {...props} selectedMeasurement={selectedMeasurement} />
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0 mt-3">
          <PleChartsTab {...props} />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0 mt-3">
          <PleHistoryTab {...props} />
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

      {showSetup && (
        <PleProjectSetup {...props} onCreated={() => {}} isDialog open={showSetup} onClose={() => setShowSetup(false)} />
      )}
    </div>
  );
}
