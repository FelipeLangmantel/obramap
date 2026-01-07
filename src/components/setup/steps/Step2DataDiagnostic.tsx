import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, ArrowRight, Building, Home, Layers, Calendar, DollarSign, Truck, Package, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { OrphanDataCounts } from '../SystemSetupWizard';

interface Step2DataDiagnosticProps {
  orphanCounts: OrphanDataCounts | null;
  onNext: () => void;
  onBack: () => void;
}

const DataCard: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  count: number;
}> = ({ icon, label, count }) => (
  <Card className={`${count > 0 ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10' : 'bg-muted/30'}`}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${count > 0 ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${count > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {count}
        </p>
      </div>
    </CardContent>
  </Card>
);

export const Step2DataDiagnostic: React.FC<Step2DataDiagnosticProps> = ({
  orphanCounts,
  onNext,
  onBack
}) => {
  const totalOrphan = orphanCounts ? (
    orphanCounts.projects + 
    orphanCounts.houses + 
    orphanCounts.planning_stages
  ) : 0;

  return (
    <div className="space-y-6">
      <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Dados encontrados sem empresa vinculada!</strong> Esses dados foram criados 
          antes do modo multiempresa e precisam ser vinculados a uma empresa para 
          continuar acessíveis.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <DataCard 
          icon={<Building className="h-5 w-5" />} 
          label="Obras" 
          count={orphanCounts?.projects || 0} 
        />
        <DataCard 
          icon={<Home className="h-5 w-5" />} 
          label="Unidades" 
          count={orphanCounts?.houses || 0} 
        />
        <DataCard 
          icon={<Layers className="h-5 w-5" />} 
          label="Quadras" 
          count={orphanCounts?.quadras || 0} 
        />
        <DataCard 
          icon={<Calendar className="h-5 w-5" />} 
          label="Etapas de Planejamento" 
          count={orphanCounts?.planning_stages || 0} 
        />
        <DataCard 
          icon={<ClipboardCheck className="h-5 w-5" />} 
          label="Produções Semanais" 
          count={orphanCounts?.weekly_productions || 0} 
        />
        <DataCard 
          icon={<DollarSign className="h-5 w-5" />} 
          label="Custos de Escopo" 
          count={orphanCounts?.scope_costs || 0} 
        />
        <DataCard 
          icon={<Truck className="h-5 w-5" />} 
          label="Fornecedores" 
          count={orphanCounts?.suppliers || 0} 
        />
        <DataCard 
          icon={<DollarSign className="h-5 w-5" />} 
          label="Lançamentos Financeiros" 
          count={orphanCounts?.financial_entries || 0} 
        />
        <DataCard 
          icon={<Package className="h-5 w-5" />} 
          label="Vistorias de Entrega" 
          count={orphanCounts?.delivery_inspections || 0} 
        />
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={onNext} className="gap-2">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
