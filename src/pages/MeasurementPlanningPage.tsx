import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { usePeriodPlanning } from "@/hooks/usePeriodPlanning";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, DollarSign, Home, TrendingUp, Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleBlockedAlert } from "@/components/ModuleBlockedAlert";
import { PeriodCard } from "@/components/planning/PeriodCard";
import { PeriodServicesDialog } from "@/components/planning/PeriodServicesDialog";

export default function MeasurementPlanningPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, canAccessProject } = useAuth();
  const { projects, currentProject, setCurrentProject, isLoading: constructionLoading } = useConstruction();
  const { canAccessModule } = useProjectSetupFlow();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Verificar se pode acessar o módulo
  const canAccess = canAccessModule("measurement-planning");

  const {
    periods,
    selectedPeriod,
    selectedPeriodId,
    periodServices,
    isLoading,
    isLoadingServices,
    overallTotals,
    selectPeriod,
  } = usePeriodPlanning(canAccess ? currentProject?.id || null : null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Filter accessible projects
  const accessibleProjects = projects.filter((p) => canAccessProject(p.id));

  const handleProjectChange = (projectId: string) => {
    setCurrentProject(projectId);
    selectPeriod(null);
  };

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
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar activeView="planning" onViewChange={() => navigate("/")} />

        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 py-3">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors">
                <Menu className="h-6 w-6" />
              </SidebarTrigger>
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold">Planejamento por Período</h1>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Verificar acesso ao módulo */}
            {!canAccess ? (
              <ModuleBlockedAlert moduleKey="measurement-planning" moduleName="Planejamento por Período" />
            ) : (
              <>
                {/* Seletor de projeto */}
                <div className="flex-1 min-w-[200px] max-w-[300px]">
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    Projeto
                  </label>
                  <Select value={currentProject?.id || ""} onValueChange={handleProjectChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {accessibleProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cards de resumo geral */}
                {periods.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Total de Quinzenas
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
                          Total de Casas
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{overallTotals.totalHouses}</p>
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
                      />
                    ))}
                  </div>
                ) : currentProject ? (
                  <Card className="p-12 text-center">
                    <p className="text-muted-foreground">
                      Nenhuma quinzena planejada encontrada.
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
              </>
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
      />
    </SidebarProvider>
  );
}
