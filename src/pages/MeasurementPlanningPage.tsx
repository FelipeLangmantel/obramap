import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useMeasurementPlanning } from "@/hooks/useMeasurementPlanning";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, TrendingUp, TrendingDown, DollarSign, Target, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeasurementPlanningTable } from "@/components/planning/MeasurementPlanningTable";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleBlockedAlert } from "@/components/ModuleBlockedAlert";

export default function MeasurementPlanningPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, canAccessProject } = useAuth();
  const { projects, currentProject, setCurrentProject, isLoading: constructionLoading } = useConstruction();
  const { canAccessModule } = useProjectSetupFlow();
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>("");
  
  // Verificar se pode acessar o módulo
  const canAccess = canAccessModule("measurement-planning");
  
  const {
    measurements,
    contract,
    targets,
    isLoading,
    isSaving,
    canEdit,
    loadTargets,
    updateTarget,
    saveTargets,
    totals,
  } = useMeasurementPlanning(canAccess ? currentProject?.id || null : null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Filter accessible projects
  const accessibleProjects = projects.filter(p => canAccessProject(p.id));

  // Load targets when measurement changes
  useEffect(() => {
    if (selectedMeasurementId) {
      loadTargets(selectedMeasurementId);
    }
  }, [selectedMeasurementId, loadTargets]);

  const handleProjectChange = (projectId: string) => {
    setCurrentProject(projectId);
    setSelectedMeasurementId("");
  };

  const handleMeasurementChange = (measurementId: string) => {
    setSelectedMeasurementId(measurementId);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusColor = (status: 'success' | 'warning' | 'danger') => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'danger': return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const getStatusIcon = (status: 'success' | 'warning' | 'danger') => {
    switch (status) {
      case 'success': return <TrendingUp className="h-5 w-5" />;
      case 'warning': return <Target className="h-5 w-5" />;
      case 'danger': return <TrendingDown className="h-5 w-5" />;
    }
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
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold">Planejamento por Medição</h1>
            </div>
            
            {canEdit && targets.length > 0 && (
              <Button 
                onClick={saveTargets}
                disabled={isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Salvando..." : "Salvar Planejamento"}
              </Button>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Verificar acesso ao módulo */}
            {!canAccess ? (
              <ModuleBlockedAlert moduleKey="measurement-planning" moduleName="Planejamento por Medição" />
            ) : (
            <>
            {/* Seletores */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px] max-w-[300px]">
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Projeto
                </label>
                <Select
                  value={currentProject?.id || ""}
                  onValueChange={handleProjectChange}
                >
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

              {currentProject && (
                <div className="flex-1 min-w-[200px] max-w-[300px]">
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    Medição
                  </label>
                  <Select
                    value={selectedMeasurementId}
                    onValueChange={handleMeasurementChange}
                    disabled={measurements.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        measurements.length === 0 
                          ? "Nenhuma medição cadastrada" 
                          : "Selecione uma medição"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {measurements.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          Medição {m.measurement_number} 
                          {m.status ? ` (${m.status})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Cards de resumo */}
            {targets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Custo Total Planejado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {formatCurrency(totals.totalCost)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Receita Total Planejada
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {formatCurrency(totals.totalRevenue)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Resultado da Medição
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={cn(
                      "text-2xl font-bold",
                      totals.totalProfit >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {formatCurrency(totals.totalProfit)}
                    </p>
                  </CardContent>
                </Card>

                <Card className={cn("border", getStatusColor(totals.overallStatus as 'success' | 'warning' | 'danger'))}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {getStatusIcon(totals.overallStatus as 'success' | 'warning' | 'danger')}
                      Status Geral
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {totals.overallMargin.toFixed(1)}%
                    </p>
                    <p className="text-xs mt-1">
                      Meta: {contract?.target_margin_percent || 0}%
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tabela de planejamento */}
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : targets.length > 0 ? (
              <MeasurementPlanningTable
                targets={targets}
                canEdit={canEdit}
                onUpdateTarget={updateTarget}
                contractTargetMargin={contract?.target_margin_percent || 0}
              />
            ) : selectedMeasurementId ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  Nenhum serviço encontrado para esta medição.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Configure os serviços da medição primeiro na tela de Planejamento.
                </p>
              </Card>
            ) : currentProject ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  Selecione uma medição para visualizar o planejamento.
                </p>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  Selecione um projeto para começar.
                </p>
              </Card>
            )}
            </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
