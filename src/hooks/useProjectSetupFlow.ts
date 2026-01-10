import { useCallback, useMemo } from "react";
import { useConstruction, ProjectSetupStep } from "@/contexts/ConstructionContext";

// Re-export for convenience
export type { ProjectSetupStep } from "@/contexts/ConstructionContext";

// Ordem hierárquica das etapas
const STEP_ORDER: ProjectSetupStep[] = [
  "project_created",
  "blocks_configured",
  "services_defined",
  "budget_defined",
  "contract_defined",
  "long_term_planned",
];

// Mapeamento de módulos para etapa mínima necessária
const MODULE_REQUIREMENTS: Record<string, ProjectSetupStep> = {
  // Sempre disponível após criação
  "quadras": "project_created",
  "houses": "project_created",
  
  // Disponível após quadras/casas configuradas
  "map": "blocks_configured",
  "interactive-map": "blocks_configured",
  "3d-map": "blocks_configured",
  "charts": "blocks_configured",
  "macros": "blocks_configured",
  "services": "blocks_configured",
  
  // Disponível após serviços definidos
  "costs": "services_defined",
  "budget": "services_defined",
  
  // Disponível após orçamento definido
  "production": "budget_defined",
  "project-contract": "budget_defined",
  
  // Disponível após contrato definido
  "long-term-planning": "contract_defined",
  
  // Disponível após planejamento de longo prazo
  "measurement-planning": "long_term_planned",
  "planning": "long_term_planned",
  "supplies": "long_term_planned",
  "smart-planning": "long_term_planned",
  
  // Módulos financeiros disponíveis após contrato
  "financial-flow": "contract_defined",
  "board-decisions": "contract_defined",
  
  // Entrega disponível após produção iniciada
  "delivery": "budget_defined",
  
  // Cadastros gerais sempre disponíveis
  "inputs": "project_created",
  "suppliers": "project_created",
};

// Mensagens amigáveis para cada pré-requisito
const PREREQUISITE_MESSAGES: Record<ProjectSetupStep, string> = {
  project_created: "Cadastre uma obra primeiro.",
  blocks_configured: "Configure as quadras e casas da obra.",
  services_defined: "Defina as etapas e serviços da obra.",
  budget_defined: "Configure o orçamento/custos da obra.",
  contract_defined: "Defina o contrato da obra.",
  long_term_planned: "Crie o planejamento de longo prazo.",
};

// Labels das etapas
export const STEP_LABELS: Record<ProjectSetupStep, string> = {
  project_created: "Obra Cadastrada",
  blocks_configured: "Quadras e Casas",
  services_defined: "Etapas e Serviços",
  budget_defined: "Orçamento",
  contract_defined: "Contrato",
  long_term_planned: "Planejamento",
};

export interface ProjectSetupFlowResult {
  // Estado atual
  currentStep: ProjectSetupStep | null;
  stepIndex: number;
  
  // Verificações
  canAccessModule: (moduleKey: string) => boolean;
  getBlockedMessage: (moduleKey: string) => string | null;
  isStepComplete: (step: ProjectSetupStep) => boolean;
  
  // Avanço de etapas
  advanceToStep: (step: ProjectSetupStep) => Promise<boolean>;
  
  // Helpers
  getNextStep: () => ProjectSetupStep | null;
  getRequiredStep: (moduleKey: string) => ProjectSetupStep | null;
  allSteps: typeof STEP_ORDER;
}

export function useProjectSetupFlow(): ProjectSetupFlowResult {
  const { currentProject, advanceSetupStep } = useConstruction();

  // Etapa atual do projeto
  const currentStep = useMemo((): ProjectSetupStep | null => {
    if (!currentProject) return null;
    return currentProject.setupStep || "project_created";
  }, [currentProject]);

  // Índice da etapa atual
  const stepIndex = useMemo(() => {
    if (!currentStep) return -1;
    return STEP_ORDER.indexOf(currentStep);
  }, [currentStep]);

  // Verificar se uma etapa está completa
  const isStepComplete = useCallback((step: ProjectSetupStep): boolean => {
    const requiredIndex = STEP_ORDER.indexOf(step);
    return stepIndex >= requiredIndex;
  }, [stepIndex]);

  // Verificar se pode acessar um módulo
  const canAccessModule = useCallback((moduleKey: string): boolean => {
    if (!currentProject) return false;
    
    const requiredStep = MODULE_REQUIREMENTS[moduleKey];
    if (!requiredStep) return true; // Módulo não mapeado = sempre disponível
    
    return isStepComplete(requiredStep);
  }, [currentProject, isStepComplete]);

  // Obter mensagem de bloqueio para um módulo
  const getBlockedMessage = useCallback((moduleKey: string): string | null => {
    if (!currentProject) return "Selecione uma obra primeiro.";
    if (canAccessModule(moduleKey)) return null;
    
    const requiredStep = MODULE_REQUIREMENTS[moduleKey];
    if (!requiredStep) return null;
    
    return PREREQUISITE_MESSAGES[requiredStep];
  }, [currentProject, canAccessModule]);

  // Obter etapa requerida para um módulo
  const getRequiredStep = useCallback((moduleKey: string): ProjectSetupStep | null => {
    return MODULE_REQUIREMENTS[moduleKey] || null;
  }, []);

  // Obter próxima etapa
  const getNextStep = useCallback((): ProjectSetupStep | null => {
    if (stepIndex < 0) return null;
    if (stepIndex >= STEP_ORDER.length - 1) return null;
    return STEP_ORDER[stepIndex + 1];
  }, [stepIndex]);

  // Avançar para uma etapa específica (usa a função do contexto)
  const advanceToStep = useCallback(async (step: ProjectSetupStep): Promise<boolean> => {
    return advanceSetupStep(step);
  }, [advanceSetupStep]);

  return {
    currentStep,
    stepIndex,
    canAccessModule,
    getBlockedMessage,
    isStepComplete,
    advanceToStep,
    getNextStep,
    getRequiredStep,
    allSteps: STEP_ORDER,
  };
}
