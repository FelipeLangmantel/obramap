import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Building2, Database, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Step1CreateAdmin } from './steps/Step1CreateAdmin';
import { Step2DataDiagnostic } from './steps/Step2DataDiagnostic';
import { Step3SelectCompany } from './steps/Step3SelectCompany';
import { Step4Confirmation } from './steps/Step4Confirmation';
import { Step5Migration } from './steps/Step5Migration';
import { Step6Complete } from './steps/Step6Complete';

export interface OrphanDataCounts {
  projects: number;
  houses: number;
  quadras: number;
  planning_stages: number;
  weekly_productions: number;
  planned_productions: number;
  scope_costs: number;
  suppliers: number;
  financial_entries: number;
  delivery_inspections: number;
  has_orphan_data: boolean;
}

export interface SetupWizardState {
  adminCreated: boolean;
  adminUserId: string | null;
  selectedCompanyId: string | null;
  selectedCompanyName: string | null;
  orphanDataCounts: OrphanDataCounts | null;
  migrationComplete: boolean;
  migrationResults: Record<string, number> | null;
}

interface SystemSetupWizardProps {
  onComplete: () => void;
  needsAdmin: boolean;
  hasOrphanData: boolean;
  orphanCounts: OrphanDataCounts | null;
}

const STEPS = [
  { id: 1, title: 'Criar SYSTEM_ADMIN', icon: Shield },
  { id: 2, title: 'Diagnóstico', icon: Database },
  { id: 3, title: 'Selecionar Empresa', icon: Building2 },
  { id: 4, title: 'Confirmação', icon: AlertTriangle },
  { id: 5, title: 'Migração', icon: Database },
  { id: 6, title: 'Concluído', icon: CheckCircle2 },
];

export const SystemSetupWizard: React.FC<SystemSetupWizardProps> = ({
  onComplete,
  needsAdmin,
  hasOrphanData,
  orphanCounts
}) => {
  const [currentStep, setCurrentStep] = useState(needsAdmin ? 1 : 2);
  const [state, setState] = useState<SetupWizardState>({
    adminCreated: !needsAdmin,
    adminUserId: null,
    selectedCompanyId: null,
    selectedCompanyName: null,
    orphanDataCounts: orphanCounts,
    migrationComplete: false,
    migrationResults: null,
  });

  // Calculate which steps are needed
  const stepsNeeded = STEPS.filter(step => {
    if (step.id === 1 && !needsAdmin) return false;
    if (step.id >= 2 && step.id <= 5 && !hasOrphanData && !needsAdmin) return false;
    if (step.id >= 2 && step.id <= 5 && !hasOrphanData && needsAdmin && step.id !== 6) return false;
    return true;
  });

  const progress = ((currentStep) / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      // Skip data-related steps if no orphan data
      if (currentStep === 1 && !hasOrphanData) {
        setCurrentStep(6);
        setState(prev => ({ ...prev, migrationComplete: true }));
      } else {
        setCurrentStep(prev => prev + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleAdminCreated = (userId: string) => {
    setState(prev => ({
      ...prev,
      adminCreated: true,
      adminUserId: userId
    }));
  };

  const handleCompanySelected = (companyId: string, companyName: string) => {
    setState(prev => ({
      ...prev,
      selectedCompanyId: companyId,
      selectedCompanyName: companyName
    }));
  };

  const handleMigrationComplete = (results: Record<string, number>) => {
    setState(prev => ({
      ...prev,
      migrationComplete: true,
      migrationResults: results
    }));
    setCurrentStep(6);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1CreateAdmin
            onAdminCreated={handleAdminCreated}
            onNext={handleNext}
            isComplete={state.adminCreated}
          />
        );
      case 2:
        return (
          <Step2DataDiagnostic
            orphanCounts={state.orphanDataCounts}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <Step3SelectCompany
            onCompanySelected={handleCompanySelected}
            selectedCompanyId={state.selectedCompanyId}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 4:
        return (
          <Step4Confirmation
            selectedCompanyName={state.selectedCompanyName}
            orphanCounts={state.orphanDataCounts}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 5:
        return (
          <Step5Migration
            selectedCompanyId={state.selectedCompanyId!}
            orphanCounts={state.orphanDataCounts}
            onMigrationComplete={handleMigrationComplete}
          />
        );
      case 6:
        return (
          <Step6Complete
            migrationResults={state.migrationResults}
            onComplete={onComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <Card className="border-2 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="h-10 w-10 text-primary" />
              <CardTitle className="text-3xl font-bold">
                Inicialização do Sistema
              </CardTitle>
            </div>
            <CardDescription className="text-base">
              Configure o ObraMap para operar em modo multiempresa
            </CardDescription>
          </CardHeader>

          {/* Progress Bar */}
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between mb-2">
              {STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = step.id === currentStep;
                const isCompleted = step.id < currentStep;
                
                return (
                  <div 
                    key={step.id} 
                    className={`flex items-center gap-2 ${
                      isActive ? 'text-primary font-medium' : 
                      isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/50'
                    }`}
                  >
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center
                      ${isActive ? 'bg-primary text-primary-foreground' : 
                        isCompleted ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}
                    `}>
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                    </div>
                    <span className="hidden sm:inline text-sm">{step.title}</span>
                    {index < STEPS.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 mx-2 hidden sm:inline" />
                    )}
                  </div>
                );
              })}
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <CardContent className="pt-4">
            {renderStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
