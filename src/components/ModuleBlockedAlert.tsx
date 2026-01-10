import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Lock, ArrowRight } from "lucide-react";
import { useProjectSetupFlow, STEP_LABELS, ProjectSetupStep } from "@/hooks/useProjectSetupFlow";
import { useNavigate } from "react-router-dom";

interface ModuleBlockedAlertProps {
  moduleKey: string;
  moduleName?: string;
}

// Mapeamento de etapas para ações de navegação
const STEP_NAVIGATION: Partial<Record<ProjectSetupStep, { label: string; path?: string; action?: string }>> = {
  blocks_configured: { label: "Configurar Quadras", action: "quadras" },
  services_defined: { label: "Definir Etapas e Serviços", action: "macros" },
  budget_defined: { label: "Configurar Orçamento", path: "costs" },
  contract_defined: { label: "Definir Contrato", path: "/project-contract" },
  long_term_planned: { label: "Criar Planejamento", path: "/long-term-planning" },
};

export function ModuleBlockedAlert({ moduleKey, moduleName }: ModuleBlockedAlertProps) {
  const navigate = useNavigate();
  const { getBlockedMessage, getRequiredStep, currentStep } = useProjectSetupFlow();
  
  const message = getBlockedMessage(moduleKey);
  const requiredStep = getRequiredStep(moduleKey);
  
  if (!message) return null;

  const navigation = requiredStep ? STEP_NAVIGATION[requiredStep] : null;

  const handleNavigate = () => {
    if (navigation?.path) {
      navigate(navigation.path);
    }
    // Para ações como "quadras" ou "macros", seria necessário um callback
  };

  return (
    <Alert className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
      <Lock className="h-5 w-5 text-yellow-600" />
      <AlertTitle className="text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
        <span>Módulo Bloqueado</span>
        {moduleName && <span className="text-muted-foreground font-normal">— {moduleName}</span>}
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-muted-foreground">
          {message}
        </p>
        
        {requiredStep && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Etapa necessária:</span>
            <span className="font-medium text-foreground">
              {STEP_LABELS[requiredStep]}
            </span>
          </div>
        )}

        {navigation?.path && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNavigate}
            className="mt-2"
          >
            {navigation.label}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Componente wrapper que verifica acesso e exibe bloqueio ou conteúdo
interface ModuleGuardProps {
  moduleKey: string;
  moduleName?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ModuleGuard({ moduleKey, moduleName, children, fallback }: ModuleGuardProps) {
  const { canAccessModule } = useProjectSetupFlow();
  
  if (!canAccessModule(moduleKey)) {
    return fallback || <ModuleBlockedAlert moduleKey={moduleKey} moduleName={moduleName} />;
  }
  
  return <>{children}</>;
}
