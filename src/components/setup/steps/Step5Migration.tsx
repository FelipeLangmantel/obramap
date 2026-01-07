import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, XCircle, Building, Home, Layers, Calendar, DollarSign, Truck, ClipboardCheck } from 'lucide-react';
import { OrphanDataCounts } from '../SystemSetupWizard';

interface MigrationStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'success' | 'error';
  count?: number;
}

interface Step5MigrationProps {
  selectedCompanyId: string;
  orphanCounts: OrphanDataCounts | null;
  onMigrationComplete: (results: Record<string, number>) => void;
}

export const Step5Migration: React.FC<Step5MigrationProps> = ({
  selectedCompanyId,
  orphanCounts,
  onMigrationComplete
}) => {
  const [steps, setSteps] = useState<MigrationStep[]>([
    { id: 'projects', label: 'Obras', icon: <Building className="h-4 w-4" />, status: 'pending' },
    { id: 'houses', label: 'Unidades', icon: <Home className="h-4 w-4" />, status: 'pending' },
    { id: 'quadras', label: 'Quadras', icon: <Layers className="h-4 w-4" />, status: 'pending' },
    { id: 'planning', label: 'Planejamento', icon: <Calendar className="h-4 w-4" />, status: 'pending' },
    { id: 'production', label: 'Produção Semanal', icon: <ClipboardCheck className="h-4 w-4" />, status: 'pending' },
    { id: 'costs', label: 'Custos de Escopo', icon: <DollarSign className="h-4 w-4" />, status: 'pending' },
    { id: 'suppliers', label: 'Fornecedores', icon: <Truck className="h-4 w-4" />, status: 'pending' },
    { id: 'financial', label: 'Fluxo Financeiro', icon: <DollarSign className="h-4 w-4" />, status: 'pending' },
    { id: 'delivery', label: 'Entrega e Pós-Obra', icon: <ClipboardCheck className="h-4 w-4" />, status: 'pending' },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<Record<string, number>>({});

  useEffect(() => {
    runMigration();
  }, []);

  const updateStepStatus = (stepId: string, status: MigrationStep['status'], count?: number) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, count } : step
    ));
  };

  const runMigration = async () => {
    const migrationResults: Record<string, number> = {};

    try {
      // Step 1: Migrate projects (this is the main migration)
      updateStepStatus('projects', 'running');
      const { data: projectData, error: projectError } = await supabase.rpc(
        'migrate_orphan_data_to_company',
        { target_company_id: selectedCompanyId }
      );
      
      if (projectError) throw projectError;
      
      const projectsCount = typeof projectData === 'object' && projectData !== null 
        ? (projectData as Record<string, number>).projects || 0 
        : 0;
      migrationResults['projects'] = projectsCount;
      updateStepStatus('projects', 'success', projectsCount);
      setCurrentStep(1);

      // Steps 2-9: These are linked through project_id, so they're automatically migrated
      // We just show progress for user experience
      const autoLinkedSteps = [
        { id: 'houses', count: orphanCounts?.houses || 0 },
        { id: 'quadras', count: orphanCounts?.quadras || 0 },
        { id: 'planning', count: orphanCounts?.planning_stages || 0 },
        { id: 'production', count: orphanCounts?.weekly_productions || 0 },
        { id: 'costs', count: orphanCounts?.scope_costs || 0 },
        { id: 'suppliers', count: orphanCounts?.suppliers || 0 },
        { id: 'financial', count: orphanCounts?.financial_entries || 0 },
        { id: 'delivery', count: orphanCounts?.delivery_inspections || 0 },
      ];

      for (let i = 0; i < autoLinkedSteps.length; i++) {
        const step = autoLinkedSteps[i];
        updateStepStatus(step.id, 'running');
        
        // Simulate processing time for visual feedback
        await new Promise(resolve => setTimeout(resolve, 300));
        
        migrationResults[step.id] = step.count;
        updateStepStatus(step.id, 'success', step.count);
        setCurrentStep(i + 2);
      }

      setResults(migrationResults);
      onMigrationComplete(migrationResults);
    } catch (error) {
      console.error('Migration error:', error);
      // Mark current step as error
      const currentStepId = steps[currentStep]?.id;
      if (currentStepId) {
        updateStepStatus(currentStepId, 'error');
      }
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Migração em Andamento</h3>
        <p className="text-muted-foreground">
          Aguarde enquanto os dados são migrados para a empresa selecionada.
        </p>
      </div>

      <Progress value={progress} className="h-3" />

      <div className="grid gap-3">
        {steps.map((step) => (
          <Card 
            key={step.id}
            className={`
              transition-all
              ${step.status === 'running' ? 'border-primary bg-primary/5' : ''}
              ${step.status === 'success' ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/10' : ''}
              ${step.status === 'error' ? 'border-red-500/50 bg-red-50/50 dark:bg-red-950/10' : ''}
            `}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`
                p-2 rounded-lg
                ${step.status === 'pending' ? 'bg-muted text-muted-foreground' : ''}
                ${step.status === 'running' ? 'bg-primary/20 text-primary' : ''}
                ${step.status === 'success' ? 'bg-green-100 text-green-600' : ''}
                ${step.status === 'error' ? 'bg-red-100 text-red-600' : ''}
              `}>
                {step.icon}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{step.label}</p>
              </div>
              <div className="flex items-center gap-2">
                {step.count !== undefined && step.status === 'success' && (
                  <span className="text-sm text-muted-foreground">
                    {step.count} item(ns)
                  </span>
                )}
                {step.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full bg-muted" />
                )}
                {step.status === 'running' && (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
                {step.status === 'success' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {step.status === 'error' && (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
