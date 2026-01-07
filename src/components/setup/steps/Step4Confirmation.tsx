import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, Zap } from 'lucide-react';
import { OrphanDataCounts } from '../SystemSetupWizard';

interface Step4ConfirmationProps {
  selectedCompanyName: string | null;
  orphanCounts: OrphanDataCounts | null;
  onNext: () => void;
  onBack: () => void;
}

export const Step4Confirmation: React.FC<Step4ConfirmationProps> = ({
  selectedCompanyName,
  orphanCounts,
  onNext,
  onBack
}) => {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-6">
      <Alert variant="destructive" className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-lg font-semibold">Ação Irreversível</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            Você está prestes a vincular <strong>permanentemente</strong> todos os dados 
            listados à empresa <strong className="text-primary">{selectedCompanyName}</strong>.
          </p>
          <p className="font-medium">
            Esta ação NÃO poderá ser desfeita.
          </p>
        </AlertDescription>
      </Alert>

      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <h4 className="font-medium">Dados que serão migrados:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          {orphanCounts?.projects && orphanCounts.projects > 0 && (
            <li>• {orphanCounts.projects} obra(s)</li>
          )}
          {orphanCounts?.houses && orphanCounts.houses > 0 && (
            <li>• {orphanCounts.houses} unidade(s)</li>
          )}
          {orphanCounts?.quadras && orphanCounts.quadras > 0 && (
            <li>• {orphanCounts.quadras} quadra(s)</li>
          )}
          {orphanCounts?.planning_stages && orphanCounts.planning_stages > 0 && (
            <li>• {orphanCounts.planning_stages} etapa(s) de planejamento</li>
          )}
          {orphanCounts?.weekly_productions && orphanCounts.weekly_productions > 0 && (
            <li>• {orphanCounts.weekly_productions} produção(ões) semanal(is)</li>
          )}
          {orphanCounts?.scope_costs && orphanCounts.scope_costs > 0 && (
            <li>• {orphanCounts.scope_costs} custo(s) de escopo</li>
          )}
          {orphanCounts?.suppliers && orphanCounts.suppliers > 0 && (
            <li>• {orphanCounts.suppliers} fornecedor(es)</li>
          )}
          {orphanCounts?.financial_entries && orphanCounts.financial_entries > 0 && (
            <li>• {orphanCounts.financial_entries} lançamento(s) financeiro(s)</li>
          )}
          {orphanCounts?.delivery_inspections && orphanCounts.delivery_inspections > 0 && (
            <li>• {orphanCounts.delivery_inspections} vistoria(s) de entrega</li>
          )}
        </ul>
      </div>

      <div className="flex items-start space-x-3 p-4 border rounded-lg bg-card">
        <Checkbox
          id="confirm"
          checked={confirmed}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        <label
          htmlFor="confirm"
          className="text-sm font-medium leading-relaxed cursor-pointer"
        >
          Confirmo que desejo migrar <strong>todos</strong> os dados para a empresa{' '}
          <strong className="text-primary">{selectedCompanyName}</strong> e entendo 
          que esta ação é <strong className="text-destructive">permanente e irreversível</strong>.
        </label>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button 
          onClick={onNext} 
          disabled={!confirmed} 
          variant="destructive"
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          Executar Migração
        </Button>
      </div>
    </div>
  );
};
