import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSelector } from "@/components/ProjectSelector";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useLongTermPlanning } from "@/hooks/useLongTermPlanning";
import { LongTermPlanningMatrix } from "@/components/long-term-planning/LongTermPlanningMatrix";
import { PlanningHeader } from "@/components/long-term-planning/PlanningHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { supabase } from "@/integrations/supabase/client";
import { ModuleAccessGuard } from "@/components/guards/ModuleAccessGuard";

export default function LongTermPlanningPage() {
  const navigate = useNavigate();
  const { currentProject } = useConstruction();
  const { currentStep, advanceToStep } = useProjectSetupFlow();

  const {
    activeVersion,
    periods,
    serviceRows,
    loading,
    initializing,
    saving,
    hasChanges,
    initError,
    updateCellValue,
    periodSummaries,
    overallTotals,
    totalHouses,
    savePlanning,
    refresh,
    retryInit,
    addPeriod,
    deletePeriod,
    updatePeriodDates,
  } = useLongTermPlanning(currentProject?.id);

  // ✅ Auto-correção: se o contrato existe mas o setup_step não avançou,
  // avançar para atualização informativa (mantido para consistência de dados)
  useEffect(() => {
    const run = async () => {
      if (!currentProject?.id) return;
      if (currentStep !== "budget_defined") return;

      const { count } = await supabase
        .from("project_contracts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", currentProject.id);

      if ((count ?? 0) > 0) {
        await advanceToStep("contract_defined");
      }
    };

    run();
  }, [currentProject?.id, currentStep, advanceToStep]);

  const handleViewChange = () => {
    // Não faz nada - só para satisfazer o AppSidebar
  };

  return (
    <ModuleAccessGuard moduleKey="long-term-planning">
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
            ) : initializing ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  Inicializando planejamento do projeto...
                </p>
              </div>
            ) : initError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao inicializar planejamento</AlertTitle>
                <AlertDescription className="mt-2">
                  <p>{initError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={retryInit}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : !activeVersion ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhuma versão de planejamento encontrada.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <PlanningHeader
                  activeVersion={activeVersion}
                  overallTotals={overallTotals}
                  totalHouses={totalHouses}
                  hasChanges={hasChanges}
                  saving={saving}
                  onSave={savePlanning}
                  onRefresh={refresh}
                  onAddPeriod={addPeriod}
                />

                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-96 w-full" />
                  </div>
                ) : periods.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhum período encontrado para esta versão.
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
                    totalHouses={totalHouses}
                    onCellChange={updateCellValue}
                    onDeletePeriod={deletePeriod}
                    onUpdatePeriodDates={updatePeriodDates}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
      </SidebarProvider>
    </ModuleAccessGuard>
  );
}
