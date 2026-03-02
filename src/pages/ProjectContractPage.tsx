import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useProjectContract } from "@/hooks/useProjectContract";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { ContractHeader } from "@/components/contract/ContractHeader";
import { ContractSummaryCards } from "@/components/contract/ContractSummaryCards";
import { ContractServicesTable } from "@/components/contract/ContractServicesTable";
import { ContractConfigCard } from "@/components/contract/ContractConfigCard";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowRight, AlertTriangle, Edit } from "lucide-react";
import { toast } from "sonner";
import { ModuleAccessGuard } from "@/components/guards/ModuleAccessGuard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ProjectContractPage() {
  const navigate = useNavigate();
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const { advanceToStep, currentStep } = useProjectSetupFlow();

  const {
    contract,
    setContract,
    services,
    loading,
    saving,
    hasPlanning,
    totals,
    updateServiceValue,
    updateCostTarget,
    saveContract,
  } = useProjectContract();

  const [showPlanningWarning, setShowPlanningWarning] = useState(false);
  const [pendingNavigate, setPendingNavigate] = useState(false);
  
  // ✅ isEditing: true se não tem contrato salvo, false se já tem
  const [isEditing, setIsEditing] = useState(true);
  
  // Atualizar estado de edição quando contrato carregar
  useEffect(() => {
    if (!loading && contract) {
      // Se já tem contrato salvo, começa em modo visualização
      setIsEditing(!contract.id);
    }
  }, [loading, contract?.id]);

  const handleSaveAndContinue = async () => {
    if (hasPlanning) {
      setPendingNavigate(true);
      setShowPlanningWarning(true);
      return;
    }
    await performSave(true);
  };

  const handleSave = async () => {
    if (hasPlanning) {
      setPendingNavigate(false);
      setShowPlanningWarning(true);
      return;
    }
    await performSave(false);
  };

  const performSave = async (navigateToPlanning: boolean) => {
    const success = await saveContract();
    if (success) {
      setIsEditing(false);
      
      // ✅ Avançar setup_step para contract_defined (libera long-term-planning)
      if (currentStep !== "contract_defined" && currentStep !== "long_term_planned") {
        await advanceToStep("contract_defined");
        toast.success("Contrato salvo! Planejamento de Longo Prazo liberado.");
      }
      
      if (navigateToPlanning) {
        navigate("/long-term-planning");
      }
    }
  };

  const confirmSaveWithPlanning = async () => {
    setShowPlanningWarning(false);
    const shouldNavigate = pendingNavigate;
    setPendingNavigate(false);
    
    const success = await saveContract();
    if (success) {
      setIsEditing(false);
      
      // ✅ Avançar setup_step para contract_defined
      if (currentStep !== "contract_defined" && currentStep !== "long_term_planned") {
        await advanceToStep("contract_defined");
      }
      
      toast.info("Contrato atualizado. Planejamento existente pode precisar de ajustes.");
      
      if (shouldNavigate) {
        navigate("/long-term-planning");
      }
    }
  };


  if (loading) {
    return (
      <ModuleAccessGuard moduleKey="project-contract">
        <SidebarProvider defaultOpen={true}>
          <div className="flex min-h-screen w-full bg-background">
            <AppSidebar activeView="costs" onViewChange={() => {}} />
            <SidebarInset className="flex-1">
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-muted-foreground">Carregando contrato...</p>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </ModuleAccessGuard>
    );
  }

  return (
    <ModuleAccessGuard moduleKey="project-contract">
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar activeView="costs" onViewChange={() => {}} />
        <SidebarInset className="flex-1">
          <div className="container mx-auto py-6 px-4 space-y-6 max-w-7xl">
            <ContractHeader 
              isEditing={isEditing} 
              onEdit={() => setIsEditing(true)} 
              hasContract={!!contract?.id}
            />

            {/* Summary Cards */}
            <ContractSummaryCards totals={totals} costPercent={contract?.cost_target_percent || 70} />

            {/* Contract Configuration */}
            <ContractConfigCard
              contract={contract}
              setContract={setContract}
              updateCostTarget={updateCostTarget}
              isEditing={isEditing}
            />

            {/* Services Table */}
            <ContractServicesTable
              services={services}
              updateServiceValue={updateServiceValue}
              isEditing={isEditing}
              costPercent={contract?.cost_target_percent || 70}
            />

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              {!isEditing && contract?.id && canEdit && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Contrato
                </Button>
              )}
              
              {isEditing && canEdit && (
                <>
                  {contract?.id && (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    variant="secondary"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Contrato
                  </Button>
                  <Button
                    onClick={handleSaveAndContinue}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Salvar e Ir para Planejamento
                  </Button>
                </>
              )}
              
              {!isEditing && contract?.id && (
                <Button
                  onClick={() => navigate("/long-term-planning")}
                  className="bg-primary hover:bg-primary/90"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Ir para Planejamento
                </Button>
              )}
            </div>
          </div>
        </SidebarInset>
      </div>

      {/* Warning Dialog */}
      <AlertDialog open={showPlanningWarning} onOpenChange={setShowPlanningWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Planejamento já iniciado
            </AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um planejamento para este projeto. Alterações no contrato
              podem impactar o planejamento e os cálculos de suprimentos existentes.
              Deseja continuar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavigate(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveWithPlanning}>
              Continuar e Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </SidebarProvider>
    </ModuleAccessGuard>
  );
}
