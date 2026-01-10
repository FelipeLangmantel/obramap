import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSelector } from "@/components/ProjectSelector";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useLongTermPlanning } from "@/hooks/useLongTermPlanning";
import { LongTermPlanningMatrix } from "@/components/long-term-planning/LongTermPlanningMatrix";
import { PlanningHeader } from "@/components/long-term-planning/PlanningHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LongTermPlanningPage() {
  const navigate = useNavigate();
  const { currentProject } = useConstruction();

  const {
    versions,
    selectedVersionId,
    setSelectedVersionId,
    periods,
    serviceRows,
    loading,
    saving,
    hasChanges,
    updateCellValue,
    periodSummaries,
    overallTotals,
    savePlanning,
    refresh,
  } = useLongTermPlanning(currentProject?.id);

  const handleViewChange = () => {
    // Não faz nada - só para satisfazer o AppSidebar
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeView="planning" onViewChange={handleViewChange} />

        <main className="flex-1 overflow-auto">
          {/* Header */}
          <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-semibold">
                    Planejamento de Longo Prazo
                  </h1>
                </div>
              </div>
              <ProjectSelector />
            </div>
          </header>

          {/* Conteúdo */}
          <div className="p-4 space-y-4">
            {!currentProject ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Selecione um projeto para visualizar o planejamento.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <PlanningHeader
                  versions={versions}
                  selectedVersionId={selectedVersionId}
                  onVersionChange={setSelectedVersionId}
                  overallTotals={overallTotals}
                  hasChanges={hasChanges}
                  saving={saving}
                  onSave={savePlanning}
                  onRefresh={refresh}
                />

                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-96 w-full" />
                  </div>
                ) : versions.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhuma versão de planejamento encontrada. Crie uma versão no módulo de Planejamento Inteligente.
                    </AlertDescription>
                  </Alert>
                ) : periods.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhum período encontrado para esta versão. Crie períodos no módulo de Planejamento Inteligente.
                    </AlertDescription>
                  </Alert>
                ) : serviceRows.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhum serviço encontrado no projeto. Configure os serviços no orçamento executivo.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <LongTermPlanningMatrix
                    periods={periods}
                    serviceRows={serviceRows}
                    periodSummaries={periodSummaries}
                    totalHouses={currentProject.totalHouses}
                    onCellChange={updateCellValue}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
