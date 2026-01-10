import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useProjectContract } from "@/hooks/useProjectContract";
import { ContractHeader } from "@/components/contract/ContractHeader";
import { ContractSummaryCards } from "@/components/contract/ContractSummaryCards";
import { ContractServicesTable } from "@/components/contract/ContractServicesTable";
import { ContractConfigCard } from "@/components/contract/ContractConfigCard";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
  const [isEditing, setIsEditing] = useState(!contract?.id);

  const handleSaveAndContinue = async () => {
    if (hasPlanning) {
      setShowPlanningWarning(true);
      return;
    }
    await performSave(true);
  };

  const handleSave = async () => {
    if (hasPlanning) {
      setShowPlanningWarning(true);
      return;
    }
    await performSave(false);
  };

  const performSave = async (navigateToPlanning: boolean) => {
    const success = await saveContract();
    if (success) {
      setIsEditing(false);
      if (navigateToPlanning) {
        navigate("/long-term-planning");
      }
    }
  };

  const confirmSaveWithPlanning = async () => {
    setShowPlanningWarning(false);
    const success = await saveContract();
    if (success) {
      setIsEditing(false);
      toast.info("Planejamento existente pode precisar de ajustes");
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
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
    );
  }

  return (
    <SidebarProvider>
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
            {isEditing && (
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
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
              </div>
            )}
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveWithPlanning}>
              Continuar e Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
