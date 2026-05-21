import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { usePeriodPlanning } from "@/hooks/usePeriodPlanning";
import { ModuleAccessGuard } from "@/components/guards/ModuleAccessGuard";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, DollarSign, Home, TrendingUp, Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PeriodCard } from "@/components/planning/PeriodCard";
import { PeriodServicesDialog } from "@/components/planning/PeriodServicesDialog";
import { CurrentProjectHeaderBadge } from "@/components/CurrentProjectHeaderBadge";

export default function MeasurementPlanningPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, company } = useAuth();
  const { currentProject, isLoading: constructionLoading } = useConstruction();
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    periods,
    selectedPeriod,
    selectedPeriodId,
    periodServices,
    isLoading,
    isLoadingServices,
    overallTotals,
    canEdit,
    selectPeriod,
    changePeriodStatus,
    approvingPeriodId,
    refreshServices,
    deleteService,
    generateSupplies,
    updateServiceHouses,
  } = usePeriodPlanning(currentProject?.id || null);

  const [generatingSuppliesPeriodId, setGeneratingSuppliesPeriodId] = useState<string | null>(null);

  const handleGenerateSupplies = async (periodId: string) => {
    setGeneratingSuppliesPeriodId(periodId);
    await generateSupplies(periodId);
    setGeneratingSuppliesPeriodId(null);
  };

  const validateBeforeClose = useCallback(async (periodId: string): Promise<{ canClose: boolean; warnings: string[] }> => {
    const warnings: string[] = [];

    const { data: servicesWithoutContractor } = await supabase
      .from('weekly_plan_services')
      .select('scope_name, macro_name, planned_houses')
      .eq('planning_period_id', periodId)
      .is('contractor_id', null)
      .gt('planned_houses', 0);

    if (servicesWithoutContractor && servicesWithoutContractor.length > 0) {
      const names = servicesWithoutContractor.map(s => `• ${s.scope_name} (${s.planned_houses} casas)`).join('\n');
      warnings.push(
        `⚠ ${servicesWithoutContractor.length} serviço(s) sem empreiteiro alocado:\n${names}\n\nFechar sem empreiteiro deixa estes serviços sem rastreabilidade de quem executou.`
      );
    }

    return { canClose: true, warnings };
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const handlePeriodClick = (periodId: string) => {
    selectPeriod(periodId);
    setDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (authLoading || constructionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ModuleAccessGuard moduleKey="measurement-planning">
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar activeView="planning" onViewChange={() => navigate("/dashboard")} />

        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 py-3">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors">
                <Menu className="h-6 w-6" />
              </SidebarTrigger>
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold">Planejamento por Período</h1>
            </div>
            <CurrentProjectHeaderBadge />
          </div>

          <div className="p-6 space-y-6">

            {/* Cards de resumo geral */}
            {periods.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Total de Medições
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{periods.length}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      Total de Casas da Obra
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{currentProject?.totalHouses ?? 0}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Custo Total Previsto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(overallTotals.totalCost)}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Resultado Total Previsto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        overallTotals.totalProfit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(overallTotals.totalProfit)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Grid de cards de quinzenas */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            ) : periods.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {periods.map((period) => (
                  <PeriodCard
                    key={period.id}
                    period={period}
                    isSelected={selectedPeriodId === period.id}
                    onClick={() => handlePeriodClick(period.id)}
                    onStatusChange={canEdit ? changePeriodStatus : undefined}
                    onGenerateSupplies={canEdit ? handleGenerateSupplies : undefined}
                    onValidateBeforeClose={canEdit ? validateBeforeClose : undefined}
                    isChangingStatus={approvingPeriodId === period.id}
                    isGeneratingSupplies={generatingSuppliesPeriodId === period.id}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            ) : currentProject ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  Nenhuma medição planejada encontrada.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Crie o planejamento de longo prazo primeiro em{" "}
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => navigate("/long-term-planning")}
                  >
                    Planejamento de Longo Prazo
                  </Button>
                  .
                </p>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">Selecione um projeto para começar.</p>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Dialog de detalhes do período */}
      <PeriodServicesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        period={selectedPeriod}
        services={periodServices}
        isLoading={isLoadingServices}
        canEdit={canEdit}
        projectId={currentProject?.id || ""}
        companyId={company?.id || ""}
        onRefresh={refreshServices}
        onDeleteService={deleteService}
        onUpdateHouses={updateServiceHouses}
      />
      </SidebarProvider>
    </ModuleAccessGuard>
  );
}
